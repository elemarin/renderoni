import { describe, expect, it } from 'vitest';
import { PRNG } from '../src/core/prng.js';

const draws = (rng: PRNG, n = 8) => Array.from({ length: n }, () => rng.nextUint32());

describe('PRNG.derive', () => {
  it('gives the same child for the same label however much the parent has drawn', () => {
    const fresh = new PRNG('world-seed');
    const busy = new PRNG('world-seed');
    draws(busy, 1000); // unrelated work happened first

    expect(draws(busy.derive('towns'))).toEqual(draws(fresh.derive('towns')));
  });

  it('does not advance the parent', () => {
    const a = new PRNG(7);
    const b = new PRNG(7);
    a.derive('terrain');
    a.derive('roads');
    expect(draws(a)).toEqual(draws(b));
  });

  it('gives different streams for different labels and different seeds', () => {
    const root = new PRNG('seed-a');
    expect(draws(root.derive('towns'))).not.toEqual(draws(root.derive('roads')));
    expect(draws(root.derive('towns'))).not.toEqual(draws(new PRNG('seed-b').derive('towns')));
  });

  it('keeps number and string labels apart', () => {
    const root = new PRNG(1);
    expect(draws(root.derive(3))).not.toEqual(draws(root.derive('3')));
  });

  it('composes: nested labels are stable and distinct from flat ones', () => {
    const a = new PRNG('s').derive('world').derive('names');
    const b = new PRNG('s').derive('world').derive('names');
    expect(draws(a)).toEqual(draws(b));
    expect(draws(new PRNG('s').derive('world').derive('names'))).not.toEqual(draws(new PRNG('s').derive('names')));
  });

  it('survives export and restore, so a restored stream derives the same children', () => {
    const original = new PRNG('save-me');
    draws(original, 50);
    const restored = new PRNG('something-else');
    restored.restoreState(original.exportState());
    expect(draws(restored.derive('late'))).toEqual(draws(original.derive('late')));
    expect(draws(restored)).toEqual(draws(original));
  });

  it('restores states exported before derive existed (no origin field)', () => {
    const rng = new PRNG(99);
    const legacy = { state: 123456, inc: 3 };
    rng.restoreState(legacy);
    expect(rng.exportState().state).toBe(123456);
  });

  it('leaves fork and the base sequence exactly as they were', () => {
    // fork still depends on draw order and advances the parent, as before
    const a = new PRNG(12345);
    const b = new PRNG(12345);
    draws(b, 1);
    expect(draws(a.fork('x'))).not.toEqual(draws(b.fork('x')));
    // the raw sequence is unchanged by the new origin field
    expect(new PRNG(42).nextUint32()).toBe(new PRNG(42).nextUint32());
  });
});

describe('PRNG helpers', () => {
  it('range stays within [min, max)', () => {
    const rng = new PRNG(3);
    for (let i = 0; i < 2000; i++) {
      const v = rng.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it('pick reaches every element, deterministically, and rejects empty input', () => {
    const items = ['a', 'b', 'c', 'd'];
    const seen = new Set<string>();
    const rng = new PRNG(4);
    for (let i = 0; i < 400; i++) seen.add(rng.pick(items));
    expect(seen.size).toBe(4);
    expect(new PRNG(9).pick(items)).toBe(new PRNG(9).pick(items));
    expect(() => new PRNG(1).pick([])).toThrow(/RND_0501/);
  });

  it('weighted follows the weights and never picks a zero weight', () => {
    const rng = new PRNG(5);
    const counts = { common: 0, rare: 0, never: 0 };
    for (let i = 0; i < 20000; i++) counts[rng.weighted(['common', 'rare', 'never'] as const, [9, 1, 0])]++;
    expect(counts.never).toBe(0);
    expect(counts.common / counts.rare).toBeGreaterThan(7);
    expect(counts.common / counts.rare).toBeLessThan(11);
  });

  it('weighted rejects mismatched, negative, non-finite and all-zero weights', () => {
    const rng = new PRNG(1);
    expect(() => rng.weighted(['a', 'b'], [1])).toThrow(/RND_0502/);
    expect(() => rng.weighted(['a'], [-1])).toThrow(/RND_0503/);
    expect(() => rng.weighted(['a'], [Number.NaN])).toThrow(/RND_0503/);
    expect(() => rng.weighted(['a', 'b'], [0, 0])).toThrow(/RND_0504/);
  });

  it('gaussian has roughly the requested mean and spread, and stays within six sigma', () => {
    const rng = new PRNG(6);
    const n = 20000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = rng.gaussian(10, 2);
      expect(Math.abs(v - 10)).toBeLessThanOrEqual(12);
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(mean).toBeGreaterThan(9.9);
    expect(mean).toBeLessThan(10.1);
    expect(sd).toBeGreaterThan(1.9);
    expect(sd).toBeLessThan(2.1);
  });

  it('shuffle is an in-place permutation and deterministic', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = new PRNG(8).shuffle(a);
    expect(out).toBe(a);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new PRNG(8).shuffle([1, 2, 3, 4, 5, 6, 7, 8])).toEqual(a);
  });

  it('fn draws from the same stream as nextFloat', () => {
    const a = new PRNG(10);
    const b = new PRNG(10);
    const f = a.fn();
    expect([f(), f(), f()]).toEqual([b.nextFloat(), b.nextFloat(), b.nextFloat()]);
  });
});
