import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../src/index.js';
import { parseSceneInventory, uniqueFactories, mountSceneInventory } from '../src/scene/index.js';
import { proceduralModel } from '../src/presets/index.js';
import * as THREE from 'three';
import '../src/testing/matchers.js';

const courtyard = {
  version: 1 as const,
  prompt: 'A crate and a coin in a courtyard',
  seed: 7,
  elements: [
    {
      id: 'crate',
      factory: 'woodCrate',
      kind: 'prop' as const,
      position: [0, 0.5, 0] as [number, number, number],
      collider: { shape: 'box' as const, size: [1, 1, 1] },
    },
    {
      id: 'coin',
      factory: 'goldCoin',
      kind: 'pickup' as const,
      position: [2, 1, 0] as [number, number, number],
      collider: { shape: 'sphere' as const, radius: 0.5, sensor: true },
      role: 'collectible',
    },
  ],
};

describe('Scene inventory + procedural models', () => {
  it('parses a compact inventory and lists unique factories', () => {
    const inventory = parseSceneInventory(courtyard);
    expect(inventory.elements).toHaveLength(2);
    expect(uniqueFactories(inventory)).toEqual(['woodCrate', 'goldCoin']);
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      parseSceneInventory({
        prompt: 'bad',
        elements: [
          { id: 'a', factory: 'x', kind: 'prop', position: [0, 0, 0] },
          { id: 'a', factory: 'y', kind: 'prop', position: [1, 0, 0] },
        ],
      })
    ).toThrow(/Duplicate/);
  });

  it('mounts factories as entities and falls back when missing', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });
    game.add(
      proceduralModel({
        id: 'marker',
        create: () => new THREE.Group(),
        position: [0, 2, 0],
        collider: { shape: 'box', size: [0.2, 0.2, 0.2] },
      })
    );

    const spawned = mountSceneInventory(game, courtyard, {
      woodCrate: () => {
        const g = new THREE.Group();
        g.name = 'crate-factory';
        return g;
      },
    });

    expect(spawned).toHaveLength(2);
    expect(game.entities.get('crate')?.tags.has('prop')).toBe(true);
    expect(game.entities.get('coin')?.tags.has('sensor')).toBe(true);
    expect(game.entities.get('coin')?.state.factory).toBe('goldCoin');

    game.step(10);
    expect(game).toHaveTick(10);
    expect(game.entities.get('crate')?.position[1]).toBeCloseTo(0.5, 1);

    game.dispose();
  });
});
