import { describe, it, expect } from 'vitest';
import { createRenderoni, type RenderoniEngine, type WorldProvider } from '../src/index.js';
import { ObservationEngine, TIER0_BUDGET_BYTES } from '../src/core/observations.js';
import { createMCPServer } from '../src/mcp/index.js';

/**
 * World providers let a game whose simulation lives outside renderoni entities
 * (an RTS with its own Sim class, say) stay visible to agents through
 * describe, observe, check and the state hash.
 */

/** Minimal stand-in for a game-owned simulation run as a renderoni system. */
class TownSim {
  towns = [
    { id: 'ashford', pop: 12, food: 30 },
    { id: 'brine', pop: 5, food: 8 },
  ];
  tick = 0;

  update(): void {
    this.tick++;
    for (const town of this.towns) town.food += town.pop % 3;
  }

  provider(name = 'sim'): WorldProvider {
    return {
      name,
      describe: () => ({ tick: this.tick, towns: this.towns.map((t) => ({ ...t })) }),
      observe: (budget) => {
        const lines = this.towns.map((t) => `${t.id}: pop ${t.pop} food ${t.food}`);
        return budget > 0 ? lines : [];
      },
      resolve: (path) => {
        if (path[0] === 'tick') return this.tick;
        if (path[0] === 'towns') {
          const town = this.towns.find((t) => t.id === path[1]);
          if (!town) return undefined;
          return path[2] === undefined ? { ...town } : (town as Record<string, unknown>)[path[2]];
        }
        return undefined;
      },
      hash: () => this.towns.map((t) => `${t.id}:${t.pop}:${t.food}`).join('|'),
    };
  }
}

async function gameWithSim(): Promise<{ game: RenderoniEngine; sim: TownSim }> {
  const game = await createRenderoni({ mode: 'headless', seed: 11 });
  const sim = new TownSim();
  game.systems.add({ update: () => sim.update() });
  game.worlds.register(sim.provider());
  return { game, sim };
}

async function call(mcp: ReturnType<typeof createMCPServer>, name: string, args?: unknown) {
  return mcp.handleRequest({
    method: 'tools/call',
    params: args === undefined ? { name } : { name, arguments: args },
  });
}

describe('World providers: registration', () => {
  it('registers, lists in name order and unregisters', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    const offB = game.worlds.register({ name: 'beta' });
    const offA = game.worlds.register({ name: 'alpha' });

    expect(game.worlds.size).toBe(2);
    expect(game.worlds.list().map((p) => p.name)).toEqual(['alpha', 'beta']);
    expect(game.worlds.has('beta')).toBe(true);

    offB();
    offB();
    expect(game.worlds.has('beta')).toBe(false);
    expect(game.worlds.size).toBe(1);

    offA();
    expect(game.worlds.size).toBe(0);
    game.dispose();
  });

  it('rejects duplicate names with RND_0411 and keeps the first provider', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    const first = { name: 'sim' };
    game.worlds.register(first);

    expect(() => game.worlds.register({ name: 'sim' })).toThrow(/RND_0411/);
    expect(game.worlds.get('sim')).toBe(first);
    expect(game.diagnostics.getRecords().map((r) => r.code)).toContain('RND_0411');
    game.dispose();
  });

  it('rejects names that are not path-safe and non-function hooks with RND_0410', async () => {
    const game = await createRenderoni({ mode: 'headless' });

    for (const name of ['', 'a.b', 'has space', 'x'.repeat(65), 42 as unknown as string]) {
      expect(() => game.worlds.register({ name })).toThrow(/RND_0410/);
    }
    expect(() => game.worlds.register({ name: 'ok', hash: 'nope' } as unknown as WorldProvider)).toThrow(
      /RND_0410/
    );
    expect(() => game.worlds.register(null as unknown as WorldProvider)).toThrow(/RND_0410/);
    expect(game.worlds.size).toBe(0);
    expect(game.diagnostics.getRecords().every((r) => r.code === 'RND_0410')).toBe(true);
    game.dispose();
  });

  it('an unregister function never removes a later provider with the same name', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    const off = game.worlds.register({ name: 'sim' });
    off();
    const replacement = { name: 'sim' };
    game.worlds.register(replacement);
    off();
    expect(game.worlds.get('sim')).toBe(replacement);
    game.dispose();
  });

  it('is cleared on dispose', async () => {
    const { game } = await gameWithSim();
    game.dispose();
    expect(game.worlds.size).toBe(0);
  });
});

