import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../src/index.js';
import {
  SceneManager,
  createGameFromScene,
  type GameDefinition,
  type SceneDefinition,
} from '../src/scene/index.js';
import { body } from '../src/presets/index.js';
import * as THREE from 'three';

describe('SceneManager Runtime Hierarchy & Lifecycle', () => {
  it('navigates Game -> Level -> Scene with deterministic lifecycle hooks', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 100 });
    const manager = new SceneManager(game);

    const lifecycleLog: string[] = [];

    const sceneA: SceneDefinition = {
      id: 'courtyard',
      setup: (ctx) => {
        lifecycleLog.push('courtyard:setup');
        ctx.spawn(
          body({
            id: 'statue',
            shape: 'box',
            size: [1, 2, 1],
            type: 'fixed',
            position: [0, 1, 0],
          })
        );
      },
      enter: () => {
        lifecycleLog.push('courtyard:enter');
      },
      exit: () => {
        lifecycleLog.push('courtyard:exit');
      },
      teardown: () => {
        lifecycleLog.push('courtyard:teardown');
      },
    };

    const sceneB: SceneDefinition = {
      id: 'hallway',
      entryPoints: {
        from_courtyard: {
          id: 'from_courtyard',
          position: [0, 1.5, 10],
        },
      },
      setup: (ctx) => {
        lifecycleLog.push('hallway:setup');
        ctx.spawn(
          body({
            id: 'door',
            shape: 'box',
            size: [1, 2, 0.2],
            type: 'fixed',
            position: [0, 1, 0],
          })
        );
      },
      enter: () => {
        lifecycleLog.push('hallway:enter');
      },
      exit: () => {
        lifecycleLog.push('hallway:exit');
      },
      teardown: () => {
        lifecycleLog.push('hallway:teardown');
      },
    };

    const gameDef: GameDefinition = {
      id: 'manor-game',
      startLevel: 'level-1',
      persistentEntities: ['hero'],
      levels: [
        {
          id: 'level-1',
          startScene: 'courtyard',
          scenes: [sceneA, sceneB],
        },
      ],
    };

    // Spawn persistent hero
    game.add(
      body({
        id: 'hero',
        shape: 'capsule',
        radius: 0.4,
        size: [0.4, 1.8],
        type: 'dynamic',
        position: [0, 1, 0],
      })
    );

    await manager.loadGame(gameDef);

    expect(manager.levelId).toBe('level-1');
    expect(manager.sceneId).toBe('courtyard');
    expect(game.entities.has('statue')).toBe(true);
    expect(game.entities.has('hero')).toBe(true);
    expect(lifecycleLog).toEqual(['courtyard:setup', 'courtyard:enter']);

    // Set persistent quest flag
    manager.persistent.set('quest.foundCrest', true);

    // Switch from Courtyard -> Hallway
    await manager.switchScene('hallway', { entryPoint: 'from_courtyard' });

    expect(manager.sceneId).toBe('hallway');
    expect(lifecycleLog).toEqual([
      'courtyard:setup',
      'courtyard:enter',
      'courtyard:exit',
      'courtyard:teardown',
      'hallway:setup',
      'hallway:enter',
    ]);

    // Scene-local statue destroyed, scene-local door spawned, persistent hero preserved
    expect(game.entities.has('statue')).toBe(false);
    expect(game.entities.has('door')).toBe(true);
    expect(game.entities.has('hero')).toBe(true);

    // Hero repositioned at entry point
    const hero = game.entities.get('hero')!;
    expect(hero.position[2]).toBeCloseTo(10, 1);

    // Persistent store preserved
    expect(manager.persistent.get('quest.foundCrest')).toBe(true);

    manager.dispose();
    game.dispose();
  });

  it('runs teardown and cleans up even if an individual hook throws', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });
    const manager = new SceneManager(game);

    const throwingScene: SceneDefinition = {
      id: 'faulty',
      setup: (ctx) => {
        ctx.spawn(body({ id: 'item1', shape: 'box', size: [1, 1, 1], type: 'fixed' }));
      },
      teardown: () => {
        throw new Error('Teardown failure');
      },
    };

    const nextScene: SceneDefinition = {
      id: 'clean',
      setup: (ctx) => {
        ctx.spawn(body({ id: 'item2', shape: 'box', size: [1, 1, 1], type: 'fixed' }));
      },
    };

    const gameDef: GameDefinition = {
      id: 'test',
      startLevel: 'lvl',
      levels: [
        {
          id: 'lvl',
          startScene: 'faulty',
          scenes: [throwingScene, nextScene],
        },
      ],
    };

    await manager.loadGame(gameDef);
    expect(game.entities.has('item1')).toBe(true);

    // Switch scene - should still clean up item1 despite teardown throw
    await expect(manager.switchScene('clean')).rejects.toThrow();

    manager.dispose();
    game.dispose();
  });

  it('mounts single-scene games via createGameFromScene adapter', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });
    const manager = new SceneManager(game);

    const legacyInventory = {
      version: 1,
      prompt: 'A crate in a field',
      elements: [
        {
          id: 'crate',
          factory: 'crateModel',
          kind: 'prop',
          position: [0, 0, 0],
          collider: { shape: 'box', size: [1, 1, 1] },
        },
      ],
    };

    const gameDef = createGameFromScene(legacyInventory, {
      crateModel: () => new THREE.Group(),
    });

    await manager.loadGame(gameDef);
    expect(game.entities.has('crate')).toBe(true);
    expect(manager.sceneId).toBe('main');

    manager.dispose();
    game.dispose();
  });
});
