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
}

export class PRNG {
  private state: number;
  private inc: number;

  constructor(seed: number | string = 42, stream: number = 1) {
    const rawSeed = hashSeed(seed);
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
   */
  fork(label?: string | number): PRNG {
    const nextSeed = this.nextUint32();
    const stream = label !== undefined ? hashSeed(label) : this.nextUint32();
    return new PRNG(nextSeed, stream);
  }

  /**
   * Exports full PRNG internal state for replay keyframing.
   */
  exportState(): PRNGState {
    return {
      state: this.state,
      inc: this.inc,
    };
  }

  /**
   * Restores internal state from a previously exported state.
   */
  restoreState(savedState: PRNGState): void {
    this.state = savedState.state >>> 0;
    this.inc = savedState.inc >>> 0;
  }
}