describe('World providers: observe', () => {
  it('appends provider lines after the entity lines within the Tier 0 budget', async () => {
    const { game } = await gameWithSim();
    game.add({ id: 'scout', state: { hp: 3 } });

    const { markdown, bytes } = ObservationEngine.generateTier0(game);
    const lines = markdown.split('\n');

    expect(bytes).toBeLessThanOrEqual(TIER0_BUDGET_BYTES);
    expect(lines[0]).toMatch(/^# Tick: 0/);
    expect(lines.indexOf('## sim')).toBeGreaterThan(lines.findIndex((l) => l.startsWith('scout:')));
    expect(lines).toContain('ashford: pop 12 food 30');
    expect(lines).toContain('brine: pop 5 food 8');
    game.dispose();
  });

  it('does not let a chatty provider starve the entities, nor the reverse', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    for (let i = 0; i < 40; i++) game.add({ id: `unit_${i}`, state: { hp: 100 } });
    let askedFor = -1;
    game.worlds.register({
      name: 'chatty',
      observe: (budget) => {
        askedFor = budget;
        return Array.from({ length: 200 }, (_, i) => `line ${i} ${'x'.repeat(20)}`);
      },
    });

    const { markdown, bytes } = ObservationEngine.generateTier0(game);
    expect(bytes).toBeLessThanOrEqual(TIER0_BUDGET_BYTES);
    expect(askedFor).toBeGreaterThan(150);
    expect(askedFor).toBeLessThan(TIER0_BUDGET_BYTES / 2);

    const [entityPart, providerPart] = markdown.split('\n## chatty');
    expect(providerPart).toBeDefined();
    expect(entityPart).toContain('unit_0:');
    expect(new TextEncoder().encode(entityPart).length).toBeGreaterThan(200);
    expect(providerPart).toContain('line 0');
    game.dispose();
  });

  it('gives unused provider budget back to the entities', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    for (let i = 0; i < 40; i++) game.add({ id: `unit_${i}`, state: { hp: 100 } });
    const without = ObservationEngine.generateTier0(game).markdown;

    game.worlds.register({ name: 'q', observe: () => ['ok'] });
    const withQuiet = ObservationEngine.generateTier0(game);
    expect(withQuiet.bytes).toBeLessThanOrEqual(TIER0_BUDGET_BYTES);
    expect(withQuiet.markdown).toContain('\n## q\nok');
    // Entities lose only the bytes the quiet provider actually used.
    const entityLines = (md: string) => md.split('\n').filter((l) => l.startsWith('unit_')).length;
    expect(entityLines(withQuiet.markdown)).toBeGreaterThanOrEqual(entityLines(without) - 1);
    game.dispose();
  });

  it('is unchanged for games without providers', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    game.add({ id: 'crate', state: { hp: 1 } });
    const before = ObservationEngine.generateTier0(game).markdown;
    game.worlds.register({ name: 'silent', describe: () => null });
    expect(ObservationEngine.generateTier0(game).markdown).toBe(before);
    game.dispose();
  });
});

describe('World providers: check', () => {
  it('resolves world.<name>.<path> for greaterThan, lessThan and equals', async () => {
    const { game } = await gameWithSim();
    game.step(4);

    const result = game.check([
      { op: 'equals', path: 'world.sim.tick', value: 4 },
      { op: 'greaterThan', path: 'world.sim.towns.ashford.food', value: 29 },
      { op: 'lessThan', path: 'world.sim.towns.brine.pop', value: 6 },
      { op: 'equals', path: 'world.sim.towns.brine', value: { id: 'brine', pop: 5, food: 16 } },
    ]);
    expect(result).toEqual({ passed: true, failures: [] });
    game.dispose();
  });

  it('reports failing values, missing providers and missing resolve()', async () => {
    const { game } = await gameWithSim();
    game.worlds.register({ name: 'opaque' });
    game.worlds.register({
      name: 'broken',
      resolve: () => {
        throw new Error('index out of date');
      },
    });

    const result = game.check([
      { op: 'greaterThan', path: 'world.sim.towns.brine.pop', value: 50 },
      { op: 'equals', path: 'world.sim.towns.nowhere', value: 1 },
      { op: 'equals', path: 'world.missing.anything', value: 1 },
      { op: 'lessThan', path: 'world.opaque.x', value: 1 },
      { op: 'equals', path: 'world.broken.x', value: 1 },
    ]);

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      'greaterThan failed for world.sim.towns.brine.pop: expected > 50, got 5',
      'equals failed for world.sim.towns.nowhere: expected 1, got undefined',
      'equals failed for world.missing.anything: no world provider named "missing" is registered',
      'lessThan failed for world.opaque.x: world provider "opaque" does not implement resolve()',
      'equals failed for world.broken.x: world provider "broken" failed to resolve: index out of date',
    ]);
    game.dispose();
  });

  it('keeps entity paths working exactly as before', async () => {
    const { game } = await gameWithSim();
    game.add({ id: 'hero', state: { hp: 10 } });
    const result = game.check([
      { op: 'equals', path: 'entities.hero.state.hp', value: 10 },
      { op: 'equals', path: 'entities.hero.position', value: [0, 0, 0] },
    ]);
    expect(result.failures).toEqual(['equals failed for entities.hero.position: expected 0,0,0, got 0,0,0']);
    game.dispose();
  });
});

