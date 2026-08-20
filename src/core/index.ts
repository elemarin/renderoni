export * from './clock.js';
export * from './prng.js';
export * from './commands.js';
export * from './transform-buffer.js';
export * from './physics.js';
export * from './hashing.js';
export * from './ownership.js';
export * from './diagnostics.js';
export * from './observations.js';
export * from './loop.js';
export * from './engine.js';

export interface EntityRecord {
  id: string;
  tags: string[];
  state: Record<string, unknown>;
}
