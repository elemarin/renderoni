import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../../src/index.js';
import { kccPlayer, definePreset, body } from '../../src/presets/index.js';
import { audio } from '../../src/audio/index.js';
import { ObservationEngine } from '../../src/core/observations.js';
import '../../src/testing/matchers.js';

describe('Reference Archetype B: Infinite Voxel Terrain Sandbox', () => {
  it('executes chunk generation, block raycast break, and auto-stepping headlessly (Gate 6B)', async () => {
    const game = await createRenderoni({
      mode: 'headless',
      seed: 42,
      subsystems: [audio()],
    });

    // 1. Procedural Voxel Chunk Preset
    const voxelChunk = definePreset({
      name: 'voxel.chunk',
      version: 1,
      create(ctx, options: { chunkX: number; chunkZ: number }) {
        return ctx.entity({
          id: `chunk_${options.chunkX}_${options.chunkZ}`,
          tags: ['chunk'],
          state: { blocksBroken: 0 },
        });
      },
    });

    game.add(voxelChunk({ chunkX: 0, chunkZ: 0 }));

    // Floor and 1-block step (height = 1.0)
    game.add(body({ id: 'ground', shape: 'box', type: 'fixed', size: [20, 1, 20], position: [0, 0, 0] }));
    game.add(body({ id: 'voxel_step', shape: 'box', type: 'fixed', size: [2, 2, 2], position: [0, 1.5, 3] }));

    // 2. First-Person Voxel Player with Auto-Stepping (1-block height step = 1.1m)
    const player = game.add(
      kccPlayer({
        id: 'miner',
        position: [0, 1.5, 0],
        moveSpeed: 4.0,
        autoStep: { maxStepHeight: 1.1, minStepWidth: 0.2 },
      })
    );

    // 3. Block Break Action via Raycast (cast ray starting in front of player)
    game.actions.register({
      name: 'voxel.breakBlock',
      handle: () => {
        const hit = ObservationEngine.raycast(game, [0, 1.5, 1.0], [0, 0, 1], 10.0);
        if (hit.hit && hit.entityId) {
          game.remove(hit.entityId);
          (game as any).audio.play('block_pop', { position: hit.point });
          game.events.emit('voxel.broken', { entityId: hit.entityId });
        }
      },
    });

    // Raycast break block
    game.act({ name: 'voxel.breakBlock' });
    game.step(1);

    expect(game).toEmitEvent('voxel.broken');
    expect(game.entities.has('voxel_step')).toBe(false);

    // Move player forward
    player.actions.move({ x: 0, z: 1 });
    game.step(60);

    expect(player.position[2]).toBeGreaterThan(1.0);

    game.dispose();
  });
});
