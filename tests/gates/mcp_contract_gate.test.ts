import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import { createRenderoni, type RenderoniEngine } from '../../src/index.js';
import { body } from '../../src/presets/index.js';
import { ObservationEngine } from '../../src/core/observations.js';
import {
  createMCPServer,
  MAX_MCP_STEP_TICKS,
  MCP_PROTOCOL_VERSIONS,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  parseJsonRpcRequest,
} from '../../src/mcp/index.js';
import * as mcpModule from '../../src/mcp/index.js';

/**
 * MCP trust gate.
 *
 * An agent must be able to tell "you asked for something impossible" from
 * "the simulation moved". Every call below is a way of asking wrong, and every
 * one of them has to come back as an MCP tool error with the world untouched.
 */

async function gameWithActions(): Promise<RenderoniEngine> {
  const game = await createRenderoni({ mode: 'headless', seed: 7 });
  game.actions.register({ name: 'gate.free', handle: () => undefined });
  game.actions.register({ name: 'gate.strict', handle: () => undefined, schema: Type.String() });
  game.actions.register({
    name: 'gate.shaped',
    handle: () => undefined,
    schema: Type.Object({ power: Type.Number() }),
  });
  game.actions.register({
    name: 'gate.plain-schema',
    handle: () => undefined,
    schema: {
      type: 'object',
      properties: { power: { type: 'number', minimum: 0 } },
      required: ['power'],
      additionalProperties: false,
    },
  });
  return game;
}

async function call(mcp: ReturnType<typeof createMCPServer>, name: string, args?: unknown) {
  return mcp.handleRequest({
    method: 'tools/call',
    params: args === undefined ? { name } : { name, arguments: args },
  });
}

describe('MCP gate: transport and discovery', () => {
  it('ships stdio only, with no HTTP or SSE transport in the public surface', () => {
    expect(mcpModule.serveStdio).toBeTypeOf('function');
    const exported = Object.keys(mcpModule).join(' ');
    expect(exported).not.toMatch(/sse|http|websocket/i);
    expect(MCP_SERVER_INFO.name).toBe('renderoni');
  });

  it('lists exactly the five supported tools with usable input schemas', async () => {
    const mcp = createMCPServer();
    const listed = await mcp.handleRequest({ method: 'tools/list' });

    expect(listed.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'describe',
      'observe',
      'act',
      'step',
      'check',
    ]);
    expect(Object.keys(MCP_TOOLS)).toHaveLength(5);
    expect(listed.tools.find((tool: { name: string }) => tool.name === 'act').inputSchema.required).toEqual([
      'name',
    ]);
    expect(listed.tools.find((tool: { name: string }) => tool.name === 'check').inputSchema.required).toEqual([
      'assertions',
    ]);
  });

  it('discovers registered actions and their schemas through describe', async () => {
    const game = await gameWithActions();
    const mcp = createMCPServer({ game });

    const described = JSON.parse((await call(mcp, 'describe')).content[0].text);
    const names = described.actions.map((action: { name: string }) => action.name);

    expect(names).toContain('gate.free');
    expect(names).toContain('gate.strict');
    expect(described.actions.find((action: { name: string }) => action.name === 'gate.shaped').schema)
      .toBeDefined();
    expect(game.actions.list().map((action) => action.name).sort()).toEqual([...names].sort());

    game.dispose();
  });

  it('reports an unsupported JSON-RPC method instead of answering it', async () => {
    const mcp = createMCPServer();
    await expect(mcp.handleRequest({ method: 'resources/list' })).rejects.toThrow(/Unsupported MCP method/);
  });

  it('negotiates the latest supported protocol when the client version is unsupported', async () => {
    const mcp = createMCPServer();
    const initialized = await mcp.handleRequest({
      method: 'initialize',
      params: { protocolVersion: '2099-01-01' },
    });

    expect(initialized.protocolVersion).toBe(MCP_PROTOCOL_VERSIONS.at(-1));
  });

  it('parses only valid JSON-RPC 2.0 request objects', () => {
    for (const line of [
      'null',
      '[]',
      '"ping"',
      '{"jsonrpc":"2.0"}',
      '{"jsonrpc":"1.0","method":"ping"}',
      '{"jsonrpc":"2.0","method":"ping","id":{}}',
      '{"jsonrpc":"2.0","method":"ping","params":null}',
    ]) {
      const parsed = parseJsonRpcRequest(line);
      expect(parsed.error?.error).toEqual({ code: -32600, message: 'Invalid Request' });
    }

    expect(parseJsonRpcRequest('{').error?.error).toEqual({ code: -32700, message: 'Parse error' });
    expect(parseJsonRpcRequest('{"jsonrpc":"2.0","id":1,"method":"ping"}').request).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    });
  });
});

