export * from './clock.js';
export * from './prng.js';
export * from './commands.js';
export * from './transform-buffer.js';
export * from './physics.js';
export * from './hashing.js';
export * from './ownership.js';
export * from './diagnostics.js';

export interface EntityRecord {
  id: string;
  tags: string[];
  state: Record<string, unknown>;
}
