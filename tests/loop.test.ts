import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../src/index.js';
import { GameLoop } from '../src/core/loop.js';

describe('GameLoop', () => {
  it('stays playing when disabled', () => {
    const loop = new GameLoop();
    expect(loop.enabled).toBe(false);
    expect(loop.playing).toBe(true);
    expect(loop.phase).toBe('playing');
  });

  it('runs ready → playing → won and restarts via reset hook', () => {
    const loop = new GameLoop({ enabled: true, title: 'Manor' });
    let resets = 0;
    loop.onReset(() => {
      resets += 1;
    });

    expect(loop.phase).toBe('ready');
    expect(loop.playing).toBe(false);

    loop.start();
    expect(loop.phase).toBe('playing');
    loop.win('Escaped');
    expect(loop.phase).toBe('won');
    expect(loop.outcome).toBe('Escaped');
    loop.lose('ignored');
    expect(loop.phase).toBe('won');

    loop.restart();
    expect(resets).toBe(1);
    expect(loop.phase).toBe('playing');
    expect(loop.outcome).toBeNull();
  });

  it('is available on createRenderoni when loop is enabled', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 1, loop: true });
    expect(game.loop.enabled).toBe(true);
    expect(game.loop.phase).toBe('ready');
    game.act({ name: 'loop.start' });
    game.step(1);
    expect(game.loop.phase).toBe('playing');
    game.act({ name: 'loop.win', payload: 'Done' });
    game.step(1);
    expect(game.loop.phase).toBe('won');
    game.dispose();
  });

  it('enters game over and restarts from a clean playing phase', () => {
    const loop = new GameLoop({ enabled: true, title: 'Manor' });
    loop.start();
    loop.lose('The manor claimed you');

    expect(loop.phase).toBe('lost');
    expect(loop.outcome).toBe('The manor claimed you');

    loop.restart();
    expect(loop.phase).toBe('playing');
    expect(loop.outcome).toBeNull();
  });
});