describe('MCP gate: negative paths return isError and change nothing', () => {
  it('rejects unknown tools, malformed params and missing required fields', async () => {
    const game = await gameWithActions();
    const mcp = createMCPServer({ game });

    const rejected = [
      { params: { name: 'teleport' }, why: 'unknown tool' },
      { params: { name: '' }, why: 'empty tool name' },
      { params: { name: 42 }, why: 'non-string tool name' },
      { params: undefined, why: 'missing params' },
      { params: { name: 'act', arguments: {} }, why: 'act without a name' },
      { params: { name: 'act', arguments: { name: 7 } }, why: 'act name of the wrong type' },
      { params: { name: 'check', arguments: {} }, why: 'check without assertions' },
      { params: { name: 'check', arguments: { assertions: 'all' } }, why: 'check assertions not an array' },
      { params: { name: 'check', arguments: { assertions: ['nope'] } }, why: 'check assertions not objects' },
      { params: { name: 'step', arguments: { ticks: 'two' } }, why: 'step ticks of the wrong type' },
    ];

    for (const { params, why } of rejected) {
      const result = await mcp.handleRequest({ method: 'tools/call', params });
      expect(result.isError, why).toBe(true);
      expect(JSON.parse(result.content[0].text).error, why).toBeTypeOf('string');
    }

    expect(game.tick).toBe(0);
    game.dispose();
  });

  it('never queues an unknown action', async () => {
    const game = await gameWithActions();
    const mcp = createMCPServer({ game });

    const result = await call(mcp, 'act', { name: 'gate.missing', payload: { power: 1 } });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain('Unknown action');
    game.step(1);
    expect(game.diagnostics.hasErrors?.() ?? false).toBe(false);
    expect(game.tick).toBe(1);
    game.dispose();
  });

  it('accepts JSON primitive payloads and refuses everything that is not JSON', async () => {
    const game = await gameWithActions();
    const received: unknown[] = [];
    game.actions.register({ name: 'gate.record', handle: (payload) => received.push(payload) });
    const mcp = createMCPServer({ game });

    for (const payload of ['text', 12, 0, null, true, false, [1, 2], { nested: { ok: true } }]) {
      const result = await call(mcp, 'act', { name: 'gate.record', payload });
      expect(result.isError, JSON.stringify(payload)).toBeUndefined();
    }
    game.step(1);
    expect(received).toEqual(['text', 12, 0, null, true, false, [1, 2], { nested: { ok: true } }]);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const nonJson = [undefined, () => undefined, Symbol('nope'), Number.NaN, circular, new Date()];
    for (const payload of nonJson) {
      const result = await call(mcp, 'act', { name: 'gate.record', payload });
      expect(result.isError, String(payload)).toBe(true);
    }

    game.step(1);
    expect(received).toHaveLength(8);
    game.dispose();
  });

  it('enforces the schema a registered action declares', async () => {
    const game = await gameWithActions();
    const mcp = createMCPServer({ game });

    expect((await call(mcp, 'act', { name: 'gate.strict', payload: 'ok' })).isError).toBeUndefined();
    expect((await call(mcp, 'act', { name: 'gate.strict', payload: 7 })).isError).toBe(true);
    expect((await call(mcp, 'act', { name: 'gate.shaped', payload: { power: 2 } })).isError).toBeUndefined();
    expect((await call(mcp, 'act', { name: 'gate.shaped', payload: { power: 'high' } })).isError).toBe(true);
    expect((await call(mcp, 'act', { name: 'gate.shaped', payload: {} })).isError).toBe(true);
    expect((await call(mcp, 'act', { name: 'gate.plain-schema', payload: { power: 2 } })).isError)
      .toBeUndefined();
    expect((await call(mcp, 'act', { name: 'gate.plain-schema', payload: { power: -1 } })).isError)
      .toBe(true);
    expect((await call(mcp, 'act', { name: 'gate.plain-schema', payload: { power: 2, extra: true } })).isError)
      .toBe(true);

    game.dispose();
  });

  it('refuses tick counts that are not positive whole numbers', async () => {
    const game = await gameWithActions();
    const mcp = createMCPServer({ game });

    for (const ticks of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      MAX_MCP_STEP_TICKS + 1,
      2 ** 53,
      '3',
    ]) {
      const result = await call(mcp, 'step', { ticks });
      expect(result.isError, String(ticks)).toBe(true);
    }
    expect(game.tick).toBe(0);

    const ok = await call(mcp, 'step', { ticks: 3 });
    expect(JSON.parse(ok.content[0].text)).toMatchObject({ tick: 3 });
    expect(JSON.parse(ok.content[0].text).stateHash).toMatch(/^0x[0-9a-f]{16}$/);

    game.dispose();
  });

  it('refuses observation tiers and fromTick values it cannot serve', async () => {
    const game = await gameWithActions();
    const mcp = createMCPServer({ game });

    for (const tier of [2, 3, -1, 1.5, '0', null]) {
      const result = await call(mcp, 'observe', { tier });
      expect(result.isError, String(tier)).toBe(true);
    }
    for (const fromTick of [-1, 2.5, '0']) {
      const result = await call(mcp, 'observe', { fromTick });
      expect(result.isError, String(fromTick)).toBe(true);
    }

    expect((await call(mcp, 'observe', { tier: 0 })).isError).toBeUndefined();
    expect((await call(mcp, 'observe', { tier: 1, fromTick: 0 })).isError).toBeUndefined();

    game.dispose();
  });

  it('refuses assertion ops it does not implement', async () => {
    const game = await gameWithActions();
    const mcp = createMCPServer({ game });

    const bad = await call(mcp, 'check', { assertions: [{ op: 'toBeAwesome', path: 'tick' }] });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.content[0].text).error).toContain('unsupported assertion op');

    const good = await call(mcp, 'check', { assertions: [{ op: 'hasTick', value: 0 }] });
    expect(JSON.parse(good.content[0].text)).toMatchObject({ passed: true });

    game.dispose();
  });
});