describe('World providers: state hash', () => {
  // Computed with upstream main (eef080a) before world providers existed. The
  // scenario has no physics bodies, so the digest is not platform dependent.
  const PRE_PROVIDER_HASH = '0xefe1328288cc3308';

  async function slotlessScenario(): Promise<RenderoniEngine> {
    const game = await createRenderoni({ mode: 'headless', seed: 11 });
    game.add({ id: 'town-a', tags: ['town'], state: { pop: 7, owner: 'dust' } });
    game.add({ id: 'squad-1', state: { hp: 40, order: 'march' } });
    return game;
  }

  it('is byte-identical to the pre-provider digest without providers', async () => {
    const game = await slotlessScenario();
    game.step(3);
    expect(game.getStateHash()).toBe(PRE_PROVIDER_HASH);
    game.dispose();
  });

  it('is unchanged by providers that do not implement hash()', async () => {
    const game = await slotlessScenario();
    game.worlds.register({ name: 'view', describe: () => ({ ok: true }), observe: () => ['ok'] });
    game.step(3);
    expect(game.getStateHash()).toBe(PRE_PROVIDER_HASH);
    game.dispose();
  });

  it('changes when provider state changes and is stable run to run', async () => {
    const run = async () => {
      const { game } = await gameWithSim();
      const hashes = [game.getStateHash()];
      game.step(1);
      hashes.push(game.getStateHash());
      game.dispose();
      return hashes;
    };

    const [first, second] = [await run(), await run()];
    expect(first).toEqual(second);
    expect(first[0]).not.toBe(first[1]);
  });

  it('folds providers in name order regardless of registration order and value type', async () => {
    const make = async (order: string[]) => {
      const game = await createRenderoni({ mode: 'headless', seed: 3 });
      const hashes: Record<string, WorldProvider['hash']> = {
        a: () => 'alpha',
        b: () => 2.5,
        c: () => new Uint8Array([1, 2, 3]),
      };
      for (const name of order) game.worlds.register({ name, hash: hashes[name] });
      const digest = game.getStateHash();
      game.dispose();
      return digest;
    };

    const forward = await make(['a', 'b', 'c']);
    expect(await make(['c', 'a', 'b'])).toBe(forward);
    expect(forward).not.toBe(await make(['a', 'b']));
  });

  it('rejects invalid provider hash values with RND_0413', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    game.worlds.register({ name: 'nan', hash: () => Number.NaN });
    expect(() => game.getStateHash()).toThrow(/RND_0413/);
    expect(game.diagnostics.getRecords().map((r) => r.code)).toContain('RND_0413');
    game.dispose();
  });
});

describe('World providers: MCP end to end', () => {
  it('describes, observes, steps, acts and checks a provider-backed game', async () => {
    const { game, sim } = await gameWithSim();
    game.actions.register({
      name: 'sim.settle',
      handle: (payload: unknown) => {
        const { town, pop } = payload as { town: string; pop: number };
        sim.towns.find((t) => t.id === town)!.pop += pop;
      },
    });
    const mcp = createMCPServer({ game });

    const described = JSON.parse((await call(mcp, 'describe')).content[0].text);
    expect(described.worlds.sim.tick).toBe(0);
    expect(described.worlds.sim.towns).toHaveLength(2);
    expect(described.entitiesCount).toBe(0);

    const observed = JSON.parse((await call(mcp, 'observe')).content[0].text);
    expect(observed.markdown).toContain('## sim\nashford: pop 12 food 30');
    expect(observed.bytes).toBeLessThanOrEqual(TIER0_BUDGET_BYTES);

    const firstStep = JSON.parse((await call(mcp, 'step', { ticks: 1 })).content[0].text);
    const secondStep = JSON.parse((await call(mcp, 'step', { ticks: 1 })).content[0].text);
    expect(secondStep.stateHash).not.toBe(firstStep.stateHash);

    await call(mcp, 'act', { name: 'sim.settle', payload: { town: 'brine', pop: 3 } });
    await call(mcp, 'step', { ticks: 1 });

    const passed = JSON.parse(
      (
        await call(mcp, 'check', {
          assertions: [
            { op: 'equals', path: 'world.sim.tick', value: 3 },
            { op: 'equals', path: 'world.sim.towns.brine.pop', value: 8 },
          ],
        })
      ).content[0].text
    );
    expect(passed).toEqual({ passed: true, failures: [] });

    const failed = JSON.parse(
      (await call(mcp, 'check', { assertions: [{ op: 'greaterThan', path: 'world.nope.x', value: 0 }] }))
        .content[0].text
    );
    expect(failed.passed).toBe(false);
    expect(failed.failures[0]).toMatch(/no world provider named "nope"/);
    game.dispose();
  });

  it('omits worlds from describe when no provider is registered', async () => {
    const game = await createRenderoni({ mode: 'headless' });
    const described = JSON.parse((await call(createMCPServer({ game }), 'describe')).content[0].text);
    expect(described).not.toHaveProperty('worlds');
    game.dispose();
  });
});
