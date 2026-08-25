import * as THREE from 'three';
import type { RenderoniEngine } from '../core/engine.js';

export interface VFXSubsystemOptions {
  bloom?: boolean;
  pixelResolution?: [number, number];
  affineTextureWarp?: boolean;
  dithering?: boolean;
}

export interface ParticleBurstOptions {
  type?: 'dust' | 'fog' | 'spark' | 'smoke' | string;
  position?: [number, number, number];
  count?: number;
  speed?: number;
  spread?: [number, number, number];
  gravity?: [number, number, number];
  drag?: number;
  color?: number | [number, number, number];
  startScale?: number;
  endScale?: number;
  lifetime?: number;
}

export interface ScreenShakeOptions {
  intensity?: number;
  durationSeconds?: number;
}

export class ScreenShake {
  private intensity: number = 0;
  private duration: number = 0;
  private elapsed: number = 0;
  private offset: [number, number, number] = [0, 0, 0];
  private readonly random: () => number;

  constructor(random?: () => number) {
    let fallbackState = 0x9e3779b9;
    this.random =
      random ??
      (() => {
        fallbackState = (Math.imul(fallbackState, 1664525) + 1013904223) >>> 0;
        return fallbackState / 4294967296;
      });
  }

  shake(intensity: number = 0.5, durationSeconds: number = 0.3): void {
    this.intensity = intensity;
    this.duration = durationSeconds;
    this.elapsed = 0;
  }

  update(dt: number): [number, number, number] {
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.offset = [0, 0, 0];
      return this.offset;
    }

    const progress = 1.0 - this.elapsed / this.duration;
    const currentIntensity = this.intensity * progress;

    this.offset[0] = (this.random() * 2 - 1) * currentIntensity || 0;
    this.offset[1] = (this.random() * 2 - 1) * currentIntensity || 0;
    this.offset[2] = (this.random() * 2 - 1) * currentIntensity || 0;

    return this.offset;
  }
}

export class ParticleEmitter {
  readonly maxParticles: number;
  private prng: { nextFloat: () => number };

  // SoA Pool Buffers
  private active: Uint8Array;
  private positions: Float32Array;
  private velocities: Float32Array;
  private gravities: Float32Array;
  private drags: Float32Array;
  private colors: Float32Array;
  private startScales: Float32Array;
  private endScales: Float32Array;
  private ages: Float32Array;
  private lifetimes: Float32Array;

  private activeCount: number = 0;
  private mesh: THREE.InstancedMesh | null = null;
  private dummyObj = new THREE.Object3D();
  private tempColor = new THREE.Color();

  constructor(maxParticles: number = 1000, random?: () => number) {
    this.maxParticles = maxParticles;
    let seedState = 0x85ebca6b;
    this.prng = {
      nextFloat:
        random ??
        (() => {
          seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0;
          return seedState / 4294967296;
        }),
    };

    this.active = new Uint8Array(maxParticles);
    this.positions = new Float32Array(maxParticles * 3);
    this.velocities = new Float32Array(maxParticles * 3);
    this.gravities = new Float32Array(maxParticles * 3);
    this.drags = new Float32Array(maxParticles);
    this.colors = new Float32Array(maxParticles * 3);
    this.startScales = new Float32Array(maxParticles);
    this.endScales = new Float32Array(maxParticles);
    this.ages = new Float32Array(maxParticles);
    this.lifetimes = new Float32Array(maxParticles);

    if (typeof window !== 'undefined') {
      const geo = new THREE.PlaneGeometry(0.1, 0.1);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.mesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.count = 0;
    }
  }