describe('MCP gate: Tier 0 token economics', () => {
  it('stays inside 500 UTF-8 bytes with a realistic entity count', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 8 });
    game.add(body({ id: 'floor', type: 'fixed', size: [80, 1, 80], position: [0, 0, 0] }));
    for (let i = 0; i < 120; i++) {
      game.add(
        body({
          id: `prop_${i}_crate_with_a_long_descriptive_name`,
          type: 'dynamic',
          position: [i % 12, 2 + (i % 5), Math.floor(i / 12)],
        })
      );
    }
    game.step(20);

    const observation = ObservationEngine.generateTier0(game);
    const encoded = new TextEncoder().encode(observation.markdown);

    expect(game.entities.list().length).toBe(121);
    expect(observation.bytes).toBe(encoded.length);
    expect(observation.bytes).toBeLessThanOrEqual(500);
    expect(observation.markdown).toContain('# Tick: 20');

    const mcp = createMCPServer({ game });
    const viaTool = JSON.parse((await call(mcp, 'observe', { tier: 0 })).content[0].text);
    expect(new TextEncoder().encode(viaTool.markdown).length).toBeLessThanOrEqual(500);

    game.dispose();
  });

  it('keeps the same budget when entity ids are multi-byte', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 9 });
    for (let i = 0; i < 80; i++) {
      game.add(body({ id: `実体_${i}_界`, position: [i, 1, 0] }));
    }

    const observation = ObservationEngine.generateTier0(game);

    expect(new TextEncoder().encode(observation.markdown).length).toBe(observation.bytes);
    expect(observation.bytes).toBeLessThanOrEqual(500);
    expect(observation.markdown).toContain('… [truncated]');

    game.dispose();
  });
});
