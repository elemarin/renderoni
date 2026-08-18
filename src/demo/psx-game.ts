/**
 * Renderoni Showcase: Echoes of Blackwood
 *
 * Atmospheric 1st-Person PSX Survival Horror:
 * - 1st-Person FPS Controller (smooth mouse look, head bob, sprint, footstep audio)
 * - Held 3D Flashlight with dynamic volumetric cone and battery toggle (F)
 * - Gothic Victorian Manor: Grand Foyer, Library, Gallery, and Secret Study
 * - Lightning storm flashes & flickering torch sconces
 * - Multi-stage narrative puzzle:
 *   1. Inspect the Clockmaker's Journal on the study desk (Clue: 11:45)
 *   2. Find the Clock Winding Key in the East Gallery
 *   3. Wind the Grandfather Clock to 11:45 to slide open the secret bookcase
 *   4. Retrieve the Blackwood Crest from the secret altar
 *   5. Unlock the grand iron gate and escape!
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RenderoniEngine } from '../core/engine.js';
import { sfx } from './audio-sfx.js';

export interface PsxTelemetry {
  playerPos: [number, number, number];
  questStatus: string;
  hasKey: boolean;
  hasCrest: boolean;
  clockSolved: boolean;
  gateUnlocked: boolean;
  flashlightOn: boolean;
  inspectingText: string | null;
}

export class PsxGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;

  // 1st-Person Controls & Camera
  private camera!: THREE.PerspectiveCamera;
  private yawObject = new THREE.Object3D();
  private pitchObject = new THREE.Object3D();
  private playerBody!: RAPIER.RigidBody;
  private playerCollider!: RAPIER.Collider;
  private characterController!: RAPIER.KinematicCharacterController;

  private isLocked = false;
  private keys: Record<string, boolean> = {};
  private mouseSensitivity = 0.0022;

  // Head Bob & Footsteps
  private headBobTimer = 0;
  private lastFootstepStep = 0;

  // Flashlight
  private flashlightGroup = new THREE.Group();
  private flashlightSpot!: THREE.SpotLight;
  private flashlightAmbient!: THREE.PointLight;
  private isFlashlightOn = true;

  // Environment Elements
  private torches: Array<{ light: THREE.PointLight; baseIntensity: number; mesh: THREE.Mesh }> = [];
  private thunderTimer = 0;
  private lightningLight!: THREE.DirectionalLight;
  private pendulumMesh: THREE.Mesh | null = null;
  private clockHands: { hour: THREE.Mesh; minute: THREE.Mesh } | null = null;
  private secretBookcase: THREE.Group | null = null;
  private gateLeftDoor: THREE.Mesh | null = null;
  private gateRightDoor: THREE.Mesh | null = null;
  private keyMesh: THREE.Mesh | null = null;
  private crestMesh: THREE.Mesh | null = null;

  // Game State
  private hasKey = false;
  private hasCrest = false;
  private clockSolved = false;
  private gateUnlocked = false;
  private bookcaseOpenProgress = 0;
  private gateOpenProgress = 0;
  private inspectingText: string | null = null;
  private inspectCardTimeout: any = null;
  private unbind: Array<() => void> = [];

  // Raycaster for object interaction
  private raycaster = new THREE.Raycaster();
  private interactables: Array<{
    id: string;
    object: THREE.Object3D;
    prompt: string;
    onInteract: () => void;
  }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -18.0, 0],
      loop: {
        enabled: true,
        title: 'Echoes of Blackwood',
        subtitle: 'Read the journal, wind the clock, take the crest, walk out the gate.',
      },
    });
  }

  async init(): Promise<void> {
    await this.engine.init({ gravity: [0, -18.0, 0] });

    const scene = this.engine.native.scene;
    this.camera = this.engine.native.camera;
    this.camera.fov = 72;
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x06080d);
    scene.fog = new THREE.FogExp2(0x06080d, 0.045);

    // 1. Setup 1st-Person Camera Rig
    this.setupFirstPersonRig();

    // 2. Setup Lighting & Atmosphere
    this.setupLighting();

    // 3. Build Victorian Manor Architecture
    this.buildManor();

    // 4. Setup Flashlight
    this.setupFlashlight();

    // 5. Setup Interactive Puzzles
    this.setupPuzzles();

    // 6. Action Handlers for Agent Inspector
    this.setupActions();

    // 7. Input Event Listeners
    this.setupInput();
    this.engine.loop.onReset(() => this.resetMatch());

    // Start presentation loop
    this.engine.start((dt) => this.update(dt));
  }

  private setupFirstPersonRig(): void {
    const scene = this.engine.native.scene;

    // Start in Grand Foyer
    const startPos = [0, 1.7, 6];

    // Hierarchy: Scene -> YawObject -> PitchObject -> Camera
    this.yawObject.position.set(startPos[0], startPos[1], startPos[2]);
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(this.camera);
    this.camera.position.set(0, 0.7, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.quaternion.identity();
    scene.add(this.yawObject);

    // Create Rapier Kinematic Position Body & Capsule Collider
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(startPos[0], startPos[1], startPos[2]);
    this.playerBody = this.engine.native.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(0.6, 0.35);
    this.playerCollider = this.engine.native.world.createCollider(colliderDesc, this.playerBody);

    this.characterController = this.engine.native.world.createCharacterController(0.02);
    this.characterController.enableAutostep(0.4, 0.2, true);
    this.characterController.enableSnapToGround(0.3);
    this.characterController.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.characterController.setApplyImpulsesToDynamicBodies(false);
  }

  private setupLighting(): void {
    const scene = this.engine.native.scene;

    // Ambient Moonlight
    const ambient = new THREE.AmbientLight(0x1e293b, 0.4);
    scene.add(ambient);

    // Stained-Glass Window Lightning Light
    this.lightningLight = new THREE.DirectionalLight(0x93c5fd, 0.0);
    this.lightningLight.position.set(15, 20, 5);
    scene.add(this.lightningLight);

    // Torch Sconces in Hallways
    const torchPositions: Array<[number, number, number]> = [
      [-2.2, 2.4, 6],
      [2.2, 2.4, 6],
      [-2.2, 2.4, -2],
      [2.2, 2.4, -2],
      [-2.2, 2.4, -12],
      [2.2, 2.4, -12],
      [-2.2, 2.4, -22],
      [2.2, 2.4, -22],
    ];

    torchPositions.forEach((pos) => {
      const torchGroup = new THREE.Group();
      torchGroup.position.set(pos[0], pos[1], pos[2]);

      // Sconce Bracket
      const bracketMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.4 });
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.3), bracketMat);
      torchGroup.add(bracket);

      // Flame Mesh
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), flameMat);
      flame.position.set(0, 0.2, 0.15);
      torchGroup.add(flame);

      // Warm Amber Torch Light
      const torchLight = new THREE.PointLight(0xf59e0b, 1.8, 10, 1.6);
      torchLight.position.set(0, 0.25, 0.25);
      torchGroup.add(torchLight);

      scene.add(torchGroup);
      this.torches.push({ light: torchLight, baseIntensity: 1.8, mesh: flame });
    });
  }

  private setupFlashlight(): void {
    // Flashlight casing (rendered in camera view space)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 12), bodyMat);
    barrel.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.045, 0.09, 12), bodyMat);
    head.position.set(0, 0, -0.16);
    head.rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), lensMat);
    lens.position.set(0, 0, -0.21);

    this.flashlightGroup.add(barrel, head, lens);
    this.flashlightGroup.position.set(0.32, -0.25, -0.5); // Handheld lower-right
    this.camera.add(this.flashlightGroup);

    // Volumetric Spot Light
    this.flashlightSpot = new THREE.SpotLight(0xfffbeb, 4.5, 24, Math.PI / 6, 0.35, 1.2);
    this.flashlightSpot.position.set(0, 0, -0.22);
    this.flashlightSpot.target.position.set(0, 0, -5);
    this.flashlightGroup.add(this.flashlightSpot);
    this.flashlightGroup.add(this.flashlightSpot.target);

    // Soft Hand Ambient Bounce
    this.flashlightAmbient = new THREE.PointLight(0xfef08a, 0.4, 3);
    this.flashlightAmbient.position.set(0, 0, -0.2);
    this.flashlightGroup.add(this.flashlightAmbient);
  }

  private roomBox(cx: number, cz: number, w: number, d: number, floorMat: THREE.Material, ceilMat: THREE.Material): void {
    const scene = this.engine.native.scene;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), floorMat);
    floor.position.set(cx, -0.2, cz);
    scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), ceilMat);
    ceil.position.set(cx, 5, cz);
    scene.add(ceil);
    this.addStaticCollider(cx, -0.2, cz, w / 2, 0.2, d / 2);
    this.addStaticCollider(cx, 5, cz, w / 2, 0.2, d / 2);
  }

  private buildManor(): void {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.7 });
    const woodWallMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.85 });
    const rugMat = new THREE.MeshStandardMaterial({ color: 0x881337, roughness: 0.9 });
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.95 });
    const scene = this.engine.native.scene;

    // One hallway along -Z with alcove rooms. Walk forward from spawn.
    this.roomBox(0, -10, 7, 40, floorMat, ceilingMat);
    const rug = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 36), rugMat);
    rug.position.set(0, 0.02, -10);
    scene.add(rug);

    this.buildWall(0, 2.5, 10.2, 7, 5, 0.4, woodWallMat);
    this.buildWall(-3.5, 2.5, 6.7, 0.4, 5, 6.6, woodWallMat);
    this.buildWall(-3.5, 2.5, -6.0, 0.4, 5, 13.2, woodWallMat);
    this.buildWall(-3.5, 2.5, -22.7, 0.4, 5, 14.6, woodWallMat);
    this.buildWall(3.5, 2.5, 2.7, 0.4, 5, 14.6, woodWallMat);
    this.buildWall(3.5, 2.5, -14.0, 0.4, 5, 13.2, woodWallMat);
    this.buildWall(3.5, 2.5, -26.7, 0.4, 5, 6.6, woodWallMat);

    // Room 1 — Study (left)
    this.roomBox(-8, 2, 10, 8, floorMat, ceilingMat);
    this.buildWall(-8, 2.5, 6, 10, 5, 0.4, woodWallMat);
    this.buildWall(-8, 2.5, -2, 10, 5, 0.4, woodWallMat);
    this.buildWall(-13, 2.5, 2, 0.4, 5, 8, woodWallMat);
    this.buildWall(-3.5, 2.5, 4.6, 0.4, 5, 2.6, woodWallMat);
    this.buildWall(-3.5, 2.5, -0.6, 0.4, 5, 2.6, woodWallMat);
    this.buildBookshelf(-11.5, 0, 2);
    this.buildStudyDesk(-8, 0, 2);

    // Room 2 — Key (right)
    this.roomBox(8, -6, 10, 8, floorMat, ceilingMat);
    this.buildWall(8, 2.5, -2, 10, 5, 0.4, woodWallMat);
    this.buildWall(8, 2.5, -10, 10, 5, 0.4, woodWallMat);
    this.buildWall(13, 2.5, -6, 0.4, 5, 8, woodWallMat);
    this.buildWall(3.5, 2.5, -3.4, 0.4, 5, 2.6, woodWallMat);
    this.buildWall(3.5, 2.5, -8.6, 0.4, 5, 2.6, woodWallMat);
    this.buildKeyTable(8, 0, -6);

    // Room 3 — Clock (left)
    this.roomBox(-8, -14, 10, 8, floorMat, ceilingMat);
    this.buildWall(-8, 2.5, -10, 10, 5, 0.4, woodWallMat);
    this.buildWall(-8, 2.5, -18, 10, 5, 0.4, woodWallMat);
    this.buildWall(-13, 2.5, -14, 0.4, 5, 8, woodWallMat);
    this.buildWall(-3.5, 2.5, -11.4, 0.4, 5, 2.6, woodWallMat);
    this.buildWall(-3.5, 2.5, -16.6, 0.4, 5, 2.6, woodWallMat);
    this.buildGrandfatherClock(-8, 0, -14);

    // Room 4 — Crest in the open (right, visible from hall)
    this.roomBox(8, -22, 10, 8, floorMat, ceilingMat);
    this.buildWall(8, 2.5, -18, 10, 5, 0.4, woodWallMat);
    this.buildWall(8, 2.5, -26, 10, 5, 0.4, woodWallMat);
    this.buildWall(13, 2.5, -22, 0.4, 5, 8, woodWallMat);
    this.buildWall(3.5, 2.5, -19.4, 0.4, 5, 2.6, woodWallMat);
    this.buildWall(3.5, 2.5, -24.6, 0.4, 5, 2.6, woodWallMat);

    this.buildGrandExitGate(0, 0, -30);
  }

  private buildWall(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    this.engine.native.scene.add(mesh);
    this.addStaticCollider(x, y, z, w / 2, h / 2, d / 2);
  }

  private addStaticCollider(x: number, y: number, z: number, hx: number, hy: number, hz: number): void {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = this.engine.native.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    this.engine.native.world.createCollider(colliderDesc, body);
  }

  private buildBookshelf(x: number, y: number, z: number): void {
    const scene = this.engine.native.scene;
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(x, y, z);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
    const bookColors = [0x991b1b, 0x1e3a8a, 0x065f46, 0x78350f, 0x4c1d95];

    // Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.0, 3.2), woodMat);
    frame.position.set(0, 2.0, 0);
    shelfGroup.add(frame);

    // Row of colorful book blocks
    for (let row = 0; row < 4; row++) {
      for (let b = -1.2; b <= 1.2; b += 0.3) {
        const bMat = new THREE.MeshStandardMaterial({
          color: bookColors[Math.abs(Math.round(b * 10)) % bookColors.length],
          roughness: 0.6,
        });
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.25), bMat);
        book.position.set(0.1, 0.8 + row * 0.9, b);
        shelfGroup.add(book);
      }
    }

    scene.add(shelfGroup);
    this.addStaticCollider(x, y + 2.0, z, 0.6, 2.0, 1.6);
  }

  private buildStudyDesk(x: number, y: number, z: number): void {
    const scene = this.engine.native.scene;
    const deskGroup = new THREE.Group();
    deskGroup.position.set(x, y, z);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.6 });

    // Tabletop
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 2.0), woodMat);
    top.position.set(0, 1.1, 0);
    deskGroup.add(top);

    // Legs
    for (let lx of [-1.4, 1.4]) {
      for (let lz of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), woodMat);
        leg.position.set(lx, 0.55, lz);
        deskGroup.add(leg);
      }
    }

    // Clockmaker's Journal on desk
    const journalMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.4 });
    const journal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.7), journalMat);
    journal.position.set(0.4, 1.2, 0);
    journal.rotation.y = 0.2;
    deskGroup.add(journal);

    // Small glowing oil lamp
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.4, 8), lampMat);
    lamp.position.set(-0.8, 1.35, 0.3);
    const lampLight = new THREE.PointLight(0xfbbf24, 0.8, 4);
    lampLight.position.set(0, 0.3, 0);
    lamp.add(lampLight);
    deskGroup.add(lamp);

    scene.add(deskGroup);
    this.addStaticCollider(x, y + 0.6, z, 1.6, 0.6, 1.0);

    // Register Journal Interaction
    this.interactables.push({
      id: 'journal',
      object: journal,
      prompt: '📖 Read Clockmaker\'s Journal (E)',
      onInteract: () => this.readJournal(),
    });
  }

  private buildGrandfatherClock(x: number, y: number, z: number): void {
    const scene = this.engine.native.scene;
    const clockGroup = new THREE.Group();
    clockGroup.position.set(x, y, z);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x2b1d0c, roughness: 0.5 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });

    // Clock Body Case
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.4, 1.0), woodMat);
    base.position.set(0, 2.2, 0);
    clockGroup.add(base);

    // Clock Face Dial (White with Roman numerals ring)
    const dialMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 24), dialMat);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 3.4, 0.52);
    clockGroup.add(dial);

    // Clock Hands (Start at 06:00)
    const handMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), handMat);
    hourHand.position.set(0, 3.4, 0.56);
    const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.02), handMat);
    minuteHand.position.set(0, 3.4, 0.57);
    clockGroup.add(hourHand, minuteHand);
    this.clockHands = { hour: hourHand, minute: minuteHand };

    // Brass Pendulum
    const pendulumRod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8), goldMat);
    const pendulumBob = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), goldMat);
    pendulumBob.position.set(0, -0.7, 0);
    pendulumBob.rotation.x = Math.PI / 2;

    const pendulum = new THREE.Group();
    pendulum.position.set(0, 2.6, 0.4);
    pendulum.add(pendulumRod, pendulumBob);
    clockGroup.add(pendulum);
    this.pendulumMesh = pendulum as any;

    scene.add(clockGroup);
    this.addStaticCollider(x, y + 2.2, z, 0.6, 2.2, 0.5);

    // Register Clock Interaction
    this.interactables.push({
      id: 'clock',
      object: dial,
      prompt: '🕰️ Inspect Grandfather Clock (E)',
      onInteract: () => this.interactClock(),
    });
  }

  private buildKeyTable(x: number, y: number, z: number): void {
    const scene = this.engine.native.scene;
    const tableGroup = new THREE.Group();
    tableGroup.position.set(x, y, z);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b1e08, roughness: 0.6 });

    // Table
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 1.4), woodMat);
    top.position.set(0, 1.0, 0);
    tableGroup.add(top);

    for (let lx of [-0.8, 0.8]) {
      for (let lz of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8), woodMat);
        leg.position.set(lx, 0.5, lz);
        tableGroup.add(leg);
      }
    }

    // Golden Winding Key
    const keyMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 });
    const key = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 16), keyMat);
    const keyShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8), keyMat);
    keyShaft.position.set(0, -0.15, 0);
    key.add(keyShaft);
    key.position.set(0, 1.15, 0);
    key.rotation.x = Math.PI / 2;
    tableGroup.add(key);
    this.keyMesh = key;

    scene.add(tableGroup);
    this.addStaticCollider(x, y + 0.5, z, 1.0, 0.5, 0.7);

    // Register Key Interaction
    this.interactables.push({
      id: 'key',
      object: key,
      prompt: '🗝️ Pick up Clock Winding Key (E)',
      onInteract: () => this.pickupKey(),
    });
  }

  private buildGrandExitGate(x: number, y: number, z: number): void {
    const scene = this.engine.native.scene;
    const gateGroup = new THREE.Group();
    gateGroup.position.set(x, y, z);

    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });

    // Archway Frame
    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.5, 0.8), ironMat);
    leftPillar.position.set(-2.4, 2.25, 0);
    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.5, 0.8), ironMat);
    rightPillar.position.set(2.4, 2.25, 0);
    const topArch = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.6, 0.8), ironMat);
    topArch.position.set(0, 4.5, 0);
    gateGroup.add(leftPillar, rightPillar, topArch);

    // Left & Right Iron Grate Doors
    const doorGeo = new THREE.BoxGeometry(1.9, 3.8, 0.1);
    this.gateLeftDoor = new THREE.Mesh(doorGeo, ironMat);
    this.gateLeftDoor.position.set(-1.0, 2.1, 0);
    this.gateRightDoor = new THREE.Mesh(doorGeo, ironMat);
    this.gateRightDoor.position.set(1.0, 2.1, 0);
    gateGroup.add(this.gateLeftDoor, this.gateRightDoor);

    // Crest Socket Emblem
    const socketMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 });
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 8), socketMat);
    socket.position.set(0, 2.1, 0.1);
    socket.rotation.x = Math.PI / 2;
    gateGroup.add(socket);

    scene.add(gateGroup);
    this.addStaticCollider(x, y + 2.25, z, 2.8, 2.25, 0.4);

    // Register Gate Interaction
    this.interactables.push({
      id: 'gate',
      object: socket,
      prompt: '🚪 Examine Sealed Gate (E)',
      onInteract: () => this.interactGate(),
    });
  }

  private setupPuzzles(): void {
    const scene = this.engine.native.scene;
    const altar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 })
    );
    altar.position.set(8, 0.6, -22);
    scene.add(altar);

    const crestMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0x78350f,
      emissiveIntensity: 0.7,
    });
    this.crestMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), crestMat);
    this.crestMesh.position.set(8, 1.7, -22);
    scene.add(this.crestMesh);

    const crestLight = new THREE.PointLight(0xf59e0b, 2.4, 9);
    crestLight.position.set(8, 2.2, -22);
    scene.add(crestLight);

    this.interactables.push({
      id: 'crest',
      object: this.crestMesh,
      prompt: '🛡️ Take Blackwood Crest (E)',
      onInteract: () => this.pickupCrest(),
    });
  }

  // --- Puzzle Interactions ---

  readJournal(): void {
    sfx.playPaperRustle();
    this.showInspectNote(
      `"Walk the hallway. Left: this journal. Right: the winding key. Left again: the clock (11:45). Right again: the crest. The gate is at the far end."`,
      7000
    );
  }

  pickupKey(): void {
    if (this.hasKey) return;
    this.hasKey = true;
    sfx.playKeyPickup();
    if (this.keyMesh) {
      this.keyMesh.visible = false;
    }
    this.showInspectNote(`🗝️ Obtained: Clock Winding Key! Use it on the Grandfather Clock.`, 4000);
  }

  interactClock(): void {
    if (this.clockSolved) {
      this.showInspectNote(`The Grandfather Clock is ticking steadily at 11:45. The secret passage is open.`, 3000);
      return;
    }

    if (!this.hasKey) {
      sfx.playClockTick(false);
      this.showInspectNote(`The clock is wound down and frozen at 06:00. It requires a winding key.`, 4000);
      return;
    }

    // Solve Clock Puzzle!
    this.clockSolved = true;
    sfx.playSecretJingle();

    if (this.clockHands) {
      // Set to 11:45
      this.clockHands.hour.rotation.z = (11 / 12) * Math.PI * 2;
      this.clockHands.minute.rotation.z = (45 / 60) * Math.PI * 2;
    }

    this.showInspectNote(`⚙️ You wind the clock to 11:45! A heavy grinding noise echoes from the Library...`, 6000);
  }

  pickupCrest(): void {
    if (this.hasCrest) return;
    this.hasCrest = true;
    sfx.playKeyPickup();
    if (this.crestMesh) {
      this.crestMesh.visible = false;
    }
    this.showInspectNote(`🛡️ Obtained: Blackwood Family Crest! Bring it to the grand exit gate.`, 5000);
  }

  interactGate(): void {
    if (this.gateUnlocked) {
      this.showInspectNote(`The gate is unlocked! You have escaped Blackwood Manor.`, 4000);
      return;
    }

    if (!this.hasCrest) {
      this.showInspectNote(`The iron gate is sealed by an ancient family crest socket. You need the Crest.`, 4000);
      return;
    }

    // Unlock Gate!
    this.gateUnlocked = true;
    sfx.playGateOpen();
    this.showInspectNote(`🏆 The Crest fits! The grand iron gate swings open into the night air! You Escaped!`, 4000);
    this.engine.loop.win('You escaped Blackwood Manor');
  }

  private resetMatch(): void {
    this.hasKey = false;
    this.hasCrest = false;
    this.clockSolved = false;
    this.gateUnlocked = false;
    this.bookcaseOpenProgress = 0;
    this.gateOpenProgress = 0;
    this.inspectingText = null;
    this.isFlashlightOn = true;
    if (this.flashlightSpot) this.flashlightSpot.intensity = 4.5;
    if (this.flashlightAmbient) this.flashlightAmbient.intensity = 0.4;
    if (this.keyMesh) this.keyMesh.visible = true;
    if (this.crestMesh) this.crestMesh.visible = true;
    if (this.secretBookcase) this.secretBookcase.visible = false;
    if (this.gateLeftDoor) this.gateLeftDoor.rotation.y = 0;
    if (this.gateRightDoor) this.gateRightDoor.rotation.y = 0;
    if (this.clockHands) {
      this.clockHands.hour.rotation.z = 0;
      this.clockHands.minute.rotation.z = 0;
    }
    const start = { x: 0, y: 1.7, z: 6 };
    this.playerBody.setNextKinematicTranslation(start);
    this.yawObject.position.set(start.x, start.y, start.z);
    this.yawObject.rotation.set(0, 0, 0);
    this.pitchObject.rotation.set(0, 0, 0);
    this.keys = {};
  }

  private showInspectNote(text: string, durationMs = 4000): void {
    this.inspectingText = text;
    if (this.inspectCardTimeout) clearTimeout(this.inspectCardTimeout);
    this.inspectCardTimeout = setTimeout(() => {
      this.inspectingText = null;
    }, durationMs);
  }

  dismissInspect(): boolean {
    if (!this.inspectingText) return false;
    this.inspectingText = null;
    if (this.inspectCardTimeout) {
      clearTimeout(this.inspectCardTimeout);
      this.inspectCardTimeout = null;
    }
    return true;
  }

  toggleFlashlight(): void {
    this.isFlashlightOn = !this.isFlashlightOn;
    sfx.playFlashlightClick();
    this.flashlightSpot.intensity = this.isFlashlightOn ? 4.5 : 0.0;
    this.flashlightAmbient.intensity = this.isFlashlightOn ? 0.4 : 0.0;
  }

  private setupActions(): void {
    this.engine.actions.register({
      name: 'quest.readJournal',
      handle: () => this.readJournal(),
    });
    this.engine.actions.register({
      name: 'quest.pickupKey',
      handle: () => this.pickupKey(),
    });
    this.engine.actions.register({
      name: 'quest.solveClock',
      handle: () => {
        this.hasKey = true;
        this.interactClock();
      },
    });
    this.engine.actions.register({
      name: 'quest.pickupCrest',
      handle: () => this.pickupCrest(),
    });
    this.engine.actions.register({
      name: 'quest.unlockGate',
      handle: () => {
        this.hasCrest = true;
        this.interactGate();
      },
    });
    this.engine.actions.register({
      name: 'player.toggleFlashlight',
      handle: () => this.toggleFlashlight(),
    });
  }

  private setupInput(): void {
    const onClick = () => {
      sfx.startManorAmbience();
      if (this.engine.loop.enabled && this.engine.loop.phase === 'ready') {
        this.engine.loop.start();
      }
      if (this.dismissInspect()) return;
      if (!this.isLocked) {
        this.canvas.requestPointerLock();
      } else {
        this.checkInteract();
      }
    };
    const onLock = () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    };
    const onMove = (e: MouseEvent) => {
      if (!this.isLocked) return;
      this.yawObject.rotation.y -= (e.movementX || 0) * this.mouseSensitivity;
      this.pitchObject.rotation.x -= (e.movementY || 0) * this.mouseSensitivity;
      this.pitchObject.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitchObject.rotation.x));
    };
    const onDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      sfx.startManorAmbience();
      if (this.engine.loop.enabled && this.engine.loop.phase === 'ready') {
        this.engine.loop.start();
      }
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;
      if (e.code === 'KeyF' || e.key.toLowerCase() === 'f') this.toggleFlashlight();
      if (e.code === 'Escape' || e.code === 'KeyE' || e.key.toLowerCase() === 'e') {
        if (this.dismissInspect()) return;
        if (e.code === 'KeyE' || e.key.toLowerCase() === 'e') this.checkInteract();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    };

    this.canvas.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLock);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    this.unbind.push(
      () => this.canvas.removeEventListener('click', onClick),
      () => document.removeEventListener('pointerlockchange', onLock),
      () => window.removeEventListener('mousemove', onMove),
      () => window.removeEventListener('keydown', onDown),
      () => window.removeEventListener('keyup', onUp)
    );
  }

  private checkInteract(): void {
    // Cast ray forward from camera
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const cameraPos = this.camera.getWorldPosition(new THREE.Vector3());

    for (const item of this.interactables) {
      const itemPos = item.object.getWorldPosition(new THREE.Vector3());
      const dist = cameraPos.distanceTo(itemPos);
      if (dist < 3.2) {
        item.onInteract();
        return;
      }
    }
  }

  getHoverPrompt(): string | null {
    if (!this.camera) return null;
    const cameraPos = this.camera.getWorldPosition(new THREE.Vector3());

    for (const item of this.interactables) {
      if (item.id === 'key' && this.hasKey) continue;
      if (item.id === 'crest' && this.hasCrest) continue;

      const itemPos = item.object.getWorldPosition(new THREE.Vector3());
      if (cameraPos.distanceTo(itemPos) < 3.0) {
        return item.prompt;
      }
    }
    return null;
  }

  getTelemetry(): PsxTelemetry {
    const p = this.yawObject.position;
    let quest = 'Walk the hall. First left: journal on the desk';
    if (this.gateUnlocked) quest = 'Escaped the manor';
    else if (this.hasCrest) quest = 'Keep walking to the gate at the end';
    else if (this.clockSolved) quest = 'Next right: glowing crest on the pedestal';
    else if (this.hasKey) quest = 'Next left: wind the clock to 11:45';
    else if (this.inspectingText) quest = quest;

    return {
      playerPos: [parseFloat(p.x.toFixed(1)), parseFloat(p.y.toFixed(1)), parseFloat(p.z.toFixed(1))],
      questStatus: quest,
      hasKey: this.hasKey,
      hasCrest: this.hasCrest,
      clockSolved: this.clockSolved,
      gateUnlocked: this.gateUnlocked,
      flashlightOn: this.isFlashlightOn,
      inspectingText: this.inspectingText,
    };
  }

  update(dt: number): void {
    // 1. Process 1st-Person WASD Movement
    let forward = 0;
    let strafe = 0;

    if (this.engine.loop.playing) {
      if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) forward += 1;
      if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) forward -= 1;
      if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) strafe -= 1;
      if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) strafe += 1;
    }

    const isMoving = forward !== 0 || strafe !== 0;
    const speed = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) ? 6.5 : 4.0;

    // Movement relative to yaw direction
    const moveDir = new THREE.Vector3(strafe, 0, -forward).normalize();
    moveDir.applyEuler(new THREE.Euler(0, this.yawObject.rotation.y, 0));

    const desiredTranslation = new RAPIER.Vector3(
      moveDir.x * speed * dt,
      -9.8 * dt,
      moveDir.z * speed * dt
    );

    this.characterController.computeColliderMovement(this.playerCollider, desiredTranslation);
    const corrected = this.characterController.computedMovement();

    const curr = this.playerBody.translation();
    const newPos = {
      x: curr.x + corrected.x,
      y: curr.y + corrected.y,
      z: curr.z + corrected.z,
    };

    this.playerBody.setNextKinematicTranslation(newPos);
    this.yawObject.position.set(newPos.x, newPos.y, newPos.z);

    // 2. Head Bob & Footstep SFX
    if (isMoving) {
      this.headBobTimer += dt * (speed > 5.0 ? 14 : 9);
      this.camera.position.y = 0.7 + Math.sin(this.headBobTimer) * 0.05;
      this.camera.position.x = Math.cos(this.headBobTimer * 0.5) * 0.03;

      // Flashlight natural hand sway
      this.flashlightGroup.position.y = -0.25 + Math.sin(this.headBobTimer * 0.5) * 0.02;
      this.flashlightGroup.position.x = 0.32 + Math.cos(this.headBobTimer * 0.5) * 0.015;

      // Footstep triggering on bottom of bob cycle
      const stepPhase = Math.floor(this.headBobTimer / Math.PI);
      if (stepPhase > this.lastFootstepStep) {
        this.lastFootstepStep = stepPhase;
        sfx.playFootstep('wood');
      }
    } else {
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 0.7, 0.1);
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, 0.0, 0.1);
    }

    // 3. Torch Sconce Flame Flickering
    this.torches.forEach((t) => {
      const flicker = (Math.random() - 0.5) * 0.3;
      t.light.intensity = t.baseIntensity + flicker;
      t.mesh.scale.set(1 + flicker * 0.5, 1 + flicker * 0.8, 1 + flicker * 0.5);
    });

    // 4. Thunderstorm & Lightning Simulation
    this.thunderTimer += dt;
    if (this.thunderTimer > 12.0) {
      this.thunderTimer = 0;
      this.triggerLightning();
    }
    if (this.lightningLight.intensity > 0.05) {
      this.lightningLight.intensity *= 0.82;
    }

    // 5. Grandfather Clock Pendulum & Tick Sound
    if (this.pendulumMesh) {
      const pendAngle = Math.sin(Date.now() * 0.0035) * 0.35;
      this.pendulumMesh.rotation.z = pendAngle;

      // Clock tick at swing apex
      if (Math.abs(pendAngle) > 0.33) {
        sfx.playClockTick(pendAngle > 0);
      }
    }

    // 6. Secret Bookcase Passage Opening Animation
    if (this.clockSolved && this.bookcaseOpenProgress < 1.0) {
      this.bookcaseOpenProgress += dt * 0.5;
      if (this.secretBookcase) {
        this.secretBookcase.position.x = -13 + this.bookcaseOpenProgress * 3.5;
      }
    }

    // 7. Grand Gate Opening Animation
    if (this.gateUnlocked && this.gateOpenProgress < 1.0) {
      this.gateOpenProgress += dt * 0.6;
      if (this.gateLeftDoor && this.gateRightDoor) {
        this.gateLeftDoor.rotation.y = -this.gateOpenProgress * (Math.PI / 2.2);
        this.gateRightDoor.rotation.y = this.gateOpenProgress * (Math.PI / 2.2);
      }
    }
  }

  private triggerLightning(): void {
    this.lightningLight.intensity = 5.5;
    setTimeout(() => {
      sfx.playThunder();
    }, 400);
  }

  dispose(): void {
    if (this.inspectCardTimeout) clearTimeout(this.inspectCardTimeout);
    for (const fn of this.unbind) fn();
    this.unbind.length = 0;
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    sfx.stopManorAmbience();
    this.engine.dispose();
  }
}
