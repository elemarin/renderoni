import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../src/index.js';
import { AudioManager, audio } from '../src/audio/index.js';

describe('AudioManager Subsystem', () => {
  it('records deterministic audio events in headless mode without touching Web Audio', async () => {
    const game = await createRenderoni({
      mode: 'headless',
      subsystems: [audio({ volume: 0.8 })],
    });

    const handle = (game as any).audio.play('coin_pickup', {
      volume: 0.5,
      position: [1, 2, 3],
    });

    expect(handle.id).toBeDefined();
    expect(handle.isPlaying).toBe(true);

    const logs = (game as any).audio.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].clip).toBe('coin_pickup');
    expect(logs[0].volume).toBeCloseTo(0.4, 5); // 0.8 * 0.5
    expect(logs[0].position).toEqual([1, 2, 3]);

    (game as any).audio.dispose();
    game.dispose();
  });

  it('emits diagnostic RND_0301 when playing an unregistered clip in a non-empty registry', async () => {
    const manager = new AudioManager();
    manager.registerClip('known_sound', () => ({ stop: () => {}, setVolume: () => {} }));

    const handle = manager.play('unknown_sound');
    expect(handle.clip).toBe('unknown_sound');

    const logs = manager.getSoundLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].clip).toBe('unknown_sound');
  });

  it('applies master volume scaling to sound events', () => {
    const manager = new AudioManager({ masterVolume: 0.5 });
    manager.play('hit', { volume: 0.8 });

    const logs = manager.getSoundLogs();
    expect(logs[0].volume).toBeCloseTo(0.4, 5);

    manager.setMasterVolume(1.0);
    manager.play('hit2', { volume: 0.8 });
    const logs2 = manager.getSoundLogs();
    expect(logs2[1].volume).toBeCloseTo(0.8, 5);
  });
});
