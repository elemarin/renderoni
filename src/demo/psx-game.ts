/**
 * Renderoni Web Demo: PSX Retro Survival Horror (Archetype C)
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
  private keyEntity: any = null;
  private doorMesh: THREE.Group | null = null;
  private flashlight: THREE.SpotLight | null = null;

  // Quest State
  private hasKey = false;
  private isDoorOpen = false;
  private questStatus = 'Find the Rusty Key';

  // Controls
  private keys: Record<string, boolean> = {};
  private yaw = 0;
  private pitch = 0;
  private isLocked = false;
  private walkBob = 0;

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
    scene.fog = new THREE.FogExp2(0x020305, 0.08);

    // 1. Spooky Ambient & Torch Lighting
    this.engine.add(light({ type: 'ambient', intensity: 0.08, color: 0x223344 }));

    const torchLight = new THREE.PointLight(0xff6622, 1.8, 14);
    torchLight.position.set(-3.5, 2.5, -8);
    scene.add(torchLight);

    const torchLight2 = new THREE.PointLight(0xff4411, 1.5, 14);
    torchLight2.position.set(3.5, 2.5, -18);
    scene.add(torchLight2);

    // 2. Mansion Hallway Architecture
    this.buildMansion(scene);

    // 3. Table & Rusty Key Item
    this.buildKeyItem(scene);

    // 4. Sealed Iron Gate & Sensor Trigger
    this.buildIronGate(scene);

    // 5. Player Explorer & Flashlight
    this.playerBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 1.2, 0)
        .lockRotations()
        .setAdditionalMass(2.0)
    );
    const playerCollider = this.engine.native.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.7, 0.4),
      this.playerBody
    );

    this.engine.add({
      id: 'player_detective',
      tags: ['player', 'kcc'],
      native: {
        rapier: { body: this.playerBody, colliders: [playerCollider] },
      },
    });

    // Flashlight SpotLight attached to player camera
    this.flashlight = new THREE.SpotLight(0xffeedd, 3.5, 28, Math.PI / 6, 0.4, 1.2);
    this.flashlight.position.set(0, 1.5, 0);
    scene.add(this.flashlight);
    scene.add(this.flashlight.target);

    // 6. Setup Controls
    this.setupControls();

    // 7. Movement & Interaction System
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

    this.engine.start();
  }

  private buildMansion(scene: THREE.Scene): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.95 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 });

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -15);
    scene.add(floor);

    this.engine.add(
      body({
        id: 'floor',
        shape: 'box',
        type: 'fixed',
        size: [10, 1, 40],
        position: [0, -0.5, -15],
      })
    );

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10, 40), wallMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4.0, -15);
    scene.add(ceiling);

    // Left Wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 4.5, 40), wallMat);
    leftWall.position.set(-4.5, 2.0, -15);
    scene.add(leftWall);

    this.engine.add(
      body({
        id: 'left_wall',
        shape: 'box',
        type: 'fixed',
        size: [1, 4.5, 40],
        position: [-4.5, 2.0, -15],
      })
    );

    // Right Wall
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 4.5, 40), wallMat);
    rightWall.position.set(4.5, 2.0, -15);
    scene.add(rightWall);

    this.engine.add(
      body({
        id: 'right_wall',
        shape: 'box',
        type: 'fixed',
        size: [1, 4.5, 40],
        position: [4.5, 2.0, -15],
      })
    );

    // Back Wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 1), wallMat);
    backWall.position.set(0, 2.0, 5);
    scene.add(backWall);

    this.engine.add(
      body({
        id: 'back_wall',
        shape: 'box',
        type: 'fixed',
        size: [10, 4.5, 1],
        position: [0, 2.0, 5],
      })
    );

    // Ceiling wooden cross beams
    for (let z = 0; z > -32; z -= 6) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.4, 0.4), woodMat);
      beam.position.set(0, 3.8, z);
      scene.add(beam);
    }
  }

  private buildKeyItem(scene: THREE.Scene): void {
    // Wooden Table
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.7 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.4), tableMat);
    tableTop.position.set(-3.2, 1.0, -10);
    scene.add(tableTop);

    const legGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12);
    const l1 = new THREE.Mesh(legGeo, tableMat);
    l1.position.set(-3.9, 0.5, -9.4);
    const l2 = new THREE.Mesh(legGeo, tableMat);
    l2.position.set(-2.5, 0.5, -9.4);
    const l3 = new THREE.Mesh(legGeo, tableMat);
    l3.position.set(-3.9, 0.5, -10.6);
    const l4 = new THREE.Mesh(legGeo, tableMat);
    l4.position.set(-2.5, 0.5, -10.6);
    scene.add(l1, l2, l3, l4);

    // Glowing Golden Rusty Key
    const keyGroup = new THREE.Group();
    const keyMat = new THREE.MeshStandardMaterial({
      color: 0xdfa020,
      metalness: 0.9,
      roughness: 0.3,
      emissive: 0x332200,
    });
    const keyStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5), keyMat);
    keyStem.rotation.x = Math.PI / 2;
    const keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), keyMat);
    keyRing.position.z = 0.25;
    keyGroup.add(keyStem, keyRing);
    keyGroup.position.set(-3.2, 1.2, -10);
    scene.add(keyGroup);

    this.keyEntity = keyGroup;
  }

  private buildIronGate(scene: THREE.Scene): void {
    // Gate arch frame
    const archMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, metalness: 0.8, roughness: 0.3 });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 0.5), archMat);
    postL.position.set(-2.5, 2.0, -28);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 0.5), archMat);
    postR.position.set(2.5, 2.0, -28);
    const archTop = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 0.5), archMat);
    archTop.position.set(0, 3.8, -28);
    scene.add(postL, postR, archTop);

    // Gate Left & Right Doors
    this.doorMesh = new THREE.Group();
    this.doorMesh.position.set(-2.25, 0, -28);

    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.5, 0.1), archMat);
    doorPanel.position.set(2.25, 1.75, 0);

    // Bars
    for (let x = 0.5; x < 4.0; x += 0.6) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2), archMat);
      bar.position.set(x, 1.75, 0);
      this.doorMesh.add(bar);
    }
    this.doorMesh.add(doorPanel);
    scene.add(this.doorMesh);

    // Gate Sensor Trigger Volume
    this.engine.add(
      sensor({
        id: 'door_trigger',
        shape: 'box',
        size: [5.0, 4.0, 4.0],
        position: [0, 2.0, -26],
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
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE') {
        this.pickupKey();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

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
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.pitch));
    });
  }

  private updateMovement(): void {
    if (!this.playerBody) return;

    let forward = 0;
    let strafe = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) forward += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) forward -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) strafe -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) strafe += 1;

    const speed = 4.8;
    const moveX = (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) * speed;
    const moveZ = (-Math.cos(this.yaw) * forward + Math.sin(this.yaw) * strafe) * speed;

    const currentVel = this.playerBody.linvel();
    this.playerBody.setLinvel(new RAPIER.Vector3(moveX, currentVel.y, moveZ), true);

    if (forward !== 0 || strafe !== 0) {
      this.walkBob += 0.16;
    }
  }

  private checkKeyPickup(): void {
    if (this.hasKey || !this.playerBody) return;
    const p = this.playerBody.translation();
    const d = Math.hypot(p.x - -3.2, p.z - -10);

    if (d < 2.0) {
      this.pickupKey();
    }
  }

  pickupKey(): void {
    if (this.hasKey) return;
    this.hasKey = true;
    this.questStatus = 'Key Acquired! Head to the Iron Gate at the end of the hall';

    if (this.keyEntity) {
      this.keyEntity.visible = false;
    }

    sfx.playKeyPickup();
    this.engine.events.emit('item.pickup', { item: 'rusty_key' });
  }

  unlockDoor(): void {
    if (this.isDoorOpen) return;
    this.isDoorOpen = true;
    this.questStatus = 'Gate Unlocked! Escaped the Manor!';

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

  update(): void {
    if (!this.playerBody) return;

    const pPos = this.playerBody.translation();
    const camera = this.engine.native.camera;

    // Head bobbing
    const bobOffset = Math.sin(this.walkBob) * 0.05;
    camera.position.set(pPos.x, pPos.y + 0.6 + bobOffset, pPos.z);

    // Camera Direction
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    camera.lookAt(pPos.x + dir.x, pPos.y + 0.6 + dir.y, pPos.z + dir.z);

    // Flashlight follows camera position & look target
    if (this.flashlight) {
      this.flashlight.position.copy(camera.position);
      this.flashlight.target.position.set(
        camera.position.x + dir.x * 10,
        camera.position.y + dir.y * 10,
        camera.position.z + dir.z * 10
      );
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
      this.keyEntity.position.y = 1.2 + Math.sin(Date.now() * 0.003) * 0.08;
    }
  }

  dispose(): void {
    this.engine.dispose();
  }
}
