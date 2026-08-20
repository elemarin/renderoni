/**
 * Renderoni Model Context Protocol (MCP) Server (renderoni/mcp)
 *
 * Implements JSON-RPC and MCP tools (describe, observe, act, step, check)
 * for autonomous AI coding agents.
 */

import * as readline from 'node:readline';
import { Value } from '@sinclair/typebox/value';
import type { RenderoniEngine } from '../core/engine.js';
import { ObservationEngine } from '../core/observations.js';
import { evaluateCheck, isAssertionOp, type AssertionOp } from '../testing/check.js';
import { RENDERONI_VERSION } from '../version.js';

export const MCP_PROTOCOL_VERSIONS = [
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
  '2025-11-25',
] as const;

export const MAX_MCP_STEP_TICKS = 10_000;

export const MCP_SERVER_INFO = {
  name: 'renderoni',
  title: 'Renderoni',
  version: RENDERONI_VERSION,
  description: 'Headless deterministic 3D game engine MCP server',
} as const;

export const MCP_INSTRUCTIONS =
  `Inspect and drive a headless Renderoni simulation over stdio. describe reports configuration, entities, and registered actions; observe supports tiers 0 and 1; act dispatches registered gameplay actions; step advances 1–${MAX_MCP_STEP_TICKS} whole ticks; check evaluates supported assertions. The world starts empty until entities are spawned by game code.`;

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (game: RenderoniEngine, args: any) => Promise<unknown> | unknown;
}