  spawnBurst(options: ParticleBurstOptions = {}): number {
    const count = options.count ?? 20;
    const basePos = options.position ?? [0, 0, 0];
    const speed = options.speed ?? 1.0;
    const lifetime = options.lifetime ?? 2.0;
    const spread = options.spread ?? [1, 1, 1];
    const gravity = options.gravity ?? [0, 0, 0];
    const drag = options.drag ?? 0.0;
    const startScale = options.startScale ?? 1.0;
    const endScale = options.endScale ?? 0.0;

    let colR = 1,
      colG = 1,
      colB = 1;
    if (typeof options.color === 'number') {
      this.tempColor.setHex(options.color);
      colR = this.tempColor.r;
      colG = this.tempColor.g;
      colB = this.tempColor.b;
    } else if (Array.isArray(options.color)) {
      colR = options.color[0];
      colG = options.color[1];
      colB = options.color[2];
    }

    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      if (this.active[i] === 1) continue;

      this.active[i] = 1;
      const i3 = i * 3;

      this.positions[i3] = basePos[0] + (this.prng.nextFloat() * 2 - 1) * spread[0] * 0.2;
      this.positions[i3 + 1] = basePos[1] + (this.prng.nextFloat() * 2 - 1) * spread[1] * 0.2;
      this.positions[i3 + 2] = basePos[2] + (this.prng.nextFloat() * 2 - 1) * spread[2] * 0.2;

      const theta = this.prng.nextFloat() * Math.PI * 2;
      const phi = Math.acos(this.prng.nextFloat() * 2 - 1);
      const spd = speed * (0.6 + this.prng.nextFloat() * 0.8);

      this.velocities[i3] = Math.sin(phi) * Math.cos(theta) * spd;
      this.velocities[i3 + 1] = Math.cos(phi) * spd;
      this.velocities[i3 + 2] = Math.sin(phi) * Math.sin(theta) * spd;

      this.gravities[i3] = gravity[0];
      this.gravities[i3 + 1] = gravity[1];
      this.gravities[i3 + 2] = gravity[2];

      this.drags[i] = drag;
      this.colors[i3] = colR;
      this.colors[i3 + 1] = colG;
      this.colors[i3 + 2] = colB;

      this.startScales[i] = startScale;
      this.endScales[i] = endScale;
      this.ages[i] = 0;
      this.lifetimes[i] = lifetime;

      spawned++;
    }

    this.activeCount += spawned;
    return spawned;
  }

  update(dt: number, camera?: THREE.Camera): void {
    if (this.activeCount === 0 && (!this.mesh || this.mesh.count === 0)) return;

    let liveIndex = 0;
    const mesh = this.mesh;

    for (let i = 0; i < this.maxParticles; i++) {
      if (this.active[i] === 0) continue;

      this.ages[i] += dt;
      if (this.ages[i] >= this.lifetimes[i]) {
        this.active[i] = 0;
        this.activeCount--;
        continue;
      }

      const i3 = i * 3;
      const progress = this.ages[i] / this.lifetimes[i];
      const dragFactor = Math.max(0, 1 - this.drags[i] * dt);

      this.velocities[i3] = (this.velocities[i3] + this.gravities[i3] * dt) * dragFactor;
      this.velocities[i3 + 1] = (this.velocities[i3 + 1] + this.gravities[i3 + 1] * dt) * dragFactor;
      this.velocities[i3 + 2] = (this.velocities[i3 + 2] + this.gravities[i3 + 2] * dt) * dragFactor;

      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      if (mesh) {
        const scale = THREE.MathUtils.lerp(this.startScales[i], this.endScales[i], progress);
        this.dummyObj.position.set(this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2]);
        this.dummyObj.scale.set(scale, scale, scale);

        if (camera) {
          this.dummyObj.quaternion.copy(camera.quaternion);
        } else {
          this.dummyObj.quaternion.identity();
        }

        this.dummyObj.updateMatrix();
        mesh.setMatrixAt(liveIndex, this.dummyObj.matrix);

        this.tempColor.setRGB(this.colors[i3], this.colors[i3 + 1], this.colors[i3 + 2]);
        mesh.setColorAt(liveIndex, this.tempColor);

        liveIndex++;
      }
    }

    if (mesh) {
      mesh.count = liveIndex;
      if (liveIndex > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getMesh(): THREE.InstancedMesh | null {
    return this.mesh;
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach((m) => m.dispose());
      } else {
        this.mesh.material.dispose();
      }
      this.mesh = null;
    }
    this.active.fill(0);
    this.activeCount = 0;
  }
}

export function vfx(options: VFXSubsystemOptions = {}) {
  return (engine: RenderoniEngine) => {
    const random = engine.prng?.fork('vfx.screenShake');
    const shake = new ScreenShake(random ? () => random.nextFloat() : undefined);
    const particles = new ParticleEmitter(500, random ? () => random.nextFloat() : undefined);

    (engine as any).vfx = {
      options,
      screenShake: (intensity?: number, duration?: number) => {
        shake.shake(intensity, duration);
        engine.events.emit('vfx.screenShake', { intensity, duration }, engine.clock.tick);
      },
      spawnParticles: (opts: ParticleBurstOptions) => {
        const count = particles.spawnBurst(opts);
        engine.events.emit('vfx.particles', opts, engine.clock.tick);
        return count;
      },
      emitter: particles,
      update: (dt: number, camera?: THREE.Camera) => {
        particles.update(dt, camera);
        return shake.update(dt);
      },
      dispose: () => {
        particles.dispose();
      },
    };
  };
}
