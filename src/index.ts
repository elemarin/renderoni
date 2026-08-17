export * from './core/index.js';
export * from './presets/index.js';

export interface RenderoniGameConfig {
  mode?: 'interactive' | 'headless';
  seed?: number | string;
  tickRateHz?: number;
  subsystems?: any[];
}

export interface RenderoniGame {
  readonly mode: 'interactive' | 'headless';
  readonly seed: number | string;
  readonly tickRateHz: number;
  readonly tick: number;
  step(ticks?: number): void;
  dispose(): void;
}

export async function createRenderoni(config: RenderoniGameConfig = {}): Promise<RenderoniGame> {
  const mode = config.mode ?? 'headless';
  const seed = config.seed ?? 42;
  const tickRateHz = config.tickRateHz ?? 60;
  let currentTick = 0;

  return {
    mode,
    seed,
    tickRateHz,
    get tick() {
      return currentTick;
    },
    step(ticks = 1) {
      currentTick += ticks;
    },
    dispose() {
      // Stub
    },
  };
}
