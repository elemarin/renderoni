/**
 * Renderoni Web Demo: KSP Rocket & Space Simulator (Archetype A)
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RenderoniEngine } from '../core/engine.js';
import { body } from '../presets/body.js';
import { light } from '../presets/light.js';
import type { EntityInstance } from '../presets/define-preset.js';
import { sfx } from './audio-sfx.js';

export interface KspTelemetry {
  altitude: number;
  velocity: number;
  throttle: number;
  stage: number;
  isLaunched: boolean;
  isStaged: boolean;
}

export class KspGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;
  private booster!: EntityInstance;
  private capsule!: EntityInstance;
  private boosterBody!: RAPIER.RigidBody;
  private capsuleBody!: RAPIER.RigidBody;
  private decouplerJoint: RAPIER.ImpulseJoint | null = null;
  private isLaunched = false;
  private isStaged = false;
  private throttle = 1.0;
  private rumbleSound = sfx.createRocketRumble();

  // Visuals
  private particles: THREE.Points | null = null;
  private particleGeo: THREE.BufferGeometry | null = null;
  private particlePositions: Float32Array = new Float32Array(800 * 3);
  private particleLifetimes: Float32Array = new Float32Array(800);
  private particleCount = 800;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -9.81, 0],
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    scene.background = new THREE.Color(0x050814);
    scene.fog = new THREE.FogExp2(0x050814, 0.002);

    // 1. Lighting
    this.engine.add(light({ type: 'directional', intensity: 2.2, position: [20, 40, 20] }));
    this.engine.add(light({ type: 'ambient', intensity: 0.5, color: 0x8899bb }));

    // 2. Stars Dome
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 2000; i++) {
      const x = (Math.random() - 0.5) * 1000;
      const y = Math.random() * 800;
      const z = (Math.random() - 0.5) * 1000;
      starPos.push(x, y, z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, transparent: true, opacity: 0.8 });
    scene.add(new THREE.Points(starGeo, starMat));

    // 3. Launchpad & Terrain
    const padMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 14, 2, 32),
      new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.8, metalness: 0.2 })
    );
    padMesh.position.set(0, 1, 0);
    scene.add(padMesh);

    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 800),
      new THREE.MeshStandardMaterial({ color: 0x111622, roughness: 0.9 })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = 0;
    scene.add(groundMesh);

    // Static physics ground
    this.engine.add(
      body({
        id: 'ground',
        shape: 'box',
        type: 'fixed',
        size: [800, 2, 800],
        position: [0, 0, 0],
      })
    );

    // Gantry Tower
    const gantry = new THREE.Mesh(
      new THREE.BoxGeometry(2, 28, 2),
      new THREE.MeshStandardMaterial({ color: 0xb53c25, metalness: 0.4, roughness: 0.6 })
    );
    gantry.position.set(-6, 14, 0);
    scene.add(gantry);

    // 4. Rocket Booster (Stage 1)
    const boosterGroup = new THREE.Group();
    const boosterCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 8.0, 32),
      new THREE.MeshStandardMaterial({ color: 0xe0e6ed, metalness: 0.3, roughness: 0.4 })
    );
    boosterGroup.add(boosterCyl);

    // Engine nozzle
    const nozzle = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 1.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a1e24, metalness: 0.8, roughness: 0.2 })
    );
    nozzle.position.set(0, -4.2, 0);
    nozzle.rotation.x = Math.PI;
    boosterGroup.add(nozzle);

    // 4 Fins
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1.8, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xb53c25 })
      );
      fin.position.set(0, -3.2, 1.2);
      const pivot = new THREE.Group();
      pivot.rotation.y = (i * Math.PI) / 2;
      pivot.add(fin);
      boosterGroup.add(pivot);
    }

    this.boosterBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 6.2, 0)
        .setAdditionalMass(5.0)
        .setCanSleep(false)
    );
    const boosterCollider = this.engine.native.world.createCollider(
      RAPIER.ColliderDesc.cylinder(4.0, 1.0),
      this.boosterBody
    );

    this.booster = this.engine.add({
      id: 'rocket_booster',
      tags: ['rocket', 'booster'],
      native: {
        three: { object: boosterGroup },
        rapier: { body: this.boosterBody, colliders: [boosterCollider] },
      },
    });

    // 5. Rocket Capsule (Stage 2)
    const capsuleGroup = new THREE.Group();
    const capsuleCone = new THREE.Mesh(
      new THREE.ConeGeometry(1.0, 3.2, 32),
      new THREE.MeshStandardMaterial({ color: 0xf3f6fa, metalness: 0.4, roughness: 0.3 })
    );
    capsuleGroup.add(capsuleCone);

    // Capsule heat shield
    const heatShield = new THREE.Mesh(
      new THREE.CylinderGeometry(1.02, 0.9, 0.4, 32),
      new THREE.MeshStandardMaterial({ color: 0x1f242d, metalness: 0.8, roughness: 0.2 })
    );
    heatShield.position.y = -1.6;
    capsuleGroup.add(heatShield);

    this.capsuleBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 11.8, 0)
        .setAdditionalMass(1.5)
        .setCanSleep(false)
    );
    const capsuleCollider = this.engine.native.world.createCollider(
      RAPIER.ColliderDesc.cone(1.6, 1.0),
      this.capsuleBody
    );

    this.capsule = this.engine.add({
      id: 'rocket_capsule',
      tags: ['rocket', 'capsule'],
      native: {
        three: { object: capsuleGroup },
        rapier: { body: this.capsuleBody, colliders: [capsuleCollider] },
      },
    });

    // 6. Connect Booster & Capsule via Fixed Impulse Joint
    const jointParams = RAPIER.JointData.fixed(
      new RAPIER.Vector3(0, 4.0, 0),
      new RAPIER.Quaternion(0, 0, 0, 1),
      new RAPIER.Vector3(0, -1.6, 0),
      new RAPIER.Quaternion(0, 0, 0, 1)
    );
    this.decouplerJoint = this.engine.native.world.createImpulseJoint(
      jointParams,
      this.boosterBody,
      this.capsuleBody,
      true
    );

    // 7. Particle System (Exhaust Plume)
    this.initParticles(scene);

    // 8. Physics System Update: Clamp Rocket on pad until launch, then apply Upward Thrust
    this.engine.systems.add({
      phase: 'prePhysics',
      update: () => {
        if (!this.isLaunched) {
          // Clamp to launchpad
          this.boosterBody.setTranslation({ x: 0, y: 6.2, z: 0 }, true);
          this.boosterBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
          this.boosterBody.setLinvel(new RAPIER.Vector3(0, 0, 0), true);
          this.boosterBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);

          if (this.decouplerJoint) {
            this.capsuleBody.setTranslation({ x: 0, y: 11.8, z: 0 }, true);
            this.capsuleBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
            this.capsuleBody.setLinvel(new RAPIER.Vector3(0, 0, 0), true);
            this.capsuleBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);
          }
          return;
        }

        if (!this.isStaged) {
          // Booster main thrust: mass (6.5) * (gravity + 32 m/s² accel)
          const thrust = 280.0 * this.throttle;
          this.boosterBody.applyImpulse(new RAPIER.Vector3(0, thrust * 0.0166, 0), true);
        } else {
          // Upper stage vacuum engine
          const thrust = 65.0 * this.throttle;
          this.capsuleBody.applyImpulse(new RAPIER.Vector3(0, thrust * 0.0166, 0), true);
        }
      },
    });

    // Register Engine Actions
    this.engine.actions.register({
      name: 'rocket.launch',
      handle: () => this.launch(),
    });

    this.engine.actions.register({
      name: 'rocket.stage',
      handle: () => this.stage(),
    });

    this.engine.actions.register({
      name: 'rocket.throttle',
      handle: (val: number) => this.setThrottle(val),
    });

    // Start engine presentation loop with camera & particle update callback
    this.engine.start((dt) => this.update(dt));
  }

  private initParticles(scene: THREE.Scene): void {
    this.particleGeo = new THREE.BufferGeometry();
    for (let i = 0; i < this.particleCount; i++) {
      this.particlePositions[i * 3 + 0] = 0;
      this.particlePositions[i * 3 + 1] = -1000;
      this.particlePositions[i * 3 + 2] = 0;
      this.particleLifetimes[i] = 0;
    }
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0xffaa33,
      size: 2.2,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(this.particleGeo, particleMat);
    scene.add(this.particles);
  }

  private updateParticles(dt: number): void {
    if (!this.particleGeo || !this.particles) return;

    const bPos = !this.isStaged ? this.booster.position : this.capsule.position;
    const nozzleY = !this.isStaged ? bPos[1] - 4.2 : bPos[1] - 1.6;

    for (let i = 0; i < this.particleCount; i++) {
      if (this.isLaunched && Math.random() < 0.45 * this.throttle) {
        if (this.particleLifetimes[i] <= 0) {
          this.particleLifetimes[i] = 1.0;
          this.particlePositions[i * 3 + 0] = bPos[0] + (Math.random() - 0.5) * 0.5;
          this.particlePositions[i * 3 + 1] = nozzleY;
          this.particlePositions[i * 3 + 2] = bPos[2] + (Math.random() - 0.5) * 0.5;
        }
      }

      if (this.particleLifetimes[i] > 0) {
        this.particleLifetimes[i] -= dt * 2.2;
        this.particlePositions[i * 3 + 1] -= dt * (32.0 * this.throttle);
        this.particlePositions[i * 3 + 0] += (Math.random() - 0.5) * 0.4;
        this.particlePositions[i * 3 + 2] += (Math.random() - 0.5) * 0.4;
      } else {
        this.particlePositions[i * 3 + 1] = -1000;
      }
    }

    this.particleGeo.attributes.position.needsUpdate = true;
  }

  launch(): void {
    if (this.isLaunched) return;
    this.isLaunched = true;
    this.rumbleSound.start();
    this.rumbleSound.setIntensity(this.throttle);
    this.engine.events.emit('rocket.launch', { tick: this.engine.tick });
  }

  stage(): void {
    if (this.isStaged || !this.decouplerJoint) return;
    this.isStaged = true;
    try {
      this.engine.native.world.removeImpulseJoint(this.decouplerJoint, true);
      this.decouplerJoint = null;
    } catch (_) {}

    // Impart separation kick
    if (this.boosterBody && this.capsuleBody) {
      this.boosterBody.applyImpulse(new RAPIER.Vector3(0, -25, 0), true);
      this.capsuleBody.applyImpulse(new RAPIER.Vector3(0, 25, 0), true);
    }

    sfx.playDecouple();
    this.engine.events.emit('stage.separated', { stage: 1 });
  }

  setThrottle(val: number): void {
    this.throttle = Math.max(0, Math.min(1.0, val));
    if (this.isLaunched) {
      this.rumbleSound.setIntensity(this.throttle);
    }
  }

  getTelemetry(): KspTelemetry {
    const target = !this.isStaged ? this.boosterBody : this.capsuleBody;
    const vel = target ? target.linvel().y : 0;
    const pos = target ? target.translation().y : 6.2;
    const alt = Math.max(0, pos - 6.2);

    return {
      altitude: parseFloat(alt.toFixed(1)),
      velocity: parseFloat(vel.toFixed(1)),
      throttle: this.throttle,
      stage: !this.isStaged ? 1 : 2,
      isLaunched: this.isLaunched,
      isStaged: this.isStaged,
    };
  }

  update(dt: number): void {
    this.updateParticles(dt);

    // Smooth Chase Camera
    const target = !this.isStaged ? this.boosterBody : this.capsuleBody;
    const tPos = target ? target.translation() : { x: 0, y: 6.2, z: 0 };
    const camera = this.engine.native.camera;

    const targetCamY = tPos.y + 4.0;
    const targetCamZ = tPos.z + 28.0;

    camera.position.x += (tPos.x - camera.position.x) * 0.1;
    camera.position.y += (targetCamY - camera.position.y) * 0.1;
    camera.position.z += (targetCamZ - camera.position.z) * 0.1;
    camera.lookAt(tPos.x, tPos.y + 2.0, tPos.z);
  }

  dispose(): void {
    this.rumbleSound.stop();
    this.engine.dispose();
  }
}
