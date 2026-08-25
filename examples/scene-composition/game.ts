import { createRenderoni } from '../../src/index.js';
import { SceneManager, type GameDefinition, type SceneDefinition } from '../../src/scene/index.js';
import { audio } from '../../src/audio/index.js';
import { vfx } from '../../src/vfx/index.js';
import { body } from '../../src/presets/index.js';
import entranceJson from './scenes/dungeon-entrance.json' with { type: 'json' };
import sanctumJson from './scenes/inner-sanctum.json' with { type: 'json' };
import { createStoneFloor, createKeyPickup } from './models/EntranceTorch.js';
import { createSanctumAltar } from './models/SanctumAltar.js';

export async function createDungeonCompositionGame(options: { mode?: 'interactive' | 'headless' } = {}) {
  const engine = await createRenderoni({
    mode: options.mode ?? 'headless',
    seed: 42,
    subsystems: [audio(), vfx()],
  });

  const manager = new SceneManager(engine);

  const entranceScene: SceneDefinition = {
    id: 'dungeon_entrance',
    name: 'Dungeon Entrance',
    inventory: entranceJson,
    factories: {
      createStoneFloor,
      createKeyPickup,
    },
    entryPoints: {
      spawn: { id: 'spawn', position: [0, 1, 4] },
      from_sanctum: { id: 'from_sanctum', position: [0, 1, -4] },
    },
    setup: (ctx) => {
      // Setup trigger sensor to enter sanctum
      ctx.spawn(
        body({
          id: 'door_to_sanctum',
          shape: 'box',
          size: [2, 3, 0.5],
          position: [0, 1.5, -4.5],
          type: 'fixed',
          tags: ['sensor', 'doorway'],
        })
      );
    },
  };

  const sanctumScene: SceneDefinition = {
    id: 'inner_sanctum',
    name: 'Inner Sanctum',
    inventory: sanctumJson,
    factories: {
      createStoneFloor,
      createSanctumAltar,
    },
    entryPoints: {
      from_entrance: { id: 'from_entrance', position: [0, 1, 5] },
    },
    setup: (ctx) => {
      // Sparkle particles near altar
      const vfxSubsystem = (ctx.engine as any).vfx;
      if (vfxSubsystem) {
        vfxSubsystem.spawnParticles({
          position: [0, 1.5, -4],
          count: 40,
          color: 0x38bdf8,
          lifetime: 5.0,
        });
      }
    },
  };

  const gameDef: GameDefinition = {
    id: 'dungeon-adventure',
    name: 'Dungeon Adventure',
    startLevel: 'dungeon-depths',
    persistentEntities: ['hero_player'],
    levels: [
      {
        id: 'dungeon-depths',
        name: 'Dungeon Depths',
        startScene: 'dungeon_entrance',
        scenes: [entranceScene, sanctumScene],
      },
    ],
  };

  // Spawn persistent hero
  engine.add(
    body({
      id: 'hero_player',
      shape: 'capsule',
      radius: 0.4,
      size: [0.4, 1.8],
      type: 'dynamic',
      position: [0, 1, 4],
      tags: ['player'],
    })
  );

  await manager.loadGame(gameDef);

  return {
    engine,
    manager,
  };
}
