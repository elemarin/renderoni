/**
 * Renderoni Web Demo: Vast Procedural Voxel Sandbox (Archetype B)
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RenderoniEngine } from '../core/engine.js';
import { light } from '../presets/light.js';
import { ObservationEngine } from '../core/observations.js';
import { sfx } from './audio-sfx.js';

export interface VoxelTelemetry {
  blockCount: number;
  playerPos: [number, number, number];
  targetedBlock: string | null;
  selectedBlockType: string;
}

export class VoxelGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;
  private playerBody!: RAPIER.RigidBody;
  private blocks: Map<string, { x: number; y: number; z: number; type: string }> = new Map();

  // First-Person Controls & Camera
  private keys: Record<string, boolean> = {};
  private yaw = 0;
  private pitch = 0;
  private isLocked = false;
  private targetedEntityId: string | null = null;
  private targetedPoint: [number, number, number] | null = null;
  private selectedTypeIndex = 0;
  private blockTypes = ['grass', 'stone', 'wood', 'leaves', 'sand', 'lantern'];

  // Visual Materials
  private materials: Record<string, THREE.Material> = {
    grass: new THREE.MeshStandardMaterial({ color: 0x4fa644, roughness: 0.8 }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x825432, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x717982, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xa86938, roughness: 0.6 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x2b7a21, roughness: 0.7 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xe0c878, roughness: 0.9 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 }),
    lantern: new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, roughness: 0.2 }),
  };
  private boxGeometry = new THREE.BoxGeometry(1, 1, 1);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -24.0, 0],
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    scene.background = new THREE.Color(0x7ec0ee);
    scene.fog = new THREE.FogExp2(0x7ec0ee, 0.012);

    // 1. Lighting & Sun
    this.engine.add(light({ type: 'directional', intensity: 2.2, position: [60, 100, 60] }));
    this.engine.add(light({ type: 'ambient', intensity: 0.65, color: 0xffffff }));

    // Ocean Water Bed
    const waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.1, transparent: true, opacity: 0.75 })
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = 0.4;
    scene.add(waterMesh);

    // 2. Generate Expansive Procedural Voxel Biomes
    this.generateVastWorld();

    // 3. Player Character Controller (Responsive Dynamic Body)
    this.playerBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 12.0, 0)
        .lockRotations()
        .setAdditionalMass(3.0)
        .setLinearDamping(0.2)
        .setCanSleep(false)
    );
    const playerCollider = this.engine.native.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.7, 0.35).setFriction(0.0),
      this.playerBody
    );

    this.engine.add({
      id: 'player_miner',
      tags: ['player', 'kcc'],
      native: {
        rapier: { body: this.playerBody, colliders: [playerCollider] },
      },
    });

    // 4. Setup Controls
    this.setupControls();

    // 5. Movement & Auto-Stepping Loop
    this.engine.systems.add({
      phase: 'prePhysics',
      update: () => {
        this.updateMovement();
      },
    });

    // Actions
    this.engine.actions.register({
      name: 'voxel.break',
      handle: () => this.breakTargetedBlock(),
    });

    this.engine.actions.register({
      name: 'voxel.place',
      handle: (type?: string) => this.placeAdjacentBlock(type),
    });

    // Start engine presentation loop with camera update
    this.engine.start(() => this.update());
  }

  private generateVastWorld(): void {
    const radius = 22; // 45x45 block grid (~2025 voxels)
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        // Multi-frequency Perlin terrain noise
        const n1 = Math.sin(x * 0.18) * Math.cos(z * 0.18) * 3.5;
        const n2 = Math.sin((x + z) * 0.08) * 4.0;
        const n3 = Math.cos(x * 0.05) * Math.sin(z * 0.05) * 2.0;
        const rawH = Math.round(n1 + n2 + n3 + 3.0);
        const h = Math.max(0, rawH);

        // Bedrock / Stone bottom
        for (let y = -2; y < h - 2; y++) {
          this.createBlock(x, y, z, 'stone');
        }

        // Subsurface Dirt
        if (h > 0) {
          for (let y = Math.max(-2, h - 2); y < h; y++) {
            this.createBlock(x, y, z, 'dirt');
          }
        }

        // Surface Layer by altitude
        if (h === 0 || h === 1) {
          this.createBlock(x, h, z, 'sand'); // Sand Shoreline
        } else if (h >= 9) {
          this.createBlock(x, h, z, 'snow'); // Snowy Mountain Peaks
        } else {
          this.createBlock(x, h, z, 'grass'); // Lush Meadow
        }

        // Procedural Trees
        if (h >= 2 && h <= 7 && (x + 100) % 6 === 0 && (z + 100) % 6 === 0) {
          for (let ty = 1; ty <= 4; ty++) {
            this.createBlock(x, h + ty, z, 'wood');
          }
          for (let lx = -1; lx <= 1; lx++) {
            for (let lz = -1; lz <= 1; lz++) {
              for (let ly = 4; ly <= 5; ly++) {
                if (lx !== 0 || lz !== 0 || ly === 5) {
                  this.createBlock(x + lx, h + ly, z + lz, 'leaves');
                }
              }
            }
          }
        }
      }
    }
  }

  private createBlock(x: number, y: number, z: number, type: string): void {
    const id = `block_${x}_${y}_${z}`;
    if (this.blocks.has(id)) return;

    const mat = this.materials[type] ?? this.materials.grass;
    const mesh = new THREE.Mesh(this.boxGeometry, mat);
    mesh.position.set(x, y, z);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const bodyInst = this.engine.native.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    const collider = this.engine.native.world.createCollider(colliderDesc, bodyInst);

    this.engine.add({
      id,
      tags: ['voxel', type],
      native: {
        three: { object: mesh },
        rapier: { body: bodyInst, colliders: [collider] },
      },
    });

    this.blocks.set(id, { x, y, z, type });
  }

  private setupControls(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;

      // Hotbar block selector (keys 1-6)
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(e.code)) {
        const idx = parseInt(e.code.replace('Digit', '')) - 1;
        if (idx >= 0 && idx < this.blockTypes.length) {
          this.selectedTypeIndex = idx;
        }
      }

      if (e.code === 'Space') {
        this.jump();
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
      } else {
        this.breakTargetedBlock();
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.isLocked) {
        this.placeAdjacentBlock();
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
      this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
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

    const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const speed = isSprinting ? 12.0 : 7.0;

    const moveX = (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) * speed;
    const moveZ = (-Math.cos(this.yaw) * forward + Math.sin(this.yaw) * strafe) * speed;

    const currentVel = this.playerBody.linvel();
    this.playerBody.setLinvel(new RAPIER.Vector3(moveX, currentVel.y, moveZ), true);

    // Auto-stepping on 1-block obstacles
    if (forward !== 0 || strafe !== 0) {
      const pPos = this.playerBody.translation();
      const kneeOrigin: [number, number, number] = [pPos.x, pPos.y - 0.3, pPos.z];
      const dir: [number, number, number] = [moveX, 0, moveZ];
      const len = Math.hypot(dir[0], dir[2]);

      if (len > 0.1) {
        const stepHit = ObservationEngine.raycast(
          this.engine,
          kneeOrigin,
          [dir[0] / len, 0, dir[2] / len],
          0.85
        );
        if (stepHit.hit && stepHit.entityId?.startsWith('block_')) {
          this.playerBody.setLinvel(new RAPIER.Vector3(moveX, 6.2, moveZ), true);
        }
      }
    }
  }

  jump(): void {
    if (!this.playerBody) return;
    const vel = this.playerBody.linvel();
    if (Math.abs(vel.y) < 0.5) {
      this.playerBody.setLinvel(new RAPIER.Vector3(vel.x, 9.5, vel.z), true);
    }
  }

  breakTargetedBlock(): void {
    if (this.targetedEntityId && this.targetedEntityId.startsWith('block_')) {
      const blockId = this.targetedEntityId;
      this.engine.remove(blockId);
      this.blocks.delete(blockId);
      sfx.playBlockBreak();
      this.engine.events.emit('voxel.broken', { entityId: blockId });
      this.targetedEntityId = null;
    }
  }

  placeAdjacentBlock(overrideType?: string): void {
    if (this.targetedPoint && this.targetedEntityId) {
      const p = this.targetedPoint;
      const nx = Math.round(p[0]);
      const ny = Math.round(p[1]);
      const nz = Math.round(p[2]);

      const blockId = `block_${nx}_${ny}_${nz}`;
      if (!this.blocks.has(blockId)) {
        const type = overrideType ?? this.blockTypes[this.selectedTypeIndex];
        this.createBlock(nx, ny, nz, type);
        sfx.playBlockPlace();
        this.engine.events.emit('voxel.placed', { entityId: blockId, type });
      }
    }
  }

  getTelemetry(): VoxelTelemetry {
    const p = this.playerBody ? this.playerBody.translation() : { x: 0, y: 0, z: 0 };
    return {
      blockCount: this.blocks.size,
      playerPos: [parseFloat(p.x.toFixed(1)), parseFloat(p.y.toFixed(1)), parseFloat(p.z.toFixed(1))],
      targetedBlock: this.targetedEntityId,
      selectedBlockType: this.blockTypes[this.selectedTypeIndex],
    };
  }

  update(): void {
    if (!this.playerBody) return;

    const pPos = this.playerBody.translation();
    const camera = this.engine.native.camera;

    // Attach camera to player eyes
    camera.position.set(pPos.x, pPos.y + 0.7, pPos.z);

    // Compute Camera Look Vector
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    camera.lookAt(pPos.x + dir.x, pPos.y + 0.7 + dir.y, pPos.z + dir.z);

    // Center Crosshair Raycast to detect targeted block
    const eyePos: [number, number, number] = [pPos.x, pPos.y + 0.7, pPos.z];
    const rayDir: [number, number, number] = [dir.x, dir.y, dir.z];

    const hit = ObservationEngine.raycast(this.engine, eyePos, rayDir, 6.5);
    if (hit.hit && hit.entityId?.startsWith('block_')) {
      this.targetedEntityId = hit.entityId;
      this.targetedPoint = hit.point ?? null;
    } else {
      this.targetedEntityId = null;
      this.targetedPoint = null;
    }
  }

  dispose(): void {
    this.engine.dispose();
  }
}
