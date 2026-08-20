/**
 * Renderoni: Deterministic 3D Simulation and Gameplay Framework
 *
 * Unified entrypoint exposing createRenderoni() and all core interfaces.
 */

import { RenderoniEngine, type RenderoniConfig } from './core/engine.js';

export * from './core/index.js';
export * from './presets/index.js';
export * from './input/index.js';
export { RenderoniEngine, type RenderoniConfig } from './core/engine.js';

export async function createRenderoni(config: RenderoniConfig = {}): Promise<RenderoniEngine> {
  const engine = new RenderoniEngine(config);
  await engine.init(config);
  return engine;
}
