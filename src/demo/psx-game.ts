/**
 * Renderoni Web Demo: PSX 3rd-Person Survival Horror (Archetype C)
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RenderoniEngine } from '../core/engine.js';
import { body } from '../presets/body.js';
import { sensor } from '../presets/sensor.js';
import { light } from '../presets/light.js';
import { sfx } from './audio-sfx.js';

export interface PsxTelemetry {
  questStatus: string;
  hasKey: boolean;
  isDoorOpen: boolean;
  playerPos: [number, number, number];
}

export class PsxGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;
  private playerBody!: RAPIER.RigidBody;
  private characterGroup!: THREE.Group;
  private leftLegMesh!: THREE.Mesh;
  private rightLegMesh!: THREE.Mesh;
  private keyEntity: any = null;
  private doorMesh: THREE.Group | null = null;
  private flashlight: THREE.SpotLight | null = null;

  // Quest State
  private hasKey = false;
  private isDoorOpen = false;
  private questStatus = 'Find the Rusty Key';

  // 3rd-Person Controls & Camera Orbit
  private keys: Record<string, boolean> = {};
  private camYaw = 0;
  private camPitch = 0.25;
  private isLocked = false;
  private walkAnim = 0;
  private isMoving = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -18.0, 0],
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    scene.background = new THREE.Color(0x020305);
    scene.fog = new THREE.FogExp2(0x020305, 0.05);

    // 1. Spooky Lighting & Torches
    this.engine.add(light({ type: 'ambient', intensity: 0.12, color: 0x223344 }));

    const torch1 = new THREE.PointLight(0xff6622, 2.5, 18);
    torch1.position.set(-4.0, 2.8, -8);
    scene.add(torch1);

    const torch2 = new THREE.PointLight(0xff4411, 2.2, 18);
    torch2.position.set(4.0, 2.8, -20);
    scene.add(torch2);

    // 2. Gothic Manor Architecture
    this.buildMansion(scene);

    // 3. Table & Glowing Key Item
    this.buildKeyItem(scene);

    // 4. Sealed Iron Gate & Sensor
    this.buildIronGate(scene);

    // 5. 3rd-Person Character Avatar (Detective with Coat & Flashlight)
    this.buildCharacter(scene);

    // 6. Setup Controls
    this.setupControls();

    // 7. Systems: Movement & Interaction
    this.engine.systems.add({
      phase: 'prePhysics',
      update: () => {
        this.updateMovement();
        this.checkKeyPickup();
      },
    });

    // Actions
    this.engine.actions.register({
      name: 'quest.pickupKey',
      handle: () => this.pickupKey(),
    });

    this.engine.actions.register({
      name: 'quest.unlockDoor',
      handle: () => this.unlockDoor(),
    });

    // Start presentation loop with 3rd-person camera update hook
    this.engine.start((dt) => this.update(dt));
  }

  private buildCharacter(scene: THREE.Scene): void {
    this.characterGroup = new THREE.Group();

    const coatMat = new THREE.MeshStandardMaterial({ color: 0x3b2d24, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.6 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x221a14, roughness: 0.9 });
    const pantMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });

    // Torso / Trench Coat
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.45), coatMat);
    torso.position.y = 1.1;
    this.characterGroup.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), skinMat);
    head.position.y = 1.75;
    this.characterGroup.add(head);

    // Fedora Hat
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 16), hatMat);
    hatBrim.position.y = 1.95;
    const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.22, 16), hatMat);
    hatCrown.position.y = 2.08;
    this.characterGroup.add(hatBrim, hatCrown);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);
    this.leftLegMesh = new THREE.Mesh(legGeo, pantMat);
    this.leftLegMesh.position.set(-0.18, 0.4, 0);
    this.rightLegMesh = new THREE.Mesh(legGeo, pantMat);
    this.rightLegMesh.position.set(0.18, 0.4, 0);
    this.characterGroup.add(this.leftLegMesh, this.rightLegMesh);

    // Flashlight in hand
    const flashlightMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.04, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8 })
    );
    flashlightMesh.position.set(0.35, 1.0, 0.3);
    flashlightMesh.rotation.x = Math.PI / 2;
    this.characterGroup.add(flashlightMesh);

    // Flashlight SpotLight
    this.flashlight = new THREE.SpotLight(0xffeedd, 3.8, 30, Math.PI / 5, 0.3, 1.2);
    this.flashlight.position.set(0.35, 1.1, 0.4);
    this.characterGroup.add(this.flashlight);
    this.characterGroup.add(this.flashlight.target);
    this.flashlight.target.position.set(0.35, 0.9, 10);

    scene.add(this.characterGroup);

    // Physics Rigid Body
    this.playerBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 1.2, 0)
        .lockRotations()
        .setAdditionalMass(3.0)
        .setLinearDamping(0.2)
        .setCanSleep(false)
    );
    const playerCollider = this.engine.native.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.7, 0.4).setFriction(0.0),
      this.playerBody
    );

    this.engine.add({
      id: 'player_detective',
      tags: ['player', '3rd_person'],
      native: {
        three: { object: this.characterGroup },
        rapier: { body: this.playerBody, colliders: [playerCollider] },
      },
    });
  }

  private buildMansion(scene: THREE.Scene): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.95 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 });

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 50), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -20);
    scene.add(floor);

    this.engine.add(
      body({
        id: 'floor',
        shape: 'box',
        type: 'fixed',
        size: [14, 1, 50],
        position: [0, -0.5, -20],
      })
    );

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(14, 50), wallMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4.5, -20);
    scene.add(ceiling);

    // Left Wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 5.0, 50), wallMat);
    leftWall.position.set(-6.5, 2.2, -20);
    scene.add(leftWall);

    this.engine.add(
      body({
        id: 'left_wall',
        shape: 'box',
        type: 'fixed',
        size: [1, 5.0, 50],
        position: [-6.5, 2.2, -20],
      })
    );

    // Right Wall
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 5.0, 50), wallMat);
    rightWall.position.set(6.5, 2.2, -20);
    scene.add(rightWall);

    this.engine.add(
      body({
        id: 'right_wall',
        shape: 'box',
        type: 'fixed',
        size: [1, 5.0, 50],
        position: [6.5, 2.2, -20],
      })
    );

    // Back Wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(14, 5.0, 1), wallMat);
    backWall.position.set(0, 2.2, 5);
    scene.add(backWall);

    this.engine.add(
      body({
        id: 'back_wall',
        shape: 'box',
        type: 'fixed',
        size: [14, 5.0, 1],
        position: [0, 2.2, 5],
      })
    );

    // Wooden cross beams
    for (let z = 0; z > -42; z -= 6) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.4, 0.4), woodMat);
      beam.position.set(0, 4.3, z);
      scene.add(beam);
    }
  }

  private buildKeyItem(scene: THREE.Scene): void {
    // Wooden Table
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.7 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.4), tableMat);
    tableTop.position.set(-4.5, 1.0, -12);
    scene.add(tableTop);

    const legGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12);
    const l1 = new THREE.Mesh(legGeo, tableMat);
    l1.position.set(-5.4, 0.5, -11.4);
    const l2 = new THREE.Mesh(legGeo, tableMat);
    l2.position.set(-3.6, 0.5, -11.4);
    const l3 = new THREE.Mesh(legGeo, tableMat);
    l3.position.set(-5.4, 0.5, -12.6);
    const l4 = new THREE.Mesh(legGeo, tableMat);
    l4.position.set(-3.6, 0.5, -12.6);
    scene.add(l1, l2, l3, l4);

    // Glowing Golden Rusty Key
    const keyGroup = new THREE.Group();
    const keyMat = new THREE.MeshStandardMaterial({
      color: 0xdfa020,
      metalness: 0.9,
      roughness: 0.3,
      emissive: 0x553300,
    });
    const keyStem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), keyMat);
    keyStem.rotation.x = Math.PI / 2;
    const keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), keyMat);
    keyRing.position.z = 0.3;
    keyGroup.add(keyStem, keyRing);
    keyGroup.position.set(-4.5, 1.3, -12);
    scene.add(keyGroup);

    this.keyEntity = keyGroup;
  }

  private buildIronGate(scene: THREE.Scene): void {
    const archMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, metalness: 0.8, roughness: 0.3 });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.2, 0.6), archMat);
    postL.position.set(-3.0, 2.1, -32);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.2, 0.6), archMat);
    postR.position.set(3.0, 2.1, -32);
    const archTop = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.6, 0.6), archMat);
    archTop.position.set(0, 4.2, -32);
    scene.add(postL, postR, archTop);

    // Gate Left & Right Doors
    this.doorMesh = new THREE.Group();
    this.doorMesh.position.set(-2.7, 0, -32);

    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.8, 0.1), archMat);
    doorPanel.position.set(2.7, 1.9, 0);

    for (let x = 0.6; x < 5.0; x += 0.6) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4), archMat);
      bar.position.set(x, 1.9, 0);
      this.doorMesh.add(bar);
    }
    this.doorMesh.add(doorPanel);
    scene.add(this.doorMesh);

    // Gate Sensor Trigger Volume
    this.engine.add(
      sensor({
        id: 'door_trigger',
        shape: 'box',
        size: [6.0, 4.0, 5.0],
        position: [0, 2.0, -30],
      })
    );

    // Listen to Sensor Enter
    this.engine.events.on('sensor.enter', (data) => {
      if (data.sensor?.id === 'door_trigger' || data.sensor === 'door_trigger') {
        if (this.hasKey && !this.isDoorOpen) {
          this.unlockDoor();
        }
      }
    });
  }

  private setupControls(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;
      if (e.code === 'KeyE' || e.key.toLowerCase() === 'e') {
        this.pickupKey();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.canvas.addEventListener('click', () => {
      if (!this.isLocked) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const sensitivity = 0.0024;
      this.camYaw -= e.movementX * sensitivity;
      this.camPitch += e.movementY * sensitivity;
      this.camPitch = Math.max(0.05, Math.min(Math.PI / 3.0, this.camPitch));
    });
  }

  private updateMovement(): void {
    if (!this.playerBody) return;

    let forward = 0;
    let strafe = 0;

    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) forward += 1;
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) forward -= 1;
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) strafe -= 1;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) strafe += 1;

    this.isMoving = forward !== 0 || strafe !== 0;

    const speed = 5.6;
    const moveX = (Math.sin(this.camYaw) * forward + Math.cos(this.camYaw) * strafe) * speed;
    const moveZ = (-Math.cos(this.camYaw) * forward + Math.sin(this.camYaw) * strafe) * speed;

    const currentVel = this.playerBody.linvel();
    this.playerBody.setLinvel(new RAPIER.Vector3(moveX, currentVel.y, moveZ), true);

    // Rotate Character to face direction of movement
    if (this.isMoving && this.characterGroup) {
      const targetAngle = Math.atan2(moveX, moveZ);
      this.characterGroup.rotation.y = targetAngle;
    }
  }

  private checkKeyPickup(): void {
    if (this.hasKey || !this.playerBody) return;
    const p = this.playerBody.translation();
    const d = Math.hypot(p.x - -4.5, p.z - -12);

    if (d < 2.8) {
      this.pickupKey();
    }
  }

  pickupKey(): void {
    if (this.hasKey) return;
    this.hasKey = true;
    this.questStatus = 'Key Acquired! Proceed to the Iron Gate';

    if (this.keyEntity) {
      this.keyEntity.visible = false;
    }

    sfx.playKeyPickup();
    this.engine.events.emit('item.pickup', { item: 'rusty_key' });
  }

  unlockDoor(): void {
    if (this.isDoorOpen) return;
    this.isDoorOpen = true;
    this.questStatus = 'Mansion Gate Unlocked! Escaped!';

    sfx.playDoorUnlock();
    this.engine.events.emit('door.opened', { door: 'iron_gate' });
    this.engine.events.emit('quest.completed', { quest: 'escape_mansion' });
  }

  getTelemetry(): PsxTelemetry {
    const p = this.playerBody ? this.playerBody.translation() : { x: 0, y: 0, z: 0 };
    return {
      questStatus: this.questStatus,
      hasKey: this.hasKey,
      isDoorOpen: this.isDoorOpen,
      playerPos: [parseFloat(p.x.toFixed(1)), parseFloat(p.y.toFixed(1)), parseFloat(p.z.toFixed(1))],
    };
  }

  update(dt: number): void {
    if (!this.playerBody || !this.characterGroup) return;

    const pPos = this.playerBody.translation();
    this.characterGroup.position.set(pPos.x, pPos.y, pPos.z);

    // 3rd-Person Orbit / Chase Camera
    const camDistance = 4.6;
    const camHeight = Math.sin(this.camPitch) * camDistance + 1.6;
    const camHorizDist = Math.cos(this.camPitch) * camDistance;

    const targetCamX = pPos.x + Math.sin(this.camYaw) * camHorizDist;
    const targetCamY = pPos.y + camHeight;
    const targetCamZ = pPos.z + Math.cos(this.camYaw) * camHorizDist;

    const camera = this.engine.native.camera;
    camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.15);
    camera.lookAt(pPos.x, pPos.y + 1.2, pPos.z);

    // Leg walking animation
    if (this.isMoving) {
      this.walkAnim += dt * 10;
      this.leftLegMesh.rotation.x = Math.sin(this.walkAnim) * 0.6;
      this.rightLegMesh.rotation.x = -Math.sin(this.walkAnim) * 0.6;
    } else {
      this.leftLegMesh.rotation.x *= 0.8;
      this.rightLegMesh.rotation.x *= 0.8;
    }

    // Door opening animation
    if (this.isDoorOpen && this.doorMesh) {
      if (this.doorMesh.rotation.y > -Math.PI / 1.8) {
        this.doorMesh.rotation.y -= 0.04;
      }
    }

    // Key hovering animation
    if (this.keyEntity && this.keyEntity.visible) {
      this.keyEntity.rotation.y += 0.03;
      this.keyEntity.position.y = 1.3 + Math.sin(Date.now() * 0.003) * 0.08;
    }
  }

  dispose(): void {
    this.engine.dispose();
  }
}
