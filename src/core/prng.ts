/**
 * Renderoni Seeded PRNG Stream Hierarchy
 *
 * Implements a 32-bit PCG / SplitMix-derived PRNG with stream forking
 * for per-tick and per-entity deterministic random numbers.
 */

/** Murmur3 32-bit string hashing helper for string seeds */
export function hashSeed(seed: string | number): number {
  if (typeof seed === 'number') {
    return seed >>> 0;
  }

  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface PRNGState {
  state: number;
  inc: number;
  /** Identity that `derive()` builds on. Optional so states exported before it existed still restore. */
  origin?: number;
}

/** Mixes a seed and stream id into a stable 32-bit identity for derived streams. */
function mixOrigin(rawSeed: number, stream: number): number {
  let h = (rawSeed ^ Math.imul(stream >>> 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class PRNG {
  private state: number;
  private inc: number;
  /** Fixed at construction; never advanced by drawing. The root of every `derive()` child. */
  private origin: number;

  constructor(seed: number | string = 42, stream: number = 1) {
    const rawSeed = hashSeed(seed);
    this.origin = mixOrigin(rawSeed, stream);
    this.inc = ((stream << 1) | 1) >>> 0;
    this.state = 0;
    this.nextUint32();
    this.state = (this.state + rawSeed) >>> 0;
    this.nextUint32();
  }

  /**
   * Generates next pseudo-random unsigned 32-bit integer (PCG32 algorithm).
   */
  nextUint32(): number {
    const oldState = this.state;
    // Advance internal state: state = state * 747796405 + inc
    this.state = (Math.imul(oldState, 747796405) + this.inc) >>> 0;

    // Output function: xor-shift and rotate
    const word = (((oldState >>> ((oldState >>> 28) + 4)) ^ oldState) * 277803737) >>> 0;
    return ((word >>> 22) ^ word) >>> 0;
  }

  /**
   * Returns pseudo-random float in range [0.0, 1.0).
   */
  nextFloat(): number {
    return this.nextUint32() / 4294967296.0;
  }

  /**
   * Returns pseudo-random integer in range [min, max] (inclusive).
   */
  nextInt(min: number, max: number): number {
    if (min > max) {
      throw new Error(`min (${min}) cannot be greater than max (${max})`);
    }
    const range = max - min + 1;
    return min + (this.nextUint32() % range);
  }

  /**
   * Returns pseudo-random boolean with given probability of being true (default 0.5).
   */
  nextBool(probability: number = 0.5): boolean {
    return this.nextFloat() < probability;
  }

  /**
   * Returns a random point on a unit sphere (3D Vector [x, y, z]).
   */
  nextUnitSphere(): [number, number, number] {
    const u = this.nextFloat();
    const v = this.nextFloat();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const sinPhi = Math.sin(phi);
    return [
      sinPhi * Math.cos(theta),
      sinPhi * Math.sin(theta),
      Math.cos(phi)
    ];
  }

  /**
   * Forks a new independent, isolated PRNG stream derived from this PRNG's state.
   *
   * The child depends on how many values the parent has already produced, and
   * forking advances the parent. Use it for per-entity streams created in a
   * deterministic order. Use `derive()` when a stream must not move when
   * unrelated code draws more or fewer numbers first.
   */
  fork(label?: string | number): PRNG {
    const nextSeed = this.nextUint32();
    const stream = label !== undefined ? hashSeed(label) : this.nextUint32();
    return new PRNG(nextSeed, stream);
  }

  /**
   * Derives a named child stream that is a pure function of this stream's seed
   * identity and `label`.
   *
   * Unlike `fork()`, deriving never advances this stream and does not depend on
   * how many values have been drawn from it, so the same label always yields
   * the same child. Procedural generation relies on this: adding a draw to one
   * step (say, placing a new kind of landmark) must not reshuffle every other
   * step. Children derive their own children the same way, so nested labels
   * such as `world` → `towns` → `names` compose.
   */
  derive(label: string | number): PRNG {
    const key = typeof label === 'number' ? `#${label}` : label;
    return new PRNG(hashSeed(`${this.origin.toString(16)}/${key}`), hashSeed(key) >>> 1);
  }

  /** Float in `[min, max)`. */
  range(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  /** One element of a non-empty array, uniformly. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('RND_0501: pick() requires a non-empty array.');
    }
    return items[this.nextInt(0, items.length - 1)];
  }

  /**
   * One element chosen with probability proportional to its weight.
   *
   * Weights must be finite and non-negative with a positive total. A
   * zero-weight item is never chosen.
   */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0 || items.length !== weights.length) {
      throw new Error(
        `RND_0502: weighted() needs one weight per item (got ${items.length} items, ${weights.length} weights).`
      );
    }
    let total = 0;
    for (const weight of weights) {
      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error(`RND_0503: weighted() weights must be finite and non-negative, received ${weight}.`);
      }
      total += weight;
    }
    if (total <= 0) {
      throw new Error('RND_0504: weighted() needs at least one positive weight.');
    }
    let remaining = this.nextFloat() * total;
    for (let i = 0; i < items.length; i++) {
      remaining -= weights[i];
      if (remaining < 0) return items[i];
    }
    // Floating-point rounding can leave a sliver past the end: fall back to the
    // last item that could actually be chosen.
    for (let i = items.length - 1; i >= 0; i--) {
      if (weights[i] > 0) return items[i];
    }
    return items[items.length - 1];
  }

  /**
   * Approximately normally distributed value, bounded to ±6 standard deviations.
   *
   * Sums twelve uniform draws (Irwin-Hall), which has mean 6 and variance 1.
   * Deliberately avoids Box-Muller: `Math.log` and `Math.cos` are not
   * guaranteed bit-identical across JavaScript engines, so a world generated
   * with them could differ between two browsers in a lockstep session. This
   * uses only addition and multiplication, so it is exact everywhere. Costs
   * twelve draws per call.
   */
  gaussian(mean: number = 0, stdDev: number = 1): number {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += this.nextFloat();
    return mean + stdDev * (sum - 6);
  }

  /** Shuffles `items` in place (Fisher-Yates) and returns it. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const swap = items[i];
      items[i] = items[j];
      items[j] = swap;
    }
    return items;
  }

  /**
   * A `() => number` in `[0, 1)` drawing from this stream, for libraries that
   * take a random function, such as noise generators.
   */
  fn(): () => number {
    return () => this.nextFloat();
  }

  /**
   * Exports full PRNG internal state for replay keyframing.
   */
  exportState(): PRNGState {
    return {
      state: this.state,
      inc: this.inc,
      origin: this.origin,
    };
  }

  /**
   * Restores internal state from a previously exported state.
   */
  restoreState(savedState: PRNGState): void {
    this.state = savedState.state >>> 0;
    this.inc = savedState.inc >>> 0;
    if (savedState.origin !== undefined) this.origin = savedState.origin >>> 0;
  }
}
