/**
 * Renderoni Web Demo: Golden Quickstart & Physics Obstacle Arena
 *
 * Full Dynamic Physics & Collision Playground:
 * - KCC Hero Character (WASD, Sprint, Jump, Smooth Chase Camera)
 * - Dynamic Physical Crates & Bouncy Spheres (Pushable, Collidable, Stackable)
 * - Super Jump Trampolines & Elevating Moving Platforms
 * - 8 Collectible Golden Coins with Sparkle VFX Fireworks & Sound Synthesis
 * - Real-time Physics Actions: Spawn 10 Spheres, Spawn 15 Crates, Radial Explosion Blast
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RenderoniEngine } from '../core/engine.js';
import { body, kccPlayer, light } from '../presets/index.js';
import { sfx } from './audio-sfx.js';

export interface QuickstartTelemetry {
  playerPos: [number, number, number];
  coinsCollected: number;
  totalCoins: number;
  dynamicBodyCount: number;
  lastAction: string;
}

export class QuickstartGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;

  // Hero Player Entity
  private hero: any;
  private heroMesh!: THREE.Group;

  // Dynamic Physics Props Pool
  private dynamicBodies: Array<{ mesh: THREE.Mesh; body: RAPIER.RigidBody }> = [];

  // Moving Platform
  private movingPlatBody!: RAPIER.RigidBody;
  private movingPlatMesh!: THREE.Mesh;

  // Coins
  private coins: Array<{ id: string; pos: [number, number, number]; mesh: THREE.Group; collected: boolean }> = [];
  private coinsCollected = 0;
  private particles: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; life: number }> = [];

  // Jump Pads
  private jumpPads: Array<{ pos: [number, number, number]; mesh: THREE.Mesh }> = [];

  // Controls & Cleanup
  private keys: Record<string, boolean> = {};
  private unbind: Array<() => void> = [];
  private lastAction = 'Explore and push physics boxes!';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -20.0, 0],
      loop: {
        enabled: true,
        title: 'Golden Quickstart',
        subtitle: 'Move, jump, blast physics props, and collect all 8 coins.',
      },
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    const camera = this.engine.native.camera;
    scene.background = new THREE.Color(0x38bdf8);
    scene.fog = new THREE.Fog(0x38bdf8, 40, 140);

    // 1. Lighting
    this.engine.add(light({ type: 'directional', intensity: 1.4, position: [30, 50, 20] }));
    this.engine.add(light({ type: 'ambient', intensity: 0.4, color: 0xffffff }));

    // 2. Arena Arena Floor & Boundary Walls
    this.buildArenaEnvironment();

    // 3. Spawn Hero KCC Player
    this.spawnHero();

    // Set initial camera position immediately behind hero
    camera.position.set(0, 1.2 + 6.5, 10 + 14);
    camera.lookAt(0, 1.2 + 1.2, 10);

    // 4. Build Obstacle Course: Platforms, Ramps & Trampolines
    this.buildObstacleCourse();

    // 5. Spawn Initial Dynamic Wooden Crates & Bouncy Spheres
    this.spawnBoxes(8);
    this.spawnSpheres(6);

    // 6. Spawn Collectible Coins
    this.spawnCoinTrail();

    // 7. Register Action Handlers for Agent Inspector / UI Buttons
    this.setupActions();

    // 8. Setup Controls
    this.setupControls();

    // Start presentation loop
    this.engine.start((dt) => this.update(dt));
  }

  private buildArenaEnvironment(): void {
    const scene = this.engine.native.scene;

    // Floor
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.8 });
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(70, 1, 70), floorMat);
    floorMesh.position.set(0, -0.5, 0);
    scene.add(floorMesh);

    this.engine.add(
      body({
        id: 'ground_floor',
        shape: 'box',
        type: 'fixed',
        size: [70, 1, 70],
        position: [0, -0.5, 0],
      })
    );

    // Boundary walls (to keep physics balls in arena)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.7 });
    for (let w = 0; w < 4; w++) {
      const isZ = w % 2 === 0;
      const sign = w < 2 ? 1 : -1;
      const wx = isZ ? 0 : sign * 35;
      const wz = isZ ? sign * 35 : 0;
      const sizeX = isZ ? 70 : 1;
      const sizeZ = isZ ? 1 : 70;

      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, 4, sizeZ), wallMat);
      wallMesh.position.set(wx, 2, wz);
      scene.add(wallMesh);

      this.engine.add(
        body({
          id: `wall_${w}`,
          shape: 'box',
          type: 'fixed',
          size: [sizeX, 4, sizeZ],
          position: [wx, 2, wz],
        })
      );
    }
  }

  private spawnHero(): void {
    const scene = this.engine.native.scene;
    this.hero = this.engine.add(
      kccPlayer({
        id: 'hero',
        position: [0, 1.2, 10],
        moveSpeed: 7.0,
      })
    );

    // Visual Mesh for Hero
    this.heroMesh = new THREE.Group();
    const heroMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.2 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.4 });

    const bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.7, 8, 16), heroMat);
    bodyMesh.position.y = 0.75;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.25), headMat);
    visor.position.set(0, 1.05, -0.3);

    this.heroMesh.add(bodyMesh, visor);
    this.heroMesh.position.set(0, 1.2, 10);
    scene.add(this.heroMesh);
  }

  private buildObstacleCourse(): void {
    const scene = this.engine.native.scene;
    const platMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.6 });
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.7 });

    // Raised Platforms
    const platforms: Array<[number, number, number, number, number, number]> = [
      [-16, 2.5, -12, 10, 1, 10],
      [16, 4.0, -12, 10, 1, 10],
      [0, 6.0, -22, 12, 1, 8],
    ];

    platforms.forEach((p, idx) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p[3], p[4], p[5]), platMat);
      mesh.position.set(p[0], p[1], p[2]);
      scene.add(mesh);

      this.engine.add(
        body({
          id: `platform_${idx}`,
          shape: 'box',
          type: 'fixed',
          size: [p[3], p[4], p[5]],
          position: [p[0], p[1], p[2]],
        })
      );
    });

    // Incline Ramps
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 12), rampMat);
    ramp.position.set(-16, 1.2, 0);
    ramp.rotation.x = -Math.PI / 8;
    scene.add(ramp);

    // Super Jump Trampolines
    this.createJumpPad(16, 0.2, 2);
    this.createJumpPad(-16, 3.2, -12);

    // Moving Platform (Elevator)
    const movingMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.6 });
    this.movingPlatMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 6), movingMat);
    this.movingPlatMesh.position.set(0, 2, 0);
    scene.add(this.movingPlatMesh);

    const bDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 2, 0);
    this.movingPlatBody = this.engine.native.world.createRigidBody(bDesc);
    const cDesc = RAPIER.ColliderDesc.cuboid(3, 0.3, 3);
    this.engine.native.world.createCollider(cDesc, this.movingPlatBody);
  }

  private createJumpPad(x: number, y: number, z: number): void {
    const scene = this.engine.native.scene;
    const padMat = new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xdb2777, emissiveIntensity: 0.6 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 16), padMat);
    pad.position.set(x, y, z);
    scene.add(pad);

    this.jumpPads.push({ pos: [x, y, z], mesh: pad });
  }

  spawnBoxes(count: number = 10): void {
    const scene = this.engine.native.scene;
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8, metalness: 0.1 });

    for (let i = 0; i < count; i++) {
      const size = 1.0 + Math.random() * 0.4;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
      const px = (Math.random() - 0.5) * 20;
      const pz = -6 + (Math.random() - 0.5) * 16;
      const py = 6 + i * 1.5;
      mesh.position.set(px, py, pz);
      scene.add(mesh);

      const bDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(px, py, pz);
      const body = this.engine.native.world.createRigidBody(bDesc);
      const cDesc = RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2).setRestitution(0.2).setFriction(0.6);
      this.engine.native.world.createCollider(cDesc, body);

      this.dynamicBodies.push({ mesh, body });
    }
    this.lastAction = `Spawned ${count} wooden crates`;
  }

  spawnSpheres(count: number = 8): void {
    const scene = this.engine.native.scene;
    const sphereColors = [0xef4444, 0x3b82f6, 0x10b981, 0xa855f7, 0xf59e0b];

    for (let i = 0; i < count; i++) {
      const radius = 0.6 + Math.random() * 0.3;
      const mat = new THREE.MeshStandardMaterial({
        color: sphereColors[i % sphereColors.length],
        roughness: 0.2,
        metalness: 0.7,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16), mat);
      const px = (Math.random() - 0.5) * 24;
      const pz = -4 + (Math.random() - 0.5) * 20;
      const py = 8 + i * 1.8;
      mesh.position.set(px, py, pz);
      scene.add(mesh);

      const bDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(px, py, pz);
      const body = this.engine.native.world.createRigidBody(bDesc);
      const cDesc = RAPIER.ColliderDesc.ball(radius).setRestitution(0.75).setFriction(0.3);
      this.engine.native.world.createCollider(cDesc, body);

      this.dynamicBodies.push({ mesh, body });
    }
    this.lastAction = `Spawned ${count} bouncy spheres`;
  }

  explode(): void {
    const heroPos = this.hero.position;
    const blastRadius = 24.0;
    const blastForce = 4500.0;

    for (const item of this.dynamicBodies) {
      const t = item.body.translation();
      const dx = t.x - heroPos[0];
      const dy = t.y - heroPos[1];
      const dz = t.z - heroPos[2];
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < blastRadius * blastRadius && distSq > 0.1) {
        const dist = Math.sqrt(distSq);
        const force = ((blastRadius - dist) / blastRadius) * blastForce;
        item.body.applyImpulse({
          x: (dx / dist) * force,
          y: Math.max(10, (dy / dist) * force + 500),
          z: (dz / dist) * force,
        }, true);
      }
    }

    sfx.playDecouple();
    this.lastAction = '💥 Radial Physics Blast Triggered!';
  }

  private spawnCoinTrail(): void {
    const coinPositions: Array<[number, number, number]> = [
      [0, 1.5, 4],
      [-16, 4.0, -12],
      [16, 5.5, -12],
      [0, 7.5, -22],
      [0, 3.5, 0],
      [-16, 2.5, 0],
      [8, 1.5, -6],
      [-8, 1.5, 8],
    ];

    const scene = this.engine.native.scene;
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.6,
      metalness: 0.9,
      roughness: 0.1,
    });

    this.coins = coinPositions.map((pos, idx) => {
      const coinGroup = new THREE.Group();
      coinGroup.position.set(...pos);

      const coinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16), goldMat);
      coinMesh.rotation.x = Math.PI / 2;
      coinGroup.add(coinMesh);
      scene.add(coinGroup);

      return {
        id: `coin_${idx}`,
        pos,
        mesh: coinGroup,
        collected: false,
      };
    });
  }

  respawnCoins(): void {
    for (const c of this.coins) {
      c.collected = false;
      c.mesh.visible = true;
    }
    this.coinsCollected = 0;
    this.lastAction = 'Respawned all 8 golden coins';
  }

  private setupActions(): void {
    this.engine.actions.register({
      name: 'physics.spawnBoxes',
      handle: () => this.spawnBoxes(10),
    });

    this.engine.actions.register({
      name: 'physics.spawnSpheres',
      handle: () => this.spawnSpheres(8),
    });

    this.engine.actions.register({
      name: 'physics.explode',
      handle: () => this.explode(),
    });

    this.engine.actions.register({
      name: 'physics.respawnCoins',
      handle: () => this.respawnCoins(),
    });
  }

  private setupControls(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;
      if (!this.engine.loop.playing) return;

      if (e.code === 'KeyE') this.explode();
      if (e.code === 'KeyB') this.spawnBoxes(5);
      if (e.code === 'KeyN') this.spawnSpheres(5);
    };
    window.addEventListener('keydown', onKeyDown);
    this.unbind.push(() => window.removeEventListener('keydown', onKeyDown));

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keyup', onKeyUp);
    this.unbind.push(() => window.removeEventListener('keyup', onKeyUp));
  }

  getTelemetry(): QuickstartTelemetry {
    return {
      playerPos: [
        parseFloat(this.hero.position[0].toFixed(1)),
        parseFloat(this.hero.position[1].toFixed(1)),
        parseFloat(this.hero.position[2].toFixed(1)),
      ],
      coinsCollected: this.coinsCollected,
      totalCoins: this.coins.length,
      dynamicBodyCount: this.dynamicBodies.length,
      lastAction: this.lastAction,
    };
  }

  update(dt: number): void {
    if ((window as unknown as { __renderoniPaused?: boolean }).__renderoniPaused || !this.engine.loop.playing) return;
    // 1. KCC Movement
    let dx = 0;
    let dz = 0;
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) dz -= 1;
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) dz += 1;
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) dx += 1;
    const programmaticMove = this.engine.input.getMoveVector();
    dx += programmaticMove.x;
    dz -= programmaticMove.z;

    const isSprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const speedMult = isSprint ? 1.7 : 1.0;
    this.hero.actions.move({ x: dx * speedMult, z: dz * speedMult });

    // Jump & Trampoline detection
    const hPos = this.hero.position;
    for (const pad of this.jumpPads) {
      const pDistSq = Math.pow(hPos[0] - pad.pos[0], 2) + Math.pow(hPos[2] - pad.pos[2], 2);
      if (pDistSq < 2.5 && Math.abs(hPos[1] - pad.pos[1]) < 1.0) {
        this.hero.actions.jump();
        sfx.playKeyPickup();
      }
    }

    if (this.keys['Space'] || this.engine.input.isButtonPressed('jump')) {
      this.hero.actions.jump();
    }
    if (this.engine.input.consumeButtonPress('blast')) this.explode();

    // Sync Hero Mesh Visuals
    this.heroMesh.position.set(this.hero.position[0], this.hero.position[1] - 0.9, this.hero.position[2]);
    if (dx !== 0 || dz !== 0) {
      this.heroMesh.rotation.y = Math.atan2(dx, dz);
    }

    // 2. Animate Moving Platform Elevator
    const elevY = 3.5 + Math.sin(Date.now() * 0.002) * 2.5;
    this.movingPlatBody.setNextKinematicTranslation({ x: 0, y: elevY, z: 0 });
    this.movingPlatMesh.position.set(0, elevY, 0);

    // 3. Sync Dynamic Rigid Bodies to Meshes
    for (const item of this.dynamicBodies) {
      const t = item.body.translation();
      const r = item.body.rotation();
      item.mesh.position.set(t.x, t.y, t.z);
      item.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }

    // 4. Coin Collection & Spin
    for (const coin of this.coins) {
      if (coin.collected) continue;
      coin.mesh.rotation.y += dt * 3.0;

      const dSq = Math.pow(hPos[0] - coin.pos[0], 2) + Math.pow(hPos[1] - coin.pos[1], 2) + Math.pow(hPos[2] - coin.pos[2], 2);
      if (dSq < 2.2) {
        coin.collected = true;
        coin.mesh.visible = false;
        this.coinsCollected++;
        sfx.playKeyPickup();
        this.spawnCoinFireworks(coin.pos);
      }
    }

    // 5. Update Fireworks Particles
    const scene = this.engine.native.scene;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt * 2.0;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(Math.max(0.01, p.life));
      if (p.life <= 0) {
        scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    // 6. Smooth Chase Camera
    const camera = this.engine.native.camera;
    const targetCam = new THREE.Vector3(this.hero.position[0], this.hero.position[1] + 6.5, this.hero.position[2] + 14.0);
    camera.position.lerp(targetCam, 0.14);
    camera.lookAt(this.hero.position[0], this.hero.position[1] + 1.2, this.hero.position[2]);
  }

  private spawnCoinFireworks(pos: [number, number, number]): void {
    const scene = this.engine.native.scene;
    const pGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    for (let i = 0; i < 16; i++) {
      const p = new THREE.Mesh(pGeo, pMat);
      p.position.set(...pos);
      scene.add(p);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 6 + 2,
        (Math.random() - 0.5) * 8
      );
      this.particles.push({ mesh: p, vel, life: 1.0 });
    }
  }

  dispose(): void {
    for (const fn of this.unbind) fn();
    this.unbind.length = 0;
    this.engine.dispose();
  }
}