interface JsonSchemaProperty {
  type?: string;
  description?: string;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateArguments(tool: MCPToolDefinition, args: unknown): string | undefined {
  if (!isObject(args)) {
    return `${tool.name} arguments must be an object`;
  }

  for (const [key, raw] of Object.entries(tool.parameters)) {
    const spec = raw as JsonSchemaProperty;
    const value = args[key];
    if (value === undefined) {
      if (spec.required) {
        return `${tool.name} requires "${key}"`;
      }
      continue;
    }

    if (spec.type === 'array') {
      if (!Array.isArray(value)) {
        return `${tool.name}.${key} must be an array`;
      }
      if (spec.items?.type === 'object' && value.some((item) => !isObject(item))) {
        return `${tool.name}.${key} must contain objects`;
      }
    } else if (spec.type === 'object') {
      if (!isObject(value)) {
        return `${tool.name}.${key} must be an object`;
      }
    } else if (spec.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${tool.name}.${key} must be a finite number`;
      }
    } else if (spec.type !== undefined && typeof value !== spec.type) {
      return `${tool.name}.${key} must be a ${spec.type}`;
    }
  }

  return undefined;
}

function isJsonValue(value: unknown, seen: Set<object> = new Set()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || seen.has(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }

  seen.add(value);
  const values = Array.isArray(value)
    ? Array.from({ length: value.length }, (_, index) => value[index])
    : Object.values(value);
  const valid = values.every((item) => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function validateActionPayload(
  game: RenderoniEngine,
  args: { name: string; payload?: unknown }
): string | undefined {
  const action = game.actions.get(args.name);
  if (!action) {
    return `Unknown action: ${args.name}`;
  }

  if (Object.hasOwn(args, 'payload') && !isJsonValue(args.payload)) {
    return 'act.payload must be a JSON value';
  }

  if (action.schema !== undefined) {
    try {
      let matches: boolean;
      try {
        matches = Value.Check(action.schema as any, args.payload);
      } catch {
        matches = checkJsonSchema(action.schema, args.payload);
      }
      if (!matches) {
        return `act.payload does not match the schema for action "${args.name}"`;
      }
    } catch {
      return `Action "${args.name}" has an invalid schema`;
    }
  }

  return undefined;
}

function checkJsonSchema(schema: unknown, value: unknown): boolean {
  if (schema === true) return true;
  if (schema === false) return false;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Schema must be an object or boolean');
  }

  const record = schema as Record<string, unknown>;
  if ('const' in record && !Object.is(value, record.const)) return false;
  if (Array.isArray(record.enum) && !record.enum.some((item) => Object.is(item, value))) return false;

  if (Array.isArray(record.allOf) && !record.allOf.every((item) => checkJsonSchema(item, value))) return false;
  if (Array.isArray(record.anyOf) && !record.anyOf.some((item) => checkJsonSchema(item, value))) return false;
  if (Array.isArray(record.oneOf)) {
    const matches = record.oneOf.filter((item) => checkJsonSchema(item, value)).length;
    if (matches !== 1) return false;
  }

  const types = Array.isArray(record.type) ? record.type : record.type ? [record.type] : [];
  if (types.length > 0 && !types.some((type) => matchesJsonType(type, value))) return false;

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const required = Array.isArray(record.required) ? record.required : [];
    if (!required.every((key) => typeof key === 'string' && Object.hasOwn(object, key))) return false;

    const properties =
      record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)
        ? record.properties as Record<string, unknown>
        : {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(object, key) && !checkJsonSchema(propertySchema, object[key])) return false;
    }
    if (record.additionalProperties === false) {
      if (Object.keys(object).some((key) => !Object.hasOwn(properties, key))) return false;
    } else if (record.additionalProperties && typeof record.additionalProperties === 'object') {
      for (const [key, propertyValue] of Object.entries(object)) {
        if (!Object.hasOwn(properties, key) && !checkJsonSchema(record.additionalProperties, propertyValue)) {
          return false;
        }
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof record.minItems === 'number' && value.length < record.minItems) return false;
    if (typeof record.maxItems === 'number' && value.length > record.maxItems) return false;
    if (record.items !== undefined && !value.every((item) => checkJsonSchema(record.items, item))) return false;
  }

  if (typeof value === 'string') {
    if (typeof record.minLength === 'number' && value.length < record.minLength) return false;
    if (typeof record.maxLength === 'number' && value.length > record.maxLength) return false;
    if (typeof record.pattern === 'string' && !new RegExp(record.pattern).test(value)) return false;
  }

  if (typeof value === 'number') {
    if (typeof record.minimum === 'number' && value < record.minimum) return false;
    if (typeof record.maximum === 'number' && value > record.maximum) return false;
    if (typeof record.exclusiveMinimum === 'number' && value <= record.exclusiveMinimum) return false;
    if (typeof record.exclusiveMaximum === 'number' && value >= record.exclusiveMaximum) return false;
  }

  return true;
}

function matchesJsonType(type: unknown, value: unknown): boolean {
  switch (type) {
    case 'null': return value === null;
    case 'boolean': return typeof value === 'boolean';
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isSafeInteger(value);
    case 'string': return typeof value === 'string';
    default: throw new Error(`Unsupported JSON Schema type: ${String(type)}`);
  }
}

function toolError(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

export const MCP_TOOLS: Record<string, MCPToolDefinition> = {
  describe: {
    name: 'describe',
    description: 'Inspect engine configuration, active entities, and registered actions',
    parameters: {},
    execute: (game: RenderoniEngine) => {
      return {
        tick: game.tick,
        mode: game.mode,
        seed: game.seed,
        tickRateHz: game.tickRateHz,
        actions: game.actions.list(),
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
    description: 'Get a token-efficient semantic observation (Tier 0 Markdown or Tier 1 delta)',
    parameters: {
      tier: { type: 'number', default: 0 },
      fromTick: { type: 'number' },
    },
    execute: (game: RenderoniEngine, args: { tier?: number; fromTick?: number }) => {
      const tier = args?.tier ?? 0;
      if (!Number.isInteger(tier) || (tier !== 0 && tier !== 1)) {
        throw new Error('observe.tier must be 0 or 1; Tier 2 is not available');
      }
      if (
        args?.fromTick !== undefined &&
        (!Number.isSafeInteger(args.fromTick) || args.fromTick < 0)
      ) {
        throw new Error('observe.fromTick must be a non-negative safe integer');
      }
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
      payload: { description: 'Optional JSON payload validated against the registered action schema.' },
    },
    execute: (game: RenderoniEngine, args: { name: string; payload?: unknown }) => {
      const payloadError = validateActionPayload(game, args);
      if (payloadError) {
        throw new Error(payloadError);
      }
      game.act({ name: args.name, payload: args.payload });
      return { dispatched: true, action: args.name };
    },
  },

  step: {
    name: 'step',
    description: `Advance simulation by 1–${MAX_MCP_STEP_TICKS} fixed ticks`,
    parameters: {
      ticks: { type: 'number', default: 1 },
    },
    execute: (game: RenderoniEngine, args: { ticks?: number }) => {
      const ticksToRun = args?.ticks ?? 1;
      if (
        !Number.isSafeInteger(ticksToRun) ||
        ticksToRun < 1 ||
        ticksToRun > MAX_MCP_STEP_TICKS
      ) {
        throw new Error(
          `step.ticks must be a positive safe integer no greater than ${MAX_MCP_STEP_TICKS}`
        );
      }
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
      if (args.assertions.some((assertion) => !isAssertionOp(assertion.op))) {
        throw new Error('check.assertions contains an unsupported assertion op');
      }
      return evaluateCheck(game, args.assertions);
    },
  },
};

export interface MCPServerOptions {
  game?: RenderoniEngine;
  createGame?: () => Promise<RenderoniEngine> | RenderoniEngine;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

type JsonRpcError = {
  jsonrpc: '2.0';
  id: null;
  error: { code: -32700 | -32600; message: 'Parse error' | 'Invalid Request' };
};

export type JsonRpcParseResult =
  | { request: JsonRpcRequest; error?: never }
  | { request?: never; error: JsonRpcError };

export function parseJsonRpcRequest(line: string): JsonRpcParseResult {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return {
      error: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    };
  }

  if (
    !isObject(value) ||
    value.jsonrpc !== '2.0' ||
    typeof value.method !== 'string' ||
    value.method.length === 0 ||
    (Object.hasOwn(value, 'id') &&
      value.id !== null &&
      typeof value.id !== 'string' &&
      typeof value.id !== 'number') ||
    (Object.hasOwn(value, 'params') &&
      value.params !== undefined &&
      !isObject(value.params) &&
      !Array.isArray(value.params))
  ) {
    return {
      error: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } },
    };
  }

  const request: JsonRpcRequest = { jsonrpc: '2.0', method: value.method as string };
  if (Object.hasOwn(value, 'id')) {
    request.id = value.id as string | number | null;
  }
  if (Object.hasOwn(value, 'params')) {
    request.params = value.params;
  }
  return { request };
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

  async handleRequest(request: Pick<JsonRpcRequest, 'method' | 'params'>): Promise<any> {
    const method = request.method;

    if (method === 'initialize') {
      const requested =
        isObject(request.params) && typeof request.params.protocolVersion === 'string'
          ? request.params.protocolVersion
          : undefined;
      const protocolVersion =
        requested && (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : MCP_PROTOCOL_VERSIONS[MCP_PROTOCOL_VERSIONS.length - 1];

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
      if (!isObject(request.params)) {
        return toolError('tools/call requires params with a tool name');
      }
      const toolName = request.params.name;
      if (typeof toolName !== 'string' || toolName.length === 0) {
        return toolError('tools/call requires a non-empty string tool name');
      }
      const tool = MCP_TOOLS[toolName];
      if (!tool) {
        return toolError(`Tool not found: ${toolName}`);
      }
      const args = request.params.arguments === undefined ? {} : request.params.arguments;
      const argumentError = validateArguments(tool, args);
      if (argumentError) {
        return toolError(argumentError);
      }
      try {
        const game = await this.ensureGame();
        const result = await tool.execute(game, args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return toolError((err as Error).message);
      }
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

      const parsed = parseJsonRpcRequest(line);
      if (parsed.error) {
        writeJsonRpc(process.stdout, parsed.error);
        return;
      }
      const request = parsed.request;

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
