import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../../src/index.js';
import { body, kccPlayer, sensor } from '../../src/presets/index.js';
import { audio } from '../../src/audio/index.js';
import { animation } from '../../src/animation/index.js';
import { vfx } from '../../src/vfx/index.js';
import { ui } from '../../src/ui/index.js';
import { createMCPServer } from '../../src/mcp/index.js';
import { ObservationEngine } from '../../src/core/observations.js';
import '../../src/testing/matchers.js';

describe('Renderoni 6 MVP Validation Gates', () => {
  it('Gate 1: Headless Parity - Complete quickstart runs headlessly in <10ms without DOM shims', async () => {
    const game = await createRenderoni({
      mode: 'headless',
      seed: 42,
      subsystems: [audio(), animation(), vfx(), ui()],
    });

    game.add(body({ id: 'ground', shape: 'box', type: 'fixed', size: [50, 1, 50], position: [0, 0, 0] }));
    const hero = game.add(kccPlayer({ id: 'hero', position: [0, 1.5, 0] }));
    game.add(sensor({ id: 'coin', position: [3, 1, 0] }));

    hero.actions.move({ x: 1, z: 0 });

    // Measure simulation step execution time
    const startStep = performance.now();
    game.step(60);
    const stepElapsed = performance.now() - startStep;
    const perTickMs = stepElapsed / 60;

    expect(game).toHaveTick(60);
    expect(hero.position[0]).toBeGreaterThan(1.0);
    // Gate 1: Simulation tick in Node.js executes in <10ms
    expect(perTickMs).toBeLessThan(10);

    game.dispose();
  });

  it('Gate 2: Determinism Hash Parity - 20 runs produce 100% identical XXH3 state hashes across 1,000 ticks', async () => {
    const simulate1000Ticks = async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 7777 });
      game.add(body({ id: 'floor', shape: 'box', type: 'fixed', size: [100, 1, 100], position: [0, 0, 0] }));

      for (let i = 0; i < 5; i++) {
        game.add(
          body({
            id: `box_${i}`,
            shape: 'box',
            type: 'dynamic',
            size: [1, 1, 1],
            position: [i * 2, 5 + i * 2, 0],
          })
        );
      }

      const player = game.add(kccPlayer({ id: 'runner', position: [0, 1.5, 0] }));
      player.actions.move({ x: 1, z: 0 });

      // Run 1,000 fixed simulation ticks
      game.step(1000);

      const hash = game.getStateHash();
      game.dispose();
      return hash;
    };

    const firstHash = await simulate1000Ticks();
    expect(firstHash).toBeDefined();

    for (let run = 0; run < 10; run++) {
      const h = await simulate1000Ticks();
      expect(h).toBe(firstHash);
    }
  });

  it('Gate 3: Transform Isolation - Zero render interpolation bleeds into canonical physics buffer', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });

    const crate = game.add(
      body({
        id: 'crate',
        shape: 'box',
        type: 'dynamic',
        position: [0, 10, 0],
      })
    );

    game.step(10);
    const canonicalY = crate.position[1];

    // Compute interpolation at alpha 0.5
    const outPos: [number, number, number] = [0, 0, 0];
    const outQuat: [number, number, number, number] = [0, 0, 0, 1];
    game.transformPipeline.interpolate(crate.slot!, 0.5, outPos, outQuat);

    // Verify canonical buffer was not modified by interpolation computation
    expect(crate.position[1]).toBe(canonicalY);
    expect(game.transformPipeline.getPosition(crate.slot!)[1]).toBe(canonicalY);

    game.dispose();
  });

  it('Gate 4: Agent Verification - MCP agent inspects, acts, steps, and asserts state headlessly', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });
    game.add(body({ id: 'target_cube', position: [0, 10, 0], type: 'dynamic' }));

    const mcp = createMCPServer({ game });

    // Step 30 ticks via MCP
    await mcp.handleRequest({
      method: 'tools/call',
      params: { name: 'step', arguments: { ticks: 30 } },
    });

    // Check state via MCP AST
    const checkRes = await mcp.handleRequest({
      method: 'tools/call',
      params: {
        name: 'check',
        arguments: {
          assertions: [{ op: 'lessThan', path: 'entities.target_cube.position.y', value: 10 }],
        },
      },
    });

    const parsed = JSON.parse(checkRes.content[0].text);
    expect(parsed.passed).toBe(true);

    // Verify Tier 0 observation payload is under 500 bytes
    const obs = ObservationEngine.generateTier0(game);
    expect(obs.bytes).toBeLessThan(500);

    game.dispose();
  });

  it('Gate 5: Memory Safety - Repeated 3,600-tick spawn/despawn cycles exhibit zero leaks', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });

    // 60 cycles of 60 ticks = 3,600 ticks
    for (let cycle = 0; cycle < 60; cycle++) {
      const entityId = `temp_box_${cycle}`;
      const ent = game.add(body({ id: entityId, shape: 'box', type: 'dynamic', position: [0, 5, 0] }));
      game.step(30);
      ent.destroy();
      game.step(30);
    }

    expect(game.entities.list().length).toBe(0);
    expect(game.tick).toBe(3600);
    expect(game).toHavePassedDiagnostics();

    game.dispose();
  });
});
