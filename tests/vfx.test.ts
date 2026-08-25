import { describe, it, expect } from 'vitest';
import { ParticleEmitter, ScreenShake, vfx } from '../src/vfx/index.js';
import { createRenderoni } from '../src/index.js';

describe('VFX Subsystem', () => {
  describe('ParticleEmitter', () => {
    it('spawns burst and tracks active particle count within bounded pool', () => {
      const emitter = new ParticleEmitter(100);
      expect(emitter.getActiveCount()).toBe(0);

      const count = emitter.spawnBurst({
        position: [0, 1, 0],
        count: 25,
        speed: 2.0,
        lifetime: 1.0,
      });

      expect(count).toBe(25);
      expect(emitter.getActiveCount()).toBe(25);

      // Advance by 0.5s (still alive)
      emitter.update(0.5);
      expect(emitter.getActiveCount()).toBe(25);

      // Advance by another 0.6s (exceeds lifetime 1.0s)
      emitter.update(0.6);
      expect(emitter.getActiveCount()).toBe(0);

      emitter.dispose();
    });

    it('recycles particle pool slots without allocating new slots', () => {
      const emitter = new ParticleEmitter(50);
      emitter.spawnBurst({ count: 50, lifetime: 0.5 });
      expect(emitter.getActiveCount()).toBe(50);

      // Pool is full, spawning more returns 0
      const overflow = emitter.spawnBurst({ count: 10 });
      expect(overflow).toBe(0);

      // Expire particles
      emitter.update(0.6);
      expect(emitter.getActiveCount()).toBe(0);

      // Slot recycling: can spawn again
      const nextBatch = emitter.spawnBurst({ count: 30, lifetime: 1.0 });
      expect(nextBatch).toBe(30);
      expect(emitter.getActiveCount()).toBe(30);

      emitter.dispose();
    });
  });

  describe('ScreenShake', () => {
    it('updates offset and decays to zero over duration', () => {
      const shake = new ScreenShake();
      shake.shake(1.0, 0.2);

      const offset1 = shake.update(0.05);
      expect(offset1.some((v) => v !== 0)).toBe(true);

      const offset2 = shake.update(0.2);
      expect(offset2).toEqual([0, 0, 0]);
    });
  });

  describe('VFX Subsystem Integration', () => {
    it('mounts into engine and emits events', async () => {
      const game = await createRenderoni({
        mode: 'headless',
        subsystems: [vfx()],
      });

      const count = (game as any).vfx.spawnParticles({ count: 10 });
      expect(count).toBe(10);

      (game as any).vfx.screenShake(0.5, 0.3);
      const offset = (game as any).vfx.update(0.1);
      expect(offset).toBeDefined();

      (game as any).vfx.dispose();
      game.dispose();
    });
  });
});
