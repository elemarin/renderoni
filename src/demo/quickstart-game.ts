/**
 * Renderoni Web Demo: Live Quickstart Example
 *
 * Direct interactive browser implementation of the README Quickstart:
 * - Environment & directional lighting
 * - Hero player with KCC controller (WASD / Space)
 * - Interactive Golden Coin sensor
 * - Sensor trigger event with spatial audio, particle burst VFX, and coin destruction
 */

import * as THREE from 'three';
import { RenderoniEngine } from '../core/engine.js';
import { body, kccPlayer, sensor, light } from '../presets/index.js';
import { sfx } from './audio-sfx.js';

export interface QuickstartTelemetry {
  playerPos: [number, number, number];
  coinsCollected: number;
  coinActive: boolean;
}

export class QuickstartGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;
  private coinEntity: any = null;
  private coinMesh: THREE.Group | null = null;
  private coinsCollected = 0;
  private particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; life: number }> = [];

  // Controls
  private keys: Record<string, boolean> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -20.0, 0],
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    scene.background = new THREE.Color(0x38bdf8);
    scene.fog = new THREE.FogExp2(0x38bdf8, 0.015);

    // 1. Lighting
    this.engine.add(light({ type: 'directional', intensity: 2.5, position: [20, 40, 20] }));
    this.engine.add(light({ type: 'ambient', intensity: 0.6, color: 0xffffff }));

    // 2. Arena Floor & Visual Platform
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.8 });
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), floorMat);
    floorMesh.position.set(0, -0.5, 0);
    scene.add(floorMesh);

    this.engine.add(
      body({
        id: 'ground_floor',
        shape: 'box',
        type: 'fixed',
        size: [60, 1, 60],
        position: [0, -0.5, 0],
      })
    );

    // Decorative columns
    const colMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
    for (let x = -20; x <= 20; x += 20) {
      for (let z = -20; z <= 20; z += 20) {
        if (x !== 0 || z !== 0) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 6, 16), colMat);
          col.position.set(x, 3, z);
          scene.add(col);
        }
      }
    }

    // 3. Add Collectible Golden Coin
    this.spawnCoin([5, 1.4, 0]);

    // 4. Add Player Character (KCC Player with WASD movement)
    this.engine.add(
      kccPlayer({
        id: 'hero',
        position: [0, 1.5, 0],
        moveSpeed: 7.5,
        jumpSpeed: 9.0,
      })
    );

    // 5. Handle Gameplay Events
    this.engine.events.on('sensor.enter', (evt: any) => {
      const sensorId = evt?.sensor?.id ?? evt?.sensor;
      const targetId = evt?.target?.id ?? evt?.target;

      if (sensorId === 'golden_coin' && (targetId === 'hero' || targetId?.includes('player') || targetId?.includes('hero'))) {
        if (this.coinEntity) {
          this.coinsCollected++;
          sfx.playKeyPickup();
          this.spawnParticleBurst([5, 1.4, 0]);

          // Destroy coin entity
          if (typeof this.coinEntity.destroy === 'function') {
            this.coinEntity.destroy();
          } else {
            this.engine.remove('golden_coin');
          }

          if (this.coinMesh) {
            scene.remove(this.coinMesh);
            this.coinMesh = null;
          }
          this.coinEntity = null;
        }
      }
    });

    // 6. Action Handlers
    this.engine.actions.register({
      name: 'quickstart.respawnCoin',
      handle: () => this.respawnCoin(),
    });

    // Setup Keyboard Controls
    this.setupControls();

    // Start presentation loop
    this.engine.start((dt) => this.update(dt));
  }

  private spawnCoin(pos: [number, number, number]): void {
    const scene = this.engine.native.scene;

    if (this.coinMesh) {
      scene.remove(this.coinMesh);
    }

    // 3D Coin Mesh
    this.coinMesh = new THREE.Group();
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x78350f,
    });
    const coinDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 24), coinMat);
    coinDisc.rotation.z = Math.PI / 2;
    this.coinMesh.add(coinDisc);
    this.coinMesh.position.set(pos[0], pos[1], pos[2]);
    scene.add(this.coinMesh);

    // Register Sensor in Engine
    this.coinEntity = this.engine.add(
      sensor({
        id: 'golden_coin',
        shape: 'sphere',
        radius: 0.9,
        position: pos,
      })
    );
  }

  private spawnParticleBurst(origin: [number, number, number]): void {
    const scene = this.engine.native.scene;
    const partGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });

    for (let i = 0; i < 24; i++) {
      const pMesh = new THREE.Mesh(partGeo, partMat);
      pMesh.position.set(origin[0], origin[1], origin[2]);
      scene.add(pMesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8.0,
        Math.random() * 6.0 + 2.0,
        (Math.random() - 0.5) * 8.0
      );

      this.particles.push({ mesh: pMesh, vel, life: 1.0 });
    }
  }

  private setupControls(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  respawnCoin(): void {
    if (!this.coinEntity) {
      this.spawnCoin([5, 1.4, 0]);
    }
  }

  getTelemetry(): QuickstartTelemetry {
    const hero = this.engine.entities.get('hero');
    const p = hero?.position ?? [0, 0, 0];
    return {
      playerPos: [parseFloat(p[0].toFixed(1)), parseFloat(p[1].toFixed(1)), parseFloat(p[2].toFixed(1))],
      coinsCollected: this.coinsCollected,
      coinActive: this.coinEntity !== null,
    };
  }

  update(dt: number): void {
    const scene = this.engine.native.scene;
    const hero = this.engine.entities.get('hero');

    // 1. Process WASD Movement for Hero
    if (hero) {
      let moveX = 0;
      let moveZ = 0;

      if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) moveZ -= 1;
      if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) moveZ += 1;
      if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) moveX -= 1;
      if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) moveX += 1;

      if (this.keys['Space']) {
        hero.actions.jump?.();
      }

      hero.actions.move?.({ x: moveX, z: moveZ });

      // Camera follow hero
      const p = hero.position;
      const camera = this.engine.native.camera;
      camera.position.lerp(new THREE.Vector3(p[0], p[1] + 6.0, p[2] + 12.0), 0.12);
      camera.lookAt(p[0], p[1] + 1.0, p[2]);
    }

    // 2. Animate Golden Coin (Spinning & Floating)
    if (this.coinMesh) {
      this.coinMesh.rotation.y += 2.5 * dt;
      this.coinMesh.position.y = 1.4 + Math.sin(Date.now() * 0.004) * 0.15;
    }

    // 3. Update Particle Burst
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt * 2.0;
      p.vel.y -= 12.0 * dt; // Gravity on particles
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(Math.max(0.01, p.life));

      if (p.life <= 0) {
        scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.engine.dispose();
  }
}
