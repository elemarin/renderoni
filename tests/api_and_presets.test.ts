import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../src/index.js';
import { body, sensor, light, kccPlayer, dynamicPlayer, definePreset } from '../src/presets/index.js';
import { Type } from '@sinclair/typebox';

describe('Unified API, Presets & Engine', () => {
  it('creates and steps game with ground and dynamic falling body', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });

    // 1. Add fixed ground
    const ground = game.add(
      body({
        id: 'ground',
        shape: 'box',
        type: 'fixed',
        size: [50, 1, 50],
        position: [0, 0, 0],
      })
    );
    expect(ground.id).toBe('ground');

    // 2. Add dynamic crate above ground
    const crate = game.add(
      body({
        id: 'crate',
        shape: 'box',
        type: 'dynamic',
        size: [1, 1, 1],
        position: [0, 5, 0],
      })
    );

    expect(crate.position[1]).toBe(5);

    // Step 60 ticks (1 second)
    game.step(60);

    // Dynamic crate should have fallen onto the ground (approx y = 1.0)
    expect(crate.position[1]).toBeLessThan(5.0);
    expect(crate.position[1]).toBeGreaterThan(0.5);

    game.dispose();
  });

  it('triggers sensor overlap events deterministically', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 100 });
    const events: string[] = [];

    game.events.on('sensor.enter', (payload) => {
      events.push(`enter:${payload.sensor.id}->${payload.target.id}`);
    });

    // Add sensor trigger at y = 3
    game.add(
      sensor({
        id: 'checkpoint',
        shape: 'box',
        size: [5, 2, 5],
        position: [0, 3, 0],
      })
    );

    // Add falling ball at y = 6
    game.add(
      body({
        id: 'ball',
        shape: 'sphere',
        type: 'dynamic',
        radius: 0.5,
        position: [0, 6, 0],
      })
    );

    // Step 60 ticks (1 second) so ball falls into sensor
    game.step(60);

    expect(events.some((e) => e.includes('enter:checkpoint->ball'))).toBe(true);

    game.dispose();
  });

  it('creates lighting presets cleanly', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });

    const sun = game.add(
      light({
        id: 'sun',
        type: 'directional',
        intensity: 2.0,
        position: [10, 20, 10],
        castShadow: true,
      })
    );

    expect(sun.id).toBe('sun');
    expect(sun.state.intensity).toBe(2.0);

    game.dispose();
  });

  it('controls kccPlayer with move actions and gravity', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });

    // Ground
    game.add(body({ id: 'ground', shape: 'box', type: 'fixed', size: [50, 1, 50], position: [0, 0, 0] }));

    // Player
    const hero = game.add(
      kccPlayer({
        id: 'hero',
        position: [0, 1.5, 0],
        moveSpeed: 5.0,
      })
    );

    expect(hero.state.grounded).toBe(true);

    // Move player forward (z = 1)
    hero.actions.move({ x: 0, z: 1 });
    game.step(30); // 0.5s at 5m/s = 2.5m

    expect(hero.position[2]).toBeGreaterThan(1.0);

    game.dispose();
  });

  it('controls dynamicPlayer with force application', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });

    const marble = game.add(
      dynamicPlayer({
        id: 'marble',
        position: [0, 2, 0],
        moveForce: 50.0,
      })
    );

    marble.actions.move({ x: 1, z: 0 });
    game.step(30);

    expect(marble.position[0]).toBeGreaterThan(0.2);

    game.dispose();
  });

  it('supports custom definePreset authoring with TypeBox schema', async () => {
    const game = await createRenderoni({ mode: 'headless' });

    const CustomTargetSchema = Type.Object({
      id: Type.Optional(Type.String()),
      hp: Type.Optional(Type.Number({ default: 100 })),
    });

    const targetPreset = definePreset({
      name: 'game.target',
      version: 1,
      schema: CustomTargetSchema,
      create(ctx, options) {
        return ctx.entity({
          id: options.id,
          tags: ['target'],
          state: { hp: options.hp ?? 100 },
        });
      },
    });

    const target = game.add(targetPreset({ id: 'dummy', hp: 75 }));
    expect(target.id).toBe('dummy');
    expect(target.state.hp).toBe(75);

    game.dispose();
  });

  it('evaluates machine AST assertions with game.check()', async () => {
    const game = await createRenderoni({ mode: 'headless' });

    game.add(
      body({
        id: 'cube',
        position: [0, 10, 0],
      })
    );

    const check1 = game.check([
      { op: 'greaterThan', path: 'entities.cube.position.y', value: 5 },
      { op: 'noDiagnostics' },
    ]);
    expect(check1.passed).toBe(true);

    const check2 = game.check([{ op: 'lessThan', path: 'entities.cube.position.y', value: 5 }]);
    expect(check2.passed).toBe(false);
    expect(check2.failures.length).toBe(1);

    game.dispose();
  });

  it('guarantees identical state hashes across separate identical simulation runs (Gate 2)', async () => {
    const runSimulation = async () => {
      const g = await createRenderoni({ mode: 'headless', seed: 9999 });
      g.add(body({ id: 'floor', shape: 'box', type: 'fixed', size: [100, 1, 100], position: [0, 0, 0] }));
      const p = g.add(kccPlayer({ id: 'player', position: [0, 1.5, 0] }));

      p.actions.move({ x: 1, z: 1 });
      g.step(60);
      p.actions.jump();
      g.step(30);

      const hash = g.getStateHash();
      g.dispose();
      return hash;
    };

    const hash1 = await runSimulation();
    const hash2 = await runSimulation();
    const hash3 = await runSimulation();

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('retains constructor configuration when initialized separately', async () => {
    const game = new (await import('../src/core/engine.js')).RenderoniEngine({
      mode: 'headless',
      gravity: [0, -3, 0],
      clock: { tickRateHz: 30 },
    });

    await game.init();

    expect(game.native.world.gravity.y).toBe(-3);
    expect(game.native.world.integrationParameters.dt).toBeCloseTo(1 / 30);
    game.dispose();
  });

  it('rejects duplicate ids and never reuses generated live ids', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    const first = game.add({ tags: ['first'] });
    game.add({ id: 'named' });

    expect(() => game.add({ id: 'named' })).toThrow('Entity id already exists: named');
    first.destroy();
    expect(game.add({ tags: ['second'] }).id).not.toBe(first.id);
    game.dispose();
  });

  it('keeps entity transform writes authoritative in Rapier', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    const crate = game.add(body({ type: 'dynamic', position: [0, 5, 0] }));

    crate.position = [4, 8, 2];
    expect(crate.native.rapier?.body?.translation()).toMatchObject({ x: 4, y: 8, z: 2 });

    game.step();
    expect(crate.position[0]).toBeCloseTo(4);
    expect(crate.position[2]).toBeCloseTo(2);
    game.dispose();
  });

  it('drains structural mutations before systems and entity updates', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    game.add({ id: 'target', state: { active: false } });
    game.commands.addTag('target', 'active');
    game.commands.enqueue({ type: 'set_state', entityId: 'target', path: 'active', value: true });

    game.step();

    expect(game.entities.get('target')?.tags.has('active')).toBe(true);
    expect(game.entities.get('target')?.state.active).toBe(true);
    game.dispose();
  });

  it('includes entity state in deterministic hashes', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    const entity = game.add({ id: 'stateful', state: { score: 1 } });
    const before = game.getStateHash();

    entity.state.score = 2;

    expect(game.getStateHash()).not.toBe(before);
    game.dispose();
  });

  it('runs entity destruction hooks during engine disposal', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    let destroyed = false;
    game.add({ id: 'temporary', onDestroy: () => { destroyed = true; } });

    game.dispose();

    expect(destroyed).toBe(true);
  });

  it('drops active contacts when an entity is removed', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    game.add(body({ id: 'floor', type: 'fixed', size: [10, 1, 10] }));
    const crate = game.add(body({ id: 'crate', type: 'dynamic', position: [0, 2, 0] }));
    game.step(120);
    expect(game.physics.getActiveContacts().length).toBeGreaterThan(0);

    crate.destroy();

    expect(game.physics.getActiveContacts()).toEqual([]);
    game.dispose();
  });
});
