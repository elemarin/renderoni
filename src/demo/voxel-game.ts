/**
 * Renderoni Web Demo: Infinite Voxel Terrain Sandbox (Archetype B)
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
}

export class VoxelGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;
  private playerBody!: RAPIER.RigidBody;
  private blocks: Map<string, { x: number; y: number; z: number; type: string }> = new Map();

  // First-Person PointerLock Camera & Controls
  private keys: Record<string, boolean> = {};
  private yaw = 0;
  private pitch = 0;
  private isLocked = false;
  private targetedEntityId: string | null = null;
  private targetedPoint: [number, number, number] | null = null;

  // Visuals & Materials
  private grassMaterial = new THREE.MeshStandardMaterial({ color: 0x4fa644, roughness: 0.8 });
  private dirtMaterial = new THREE.MeshStandardMaterial({ color: 0x825432, roughness: 0.9 });
  private stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.7 });
  private woodMaterial = new THREE.MeshStandardMaterial({ color: 0xa86938, roughness: 0.6 });
  private leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x317a26, roughness: 0.7 });
  private boxGeometry = new THREE.BoxGeometry(1, 1, 1);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -22.0, 0],
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    scene.background = new THREE.Color(0x82b4ff);
    scene.fog = new THREE.FogExp2(0x82b4ff, 0.015);

    // 1. Lighting
    this.engine.add(light({ type: 'directional', intensity: 2.0, position: [30, 60, 40] }));
    this.engine.add(light({ type: 'ambient', intensity: 0.6, color: 0xffffff }));

    // 2. Generate Initial Procedural Voxel Chunks
    this.generateTerrain();

    // 3. First-Person Player Body
    this.playerBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 6.0, 0)
        .lockRotations()
        .setAdditionalMass(3.0)
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

    // 4. Setup First-Person Event Listeners
    this.setupControls();

    // 5. Physics Movement & Auto-Stepping System
    this.engine.systems.add({
      phase: 'prePhysics',
      update: () => {
        this.updateMovement();
      },
    });

    // 6. Action Handlers
    this.engine.actions.register({
      name: 'voxel.break',
      handle: () => this.breakTargetedBlock(),
    });

    this.engine.actions.register({
      name: 'voxel.place',
      handle: () => this.placeAdjacentBlock(),
    });

    // Start presentation loop with update hook
    this.engine.start(() => this.update());
  }

  private generateTerrain(): void {
    const size = 16;
    for (let x = -size; x <= size; x++) {
      for (let z = -size; z <= size; z++) {
        // Procedural height formula
        const h = Math.floor(
          Math.sin(x * 0.25) * 1.5 + Math.cos(z * 0.25) * 1.5 + Math.sin((x + z) * 0.1) * 2.0
        );

        // Bedrock / Stone
        for (let y = -2; y < h - 1; y++) {
          this.createBlock(x, y, z, 'stone');
        }
        // Dirt
        if (h > -2) {
          this.createBlock(x, h - 1, z, 'dirt');
        }
        // Grass top
        this.createBlock(x, h, z, 'grass');

        // Occasional Trees
        if (x % 7 === 0 && z % 7 === 0 && Math.abs(x) > 2 && Math.abs(z) > 2) {
          for (let ty = 1; ty <= 3; ty++) {
            this.createBlock(x, h + ty, z, 'wood');
          }
          for (let lx = -1; lx <= 1; lx++) {
            for (let lz = -1; lz <= 1; lz++) {
              for (let ly = 3; ly <= 4; ly++) {
                if (lx !== 0 || lz !== 0 || ly === 4) {
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

    let mat = this.grassMaterial;
    if (type === 'dirt') mat = this.dirtMaterial;
    if (type === 'stone') mat = this.stoneMaterial;
    if (type === 'wood') mat = this.woodMaterial;
    if (type === 'leaves') mat = this.leavesMaterial;

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

    const speed = 7.5;
    const moveX = (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) * speed;
    const moveZ = (-Math.cos(this.yaw) * forward + Math.sin(this.yaw) * strafe) * speed;

    const currentVel = this.playerBody.linvel();
    this.playerBody.setLinvel(new RAPIER.Vector3(moveX, currentVel.y, moveZ), true);

    // Auto-stepping up 1-block steps: check forward obstacle
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
          this.playerBody.setLinvel(new RAPIER.Vector3(moveX, 6.0, moveZ), true);
        }
      }
    }
  }

  jump(): void {
    if (!this.playerBody) return;
    const vel = this.playerBody.linvel();
    if (Math.abs(vel.y) < 0.4) {
      this.playerBody.setLinvel(new RAPIER.Vector3(vel.x, 8.5, vel.z), true);
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

  placeAdjacentBlock(): void {
    if (this.targetedPoint && this.targetedEntityId) {
      const p = this.targetedPoint;
      const nx = Math.round(p[0]);
      const ny = Math.round(p[1]);
      const nz = Math.round(p[2]);

      const blockId = `block_${nx}_${ny}_${nz}`;
      if (!this.blocks.has(blockId)) {
        this.createBlock(nx, ny, nz, 'grass');
        sfx.playBlockPlace();
        this.engine.events.emit('voxel.placed', { entityId: blockId });
      }
    }
  }

  getTelemetry(): VoxelTelemetry {
    const p = this.playerBody ? this.playerBody.translation() : { x: 0, y: 0, z: 0 };
    return {
      blockCount: this.blocks.size,
      playerPos: [parseFloat(p.x.toFixed(1)), parseFloat(p.y.toFixed(1)), parseFloat(p.z.toFixed(1))],
      targetedBlock: this.targetedEntityId,
    };
  }

  update(): void {
    if (!this.playerBody) return;

    const pPos = this.playerBody.translation();
    const camera = this.engine.native.camera;

    // Attach camera to player eyes
    camera.position.set(pPos.x, pPos.y + 0.7, pPos.z);

    // Compute Camera Look Vector from Yaw & Pitch
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    camera.lookAt(pPos.x + dir.x, pPos.y + 0.7 + dir.y, pPos.z + dir.z);

    // Center Crosshair Raycast to detect targeted block
    const eyePos: [number, number, number] = [pPos.x, pPos.y + 0.7, pPos.z];
    const rayDir: [number, number, number] = [dir.x, dir.y, dir.z];

    const hit = ObservationEngine.raycast(this.engine, eyePos, rayDir, 6.0);
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
