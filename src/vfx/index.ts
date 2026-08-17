/**
 * Renderoni VFX & Particle Subsystem (renderoni/vfx)
 *
 * GPU instanced particle emitters, post-processing options, and procedural screen shake.
 */

import * as THREE from 'three';

export interface VFXSubsystemOptions {
  bloom?: boolean;
  pixelResolution?: [number, number];
  affineTextureWarp?: boolean;
  dithering?: boolean;
}

export interface ParticleBurstOptions {
  type?: string;
  position?: [number, number, number];
  count?: number;
  speed?: number;
  color?: number;
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

  shake(intensity: number = 0.5, durationSeconds: number = 0.3): void {
    this.intensity = intensity;
    this.duration = durationSeconds;
    this.elapsed = 0;
  }

  update(dt: number): [number, number, number] {
    if (this.elapsed >= this.duration) {
      this.offset = [0, 0, 0];
      return this.offset;
    }

    this.elapsed += dt;
    const progress = 1.0 - this.elapsed / this.duration;
    const currentIntensity = this.intensity * progress;

    this.offset[0] = (Math.random() * 2 - 1) * currentIntensity;
    this.offset[1] = (Math.random() * 2 - 1) * currentIntensity;
    this.offset[2] = (Math.random() * 2 - 1) * currentIntensity;

    return this.offset;
  }
}

export class ParticleEmitter {
  private maxParticles: number;
  private mesh: THREE.InstancedMesh | null = null;

  constructor(maxParticles: number = 1000) {
    this.maxParticles = maxParticles;
    if (typeof window !== 'undefined') {
      const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      this.mesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    }
  }

  spawnBurst(_options: ParticleBurstOptions): void {
    // Presentation particle spawning
  }

  getMesh(): THREE.InstancedMesh | null {
    return this.mesh;
  }
}

export function vfx(options: VFXSubsystemOptions = {}) {
  return (game: any) => {
    const shake = new ScreenShake();
    const particles = new ParticleEmitter(500);

    game.vfx = {
      options,
      screenShake: (intensity?: number, duration?: number) => {
        shake.shake(intensity, duration);
        game.events.emit('vfx.screenShake', { intensity, duration }, game.tick);
      },
      spawnParticles: (opts: ParticleBurstOptions) => {
        particles.spawnBurst(opts);
        game.events.emit('vfx.particles', opts, game.tick);
      },
      update: (dt: number) => {
        return shake.update(dt);
      },
    };
  };
}
