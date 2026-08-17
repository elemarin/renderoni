/**
 * Renderoni Simulation Clock
 *
 * Implements a deterministic 60 Hz fixed-step accumulator and integer tick progression.
 * Strictly decoupled from wall-clock time and RAF.
 */

export interface SimulationClockOptions {
  tickRateHz?: number;
  maxSubSteps?: number;
}

export class SimulationClock {
  readonly tickRateHz: number;
  readonly fixedDt: number;
  readonly maxSubSteps: number;

  private _tick: number = 0;
  private _accumulator: number = 0;

  constructor(options: SimulationClockOptions = {}) {
    this.tickRateHz = options.tickRateHz ?? 60;
    if (this.tickRateHz <= 0) {
      throw new Error(`tickRateHz must be positive, got ${this.tickRateHz}`);
    }
    this.fixedDt = 1 / this.tickRateHz;
    this.maxSubSteps = options.maxSubSteps ?? 10;
  }

  /** Current authoritative integer tick counter */
  get tick(): number {
    return this._tick;
  }

  /** Current accumulated time (in seconds) that has not yet produced a fixed tick */
  get accumulator(): number {
    return this._accumulator;
  }

  /**
   * Presentation interpolation alpha in the range [0.0, 1.0].
   * Used strictly for slerp/lerp rendering buffers.
   */
  get alpha(): number {
    return Math.min(1.0, Math.max(0.0, this._accumulator / this.fixedDt));
  }

  /**
   * Advances the clock by a specified number of fixed simulation ticks.
   * Typically used in headless batch simulation and CI tests.
   */
  stepTicks(ticks: number = 1): number {
    if (ticks < 0) {
      throw new Error(`Cannot step negative ticks: ${ticks}`);
    }
    this._tick += ticks;
    return this._tick;
  }

  /**
   * Feeds frame elapsed delta time (in seconds) into the accumulator for interactive presentation loops.
   * Returns the exact number of fixed simulation ticks that must be run this frame.
   */
  advancePresentation(dtSeconds: number): number {
    if (dtSeconds < 0) {
      return 0;
    }

    // Clamp frame dt to prevent spiral of death
    const clampedDt = Math.min(dtSeconds, this.fixedDt * this.maxSubSteps);
    this._accumulator += clampedDt;

    let subSteps = 0;
    while (this._accumulator >= this.fixedDt && subSteps < this.maxSubSteps) {
      this._accumulator -= this.fixedDt;
      this._tick++;
      subSteps++;
    }

    // Drop excess accumulator if clamped to maxSubSteps
    if (this._accumulator >= this.fixedDt) {
      this._accumulator = 0;
    }

    return subSteps;
  }

  /**
   * Resets the clock to tick 0 with an empty accumulator.
   */
  reset(initialTick: number = 0): void {
    this._tick = initialTick;
    this._accumulator = 0;
  }
}
