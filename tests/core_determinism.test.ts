import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createRenderoni } from '../src/index.js';
import { RenderoniEngine } from '../src/core/engine.js';
import { body } from '../src/presets/index.js';
import {
  DualBufferTransformPipeline,
  StateHasher,
  compareCodeUnits,
  type StateEntityRecord,
} from '../src/core/index.js';

async function readyHasher(): Promise<StateHasher> {
  const hasher = new StateHasher();
  await hasher.init();
  return hasher;
}

describe('Deterministic core hardening', () => {
  describe('code-unit ordering', () => {
    it('orders mixed punctuation and case by UTF-16 code units, not locale rules', () => {
      const ids = ['box_2', 'Box_10', '_ghost', 'Box-2', 'zebra', 'Apple', 'apple'];

      // Array#sort with no comparator is specified as code-unit order.
      const expected = [...ids].sort();
      expect([...ids].sort(compareCodeUnits)).toEqual(expected);

      // Locale collation folds case and ignores punctuation weight, so it would
      // order these ids differently on ICU-enabled hosts.
      expect(compareCodeUnits('Box_1', 'apple_floor')).toBeLessThan(0);
      expect(compareCodeUnits('Box-2', 'Box_10')).toBeLessThan(0);
      expect(compareCodeUnits('_ghost', 'apple')).toBeLessThan(0);
      expect(compareCodeUnits('apple', 'apple')).toBe(0);
    });

    it('hashes the same entity set identically under any input permutation', async () => {
      const hasher = await readyHasher();
      const pipeline = new DualBufferTransformPipeline(8);

      const ids = ['box_2', 'Box_10', '_ghost', 'Box-2', 'Apple'];
      const records: StateEntityRecord[] = ids.map((id, index) => {
        const slot = pipeline.allocateSlot(id);
        pipeline.setTransform(slot, index, index * 2, index * 3, 0, 0, 0, 1);
        return { id, slot, state: { index } };
      });

      const reference = hasher.computeHash(records, pipeline.currentBuffer);

      const permutations = [
        [...records].reverse(),
        [records[2], records[0], records[4], records[1], records[3]],
        [records[4], records[3], records[1], records[0], records[2]],
      ];

      for (const permutation of permutations) {
        expect(hasher.computeHash(permutation, pipeline.currentBuffer)).toBe(reference);
      }
    });

    it('hashes entity state keys independently of insertion order', async () => {
      const hasher = await readyHasher();
      const pipeline = new DualBufferTransformPipeline(4);
      const slot = pipeline.allocateSlot('hero');
      pipeline.setTransform(slot, 0, 0, 0, 0, 0, 0, 1);

      const first = hasher.computeHash(
        [{ id: 'hero', slot, state: { Zeal: 1, ammo: 2, _tier: 3 } }],
        pipeline.currentBuffer
      );
      const second = hasher.computeHash(
        [{ id: 'hero', slot, state: { _tier: 3, ammo: 2, Zeal: 1 } }],
        pipeline.currentBuffer
      );

      expect(second).toBe(first);
    });

    it('canonicalizes contact pairs by code units for mixed-case entity ids', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      game.add(
        body({ id: 'apple_floor', shape: 'box', type: 'fixed', size: [20, 1, 20], position: [0, 0, 0] })
      );
      game.add(body({ id: 'Box_1', shape: 'box', type: 'dynamic', position: [0, 3, 0] }));

      const contacts: Array<{ a: string; b: string }> = [];
      game.events.on('contact.start', (payload: { a: { id: string }; b: { id: string } }) => {
        contacts.push({ a: payload.a.id, b: payload.b.id });
      });

      game.step(120);

      expect(contacts.length).toBeGreaterThan(0);
      // 'B' (0x42) sorts before 'a' (0x61); locale collation would put apple_floor first.
      expect(contacts[0]).toEqual({ a: 'Box_1', b: 'apple_floor' });

      const active = game.physics.getActiveContacts();
      expect(active.length).toBeGreaterThan(0);
      expect(active[0].entityA).toBe('Box_1');
      expect(active[0].entityB).toBe('apple_floor');

      game.dispose();
    });
  });

  describe('pre-init hashing', () => {
    it('throws instead of returning a zero sentinel hash', () => {
      const hasher = new StateHasher();
      const pipeline = new DualBufferTransformPipeline(2);
      const slot = pipeline.allocateSlot('box');

      expect(hasher.isReady).toBe(false);
      expect(() => hasher.computeHash([{ id: 'box', slot }], pipeline.currentBuffer)).toThrow(
        /RND_0201/
      );
    });

    it('throws from engine.getStateHash() before init resolves', () => {
      const game = new RenderoniEngine({ mode: 'headless' });
      expect(() => game.getStateHash()).toThrow(/RND_0201/);
    });
  });

  describe('non-finite transform rejection', () => {
    it('rejects NaN and Infinity at the canonical buffer boundary', () => {
      const pipeline = new DualBufferTransformPipeline(4);
      const slot = pipeline.allocateSlot('crate');

      expect(() => pipeline.setTransform(slot, NaN, 0, 0, 0, 0, 0, 1)).toThrow(/RND_0301/);
      expect(() => pipeline.setTransform(slot, 0, Infinity, 0, 0, 0, 0, 1)).toThrow(/RND_0301/);
      expect(() => pipeline.setTransform(slot, 0, 0, 0, 0, 0, 0, -Infinity)).toThrow(/RND_0301/);
      expect(() => pipeline.setVelocity(slot, 0, NaN, 0, 0, 0, 0)).toThrow(/RND_0301/);
      expect(() => pipeline.setVelocity(slot, 0, 0, 0, 0, Infinity, 0)).toThrow(/RND_0301/);

      // A rejected write leaves canonical state untouched.
      expect(pipeline.getPosition(slot)).toEqual([0, 0, 0]);
      expect(pipeline.getLinearVelocity(slot)).toEqual([0, 0, 0]);
    });

    it('rejects slots outside the canonical buffer', () => {
      const pipeline = new DualBufferTransformPipeline(2);

      expect(() => pipeline.setTransform(-1, 0, 0, 0, 0, 0, 0, 1)).toThrow(/RND_0302/);
      expect(() => pipeline.setTransform(1.5, 0, 0, 0, 0, 0, 0, 1)).toThrow(/RND_0302/);
      expect(() => pipeline.setVelocity(99, 0, 0, 0, 0, 0, 0)).toThrow(/RND_0302/);
      expect(() => pipeline.getPosition(99)).toThrow(/RND_0302/);
    });

    it('rejects non-finite entity transforms while hashing', async () => {
      const hasher = await readyHasher();
      const pipeline = new DualBufferTransformPipeline(2);

      expect(() =>
        hasher.computeHash([{ id: 'ghost', position: [NaN, 0, 0] }], pipeline.currentBuffer)
      ).toThrow(/RND_0301/);
      expect(() =>
        hasher.computeHash(
          [{ id: 'ghost', position: [0, 0, 0], quaternion: [0, 0, 0, Infinity] }],
          pipeline.currentBuffer
        )
      ).toThrow(/RND_0301/);
      expect(() =>
        hasher.computeHash([{ id: 'ghost', slot: 64 }], pipeline.currentBuffer)
      ).toThrow(/RND_0304/);
      expect(() =>
        hasher.computeHash([{ id: 'ghost', slot: NaN }], pipeline.currentBuffer)
      ).toThrow(/RND_0304/);
      expect(() =>
        hasher.computeHash([{ id: 'ghost', slot: 0.5 }], pipeline.currentBuffer)
      ).toThrow(/RND_0304/);
    });

    it('rejects non-finite writes through entity transform setters', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      const crate = game.add(body({ id: 'crate', type: 'dynamic', position: [0, 5, 0] }));

      expect(() => {
        crate.position = [NaN, 1, 0];
      }).toThrow(/RND_0301/);
      expect(() => {
        crate.quaternion = [0, 0, 0, Infinity];
      }).toThrow(/RND_0301/);

      expect(crate.position[1]).toBeCloseTo(5);
      game.dispose();
    });
  });

  describe('canonical state coverage', () => {
    it('hashes slotless entities from their instance transform', async () => {
      const hasher = await readyHasher();
      const pipeline = new DualBufferTransformPipeline(4);

      const atOrigin = hasher.computeHash([{ id: 'marker', position: [0, 0, 0] }], pipeline.currentBuffer);
      const raised = hasher.computeHash([{ id: 'marker', position: [0, 3, 0] }], pipeline.currentBuffer);
      const turned = hasher.computeHash(
        [{ id: 'marker', position: [0, 0, 0], quaternion: [0, 0.7071, 0, 0.7071] }],
        pipeline.currentBuffer
      );

      expect(raised).not.toBe(atOrigin);
      expect(turned).not.toBe(atOrigin);
    });

    it('changes the engine hash when a slotless entity moves', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      const marker = game.add({
        id: 'marker',
        native: { three: { object: new THREE.Object3D() } },
      });

      expect(marker.slot).toBeUndefined();
      const before = game.getStateHash();

      marker.position = [0, 3, 0];

      expect(marker.position[1]).toBeCloseTo(3);
      expect(game.getStateHash()).not.toBe(before);

      game.dispose();
    });

    it('hashes linear and angular velocity', async () => {
      const hasher = await readyHasher();
      const pipeline = new DualBufferTransformPipeline(4);
      const slot = pipeline.allocateSlot('box');
      pipeline.setTransform(slot, 1, 2, 3, 0, 0, 0, 1);

      const atRest = hasher.computeHash([{ id: 'box', slot }], pipeline.currentBuffer);

      pipeline.setVelocity(slot, 0, -5, 0, 0, 0, 0);
      const falling = hasher.computeHash([{ id: 'box', slot }], pipeline.currentBuffer);

      pipeline.setVelocity(slot, 0, -5, 0, 0, 2, 0);
      const spinning = hasher.computeHash([{ id: 'box', slot }], pipeline.currentBuffer);

      expect(falling).not.toBe(atRest);
      expect(spinning).not.toBe(falling);
      expect(pipeline.getLinearVelocity(slot)).toEqual([0, -5, 0]);
      expect(pipeline.getAngularVelocity(slot)).toEqual([0, 2, 0]);
    });

    it('syncs rigid body velocity into the canonical buffer each step', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      const crate = game.add(body({ id: 'crate', type: 'dynamic', position: [0, 10, 0] }));

      game.step(10);

      const linear = game.transformPipeline.getLinearVelocity(crate.slot!);
      expect(linear[1]).toBeLessThan(0);
      expect(Number.isFinite(linear[1])).toBe(true);

      game.dispose();
    });
  });

  describe('step validation', () => {
    it('rejects tick counts that are not finite non-negative integers', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });

      expect(() => game.step(NaN)).toThrow(/RND_0202/);
      expect(() => game.step(-1)).toThrow(/RND_0202/);
      expect(() => game.step(1.5)).toThrow(/RND_0202/);
      expect(() => game.step(Infinity)).toThrow(/RND_0202/);
      expect(() => game.step('10' as unknown as number)).toThrow(/RND_0202/);
      expect(game.tick).toBe(0);

      game.step(0);
      expect(game.tick).toBe(0);

      game.step(3);
      expect(game.tick).toBe(3);

      game.dispose();
    });
  });
});
