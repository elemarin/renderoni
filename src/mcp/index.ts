/**
 * Renderoni Model Context Protocol (MCP) Server (renderoni/mcp)
 *
 * Implements JSON-RPC and MCP tools (describe, observe, act, step, check)
 * for autonomous AI coding agents.
 */

import * as readline from 'node:readline';
import type { RenderoniEngine } from '../core/engine.js';
import { ObservationEngine } from '../core/observations.js';
import { evaluateCheck, type AssertionOp } from '../testing/check.js';

export const MCP_PROTOCOL_VERSIONS = [
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
  '2025-11-25',
] as const;

export const MCP_SERVER_INFO = {
  name: 'renderoni',
  title: 'Renderoni',
  version: '0.1.0',
  description: 'Headless deterministic 3D game engine MCP server',
} as const;

export const MCP_INSTRUCTIONS =
  'Inspect and drive a headless Renderoni simulation. describe/observe inspect state, act dispatches gameplay, step advances ticks, check evaluates assertions. The world starts empty until entities are spawned by game code.';

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (game: RenderoniEngine, args: any) => Promise<unknown> | unknown;
}

interface JsonSchemaProperty {
  type: string;
  default?: unknown;
  required?: boolean;
  items?: Record<string, unknown>;
}

function toInputSchema(parameters: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, raw] of Object.entries(parameters)) {
    const spec = { ...(raw as JsonSchemaProperty) };
    if (spec.required === true) {
      required.push(key);
    }
    delete spec.required;
    properties[key] = spec;
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export const MCP_TOOLS: Record<string, MCPToolDefinition> = {
  describe: {
    name: 'describe',
    description: 'Inspect active entities, registered presets, and game configuration',
    parameters: {},
    execute: (game: RenderoniEngine) => {
      return {
        tick: game.tick,
        mode: game.mode,
        seed: game.seed,
        tickRateHz: game.tickRateHz,
        entitiesCount: game.entities.list().length,
        entities: game.entities.list().map((e) => ({
          id: e.id,
          preset: e.presetName,
          tags: Array.from(e.tags),
          state: e.state,
          position: e.position,
        })),
      };
    },
  },

  observe: {
    name: 'observe',
    description: 'Get token-efficient semantic observation (Tier 0 Markdown, Tier 1 delta, or Tier 2 query)',
    parameters: {
      tier: { type: 'number', default: 0 },
      fromTick: { type: 'number' },
    },
    execute: (game: RenderoniEngine, args: { tier?: number; fromTick?: number }) => {
      const tier = args?.tier ?? 0;
      if (tier === 1) {
        return ObservationEngine.generateDelta(game, args?.fromTick ?? 0);
      }
      return ObservationEngine.generateTier0(game);
    },
  },

  act: {
    name: 'act',
    description: 'Dispatch an action programmatically to an entity or game system',
    parameters: {
      name: { type: 'string', required: true },
      payload: { type: 'object' },
    },
    execute: (game: RenderoniEngine, args: { name: string; payload?: unknown }) => {
      game.act({ name: args.name, payload: args.payload });
      return { dispatched: true, action: args.name };
    },
  },

  step: {
    name: 'step',
    description: 'Advance simulation by N fixed ticks',
    parameters: {
      ticks: { type: 'number', default: 1 },
    },
    execute: (game: RenderoniEngine, args: { ticks?: number }) => {
      const ticksToRun = args?.ticks ?? 1;
      game.step(ticksToRun);
      return {
        tick: game.tick,
        stateHash: game.getStateHash(),
      };
    },
  },

  check: {
    name: 'check',
    description: 'Evaluate machine AST assertions against game state',
    parameters: {
      assertions: { type: 'array', items: { type: 'object' }, required: true },
    },
    execute: (game: RenderoniEngine, args: { assertions: AssertionOp[] }) => {
      return evaluateCheck(game, args.assertions);
    },
  },
};

export interface MCPServerOptions {
  transport?: 'stdio' | 'sse';
  game?: RenderoniEngine;
  createGame?: () => Promise<RenderoniEngine> | RenderoniEngine;
}

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: any;
}

export class MCPServer {
  private game: RenderoniEngine | null = null;
  private readonly createGame?: () => Promise<RenderoniEngine> | RenderoniEngine;
  private gamePromise: Promise<RenderoniEngine> | null = null;

  constructor(options: MCPServerOptions = {}) {
    this.createGame = options.createGame;
    if (options.game) {
      this.attachGame(options.game);
    }
  }

  attachGame(game: RenderoniEngine): void {
    this.game = game;
  }

  async handleRequest(request: { method: string; params?: any }): Promise<any> {
    const method = request.method;

    if (method === 'initialize') {
      const requested = request.params?.protocolVersion as string | undefined;
      const protocolVersion =
        requested && (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : (requested ?? '2025-11-25');

      return {
        protocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: { ...MCP_SERVER_INFO },
        instructions: MCP_INSTRUCTIONS,
      };
    }

    if (
      method === 'notifications/initialized' ||
      method === 'initialized' ||
      method === 'notifications/cancelled'
    ) {
      return {};
    }

    if (method === 'ping' || method === 'logging/setLevel') {
      return {};
    }

    if (method === 'tools/list') {
      return {
        tools: Object.values(MCP_TOOLS).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: toInputSchema(t.parameters),
        })),
      };
    }

    if (method === 'tools/call') {
      const game = await this.ensureGame();
      const toolName = request.params?.name;
      const tool = MCP_TOOLS[toolName];
      if (!tool) {
        throw Object.assign(new Error(`Tool not found: ${toolName}`), { code: -32602 });
      }
      const result = await tool.execute(game, request.params?.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    throw Object.assign(new Error(`Unsupported MCP method: ${method}`), { code: -32601 });
  }

  private async ensureGame(): Promise<RenderoniEngine> {
    if (this.game) {
      return this.game;
    }
    if (!this.createGame) {
      throw Object.assign(new Error('No game attached to MCPServer'), { code: -32603 });
    }
    if (!this.gamePromise) {
      this.gamePromise = Promise.resolve(this.createGame()).then((game) => {
        this.attachGame(game);
        return game;
      });
    }
    return this.gamePromise;
  }
}

export function createMCPServer(options: MCPServerOptions = {}) {
  return new MCPServer(options);
}

function writeJsonRpc(output: NodeJS.WritableStream, message: Record<string, unknown>): void {
  output.write(`${JSON.stringify(message)}\n`);
}

export function serveStdio(options: MCPServerOptions = {}): Promise<void> {
  const server = createMCPServer(options);
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  return new Promise((resolve) => {
    rl.on('line', async (line) => {
      if (!line.trim()) {
        return;
      }

      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch {
        writeJsonRpc(process.stdout, {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        });
        return;
      }

      const isNotification =
        request.id === undefined || String(request.method ?? '').startsWith('notifications/');
      try {
        const result = await server.handleRequest(request);
        if (!isNotification) {
          writeJsonRpc(process.stdout, { jsonrpc: '2.0', id: request.id ?? null, result });
        }
      } catch (err) {
        if (isNotification) {
          return;
        }
        const error = err as Error & { code?: number };
        writeJsonRpc(process.stdout, {
          jsonrpc: '2.0',
          id: request.id ?? null,
          error: {
            code: error.code ?? -32603,
            message: error.message,
          },
        });
      }
    });

    rl.on('close', () => resolve());
  });
}
