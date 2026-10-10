import { describe, it, expect, vi } from 'vitest';

/**
 * Optional physics: `physics: false` engines must never load Rapier.
 *
 * The Rapier module is wrapped so the test can see whether anything imported
 * it. Tests run in order: every physics-free test runs before the first
 * default engine is created, which is the first (and only) load.
 */
const rapierLoads = vi.hoisted(() => ({ count: 0 }));
vi.mock('@dimforge/rapier3d-compat', async (importOriginal) => {
  rapierLoads.count++;
  return importOriginal();
});

import { createRenderoni, RenderoniEngine } from '../src/index.js';
import { body, kccPlayer, mesh, sensor } from '../src/presets/index.js';

describe('Optional physics: physics: false', () => {
  it('initializes, steps and hashes without loading Rapier', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 11, physics: false });
    expect(game.physicsEnabled).toBe(false);
    expect(game.physics.hasWorld).toBe(false);

    game.add({ id: 'town-a', tags: ['town'], state: { pop: 7, owner: 'dust' } });
    game.add({ id: 'squad-1', state: { hp: 40, order: 'march' } });
    game.step(3);

    expect(game.tick).toBe(3);
    // Same digest as the physics-enabled engine on upstream main: slotless
    // entities hash identically with and without a Rapier world.
    expect(game.getStateHash()).toBe('0xefe1328288cc3308');
    expect(rapierLoads.count).toBe(0);
    game.dispose();
  });

  it('runs systems, actions and world providers', async () => {
    const game = new RenderoniEngine({ mode: 'headless', physics: false });
    await game.init();

    const seen: string[] = [];
    let counter = 0;
    game.systems.add({ phase: 'prePhysics', update: ({ tick }) => seen.push(`pre:${tick}`) });
    game.systems.add({ update: ({ tick }) => seen.push(`post:${tick}`) });
    game.actions.register({ name: 'count', handle: (by: unknown) => (counter += by as number) });
    game.worlds.register({ name: 'sim', hash: () => counter, resolve: () => counter });

    const before = game.getStateHash();
    game.act({ name: 'count', payload: 5 });
    game.step(2);

    expect(seen).toEqual(['pre:0', 'post:0', 'pre:1', 'post:1']);
    expect(counter).toBe(5);
    expect(game.check([{ op: 'equals', path: 'world.sim.x', value: 5 }]).passed).toBe(true);
    expect(game.getStateHash()).not.toBe(before);
    expect(game.physics.getActiveContacts()).toEqual([]);
    expect(rapierLoads.count).toBe(0);
    game.dispose();
  });

  it('reports RND_0412 from native.world', async () => {
    const game = await createRenderoni({ mode: 'headless', physics: false });
    expect(() => game.native.world).toThrow(/RND_0412: engine\.native\.world is unavailable/);
    expect(game.diagnostics.getRecords().map((r) => r.code)).toEqual(['RND_0412']);
    game.dispose();
  });

  it('rejects Rapier-backed presets with RND_0412 and leaves nothing behind', async () => {
    const game = await createRenderoni({ mode: 'headless', physics: false });

    for (const preset of [
      body({ id: 'crate', shape: 'box', type: 'dynamic' }),
      sensor({ id: 'coin' }),
      kccPlayer({ id: 'hero' }),
      mesh({ id: 'wall', physics: 'static' }),
    ]) {
      expect(() => game.add(preset)).toThrow(/RND_0412: ctx\.native\.rapier is unavailable/);
    }

    expect(game.entities.list()).toEqual([]);
    expect(game.native.scene.children).toHaveLength(0);
    expect(game.diagnostics.getRecords().every((r) => r.code === 'RND_0412')).toBe(true);
    expect(rapierLoads.count).toBe(0);
    game.dispose();
  });

  it('still adds physics-free presets', async () => {
    const game = await createRenderoni({ mode: 'headless', physics: false });
    const wall = game.add(mesh({ id: 'wall', position: [1, 2, 3] }));
    game.step(1);
    expect(wall.position).toEqual([1, 2, 3]);
    expect(game.diagnostics.getRecords()).toEqual([]);
    game.dispose();
  });
});

describe('Optional physics: default engine', () => {
  it('loads Rapier lazily at init and simulates bodies as before', async () => {
    expect(rapierLoads.count).toBe(0);
    const game = await createRenderoni({ mode: 'headless', seed: 3 });
    expect(rapierLoads.count).toBe(1);
    expect(game.physicsEnabled).toBe(true);
    expect(game.physics.hasWorld).toBe(true);

    game.add(body({ id: 'floor', shape: 'box', type: 'fixed', size: [10, 1, 10], position: [0, 0, 0] }));
    const crate = game.add(body({ id: 'crate', shape: 'box', type: 'dynamic', position: [0, 3, 0] }));
    game.step(120);

    expect(crate.position[1]).toBeGreaterThan(0.5);
    expect(crate.position[1]).toBeLessThan(1.5);
    expect(game.physics.getActiveContacts()).toEqual([
      { entityA: 'crate', entityB: 'floor', started: true },
    ]);
    game.dispose();

    await createRenderoni({ mode: 'headless' }).then((second) => second.dispose());
    expect(rapierLoads.count).toBe(1);
  });
});
