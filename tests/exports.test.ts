import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../src/index.js';
import { definePreset } from '../src/presets/index.js';
import { animation } from '../src/animation/index.js';
import { audio } from '../src/audio/index.js';
import { ui } from '../src/ui/index.js';
import { vfx } from '../src/vfx/index.js';
import { createMCPServer } from '../src/mcp/index.js';

describe('Renderoni Subpath Exports', () => {
  it('instantiates createRenderoni in headless mode', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });
    expect(game.mode).toBe('headless');
    expect(game.seed).toBe(42);
    expect(game.tickRateHz).toBe(60);
    expect(game.tick).toBe(0);

    game.step(5);
    expect(game.tick).toBe(5);
  });

  it('exports all subsystem factories', () => {
    expect(definePreset).toBeDefined();
    expect(animation).toBeDefined();
    expect(audio).toBeDefined();
    expect(ui).toBeDefined();
    expect(vfx).toBeDefined();
    expect(createMCPServer).toBeDefined();
  });
});
