/**
 * Renderoni Model Context Protocol (MCP) Server (renderoni/mcp)
 *
 * Implements JSON-RPC and MCP tools (describe, observe, act, step, check)
 * for autonomous AI coding agents.
 */

import type { RenderoniEngine } from '../core/engine.js';
import { ObservationEngine } from '../core/observations.js';
import { evaluateCheck, type AssertionOp } from '../testing/check.js';

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (game: RenderoniEngine, args: any) => Promise<unknown> | unknown;
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
      assertions: { type: 'array', required: true },
    },
    execute: (game: RenderoniEngine, args: { assertions: AssertionOp[] }) => {
      return evaluateCheck(game, args.assertions);
    },
  },
};

export interface MCPServerOptions {
  transport?: 'stdio' | 'sse';
  game?: RenderoniEngine;
}

export class MCPServer {
  private game: RenderoniEngine | null = null;

  constructor(options: MCPServerOptions = {}) {
    if (options.game) {
      this.attachGame(options.game);
    }
  }

  attachGame(game: RenderoniEngine): void {
    this.game = game;
  }

  async handleRequest(request: { method: string; params?: any }): Promise<any> {
    if (!this.game) {
      throw new Error('No game attached to MCPServer');
    }

    if (request.method === 'tools/list') {
      return {
        tools: Object.values(MCP_TOOLS).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.parameters,
        })),
      };
    }

    if (request.method === 'tools/call') {
      const toolName = request.params?.name;
      const tool = MCP_TOOLS[toolName];
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }
      const result = await tool.execute(this.game, request.params?.arguments);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    throw new Error(`Unsupported MCP method: ${request.method}`);
  }
}

export function createMCPServer(options: MCPServerOptions = {}) {
  return new MCPServer(options);
}
