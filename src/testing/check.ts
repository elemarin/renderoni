/**
 * Renderoni Machine AST Assertion Engine
 *
 * Evaluates machine-readable assertions for AI agents, JSON-RPC, and headless CI.
 */

import type { RenderoniEngine } from '../core/engine.js';

export interface AssertionOp {
  op: 'greaterThan' | 'lessThan' | 'equals' | 'isWithinDistance' | 'hasState' | 'noDiagnostics' | 'hasTick' | 'toEmitEvent' | string;
  path?: string;
  value?: unknown;
  entityA?: string;
  entityB?: string;
  maxDistance?: number;
  entityId?: string;
  state?: Record<string, unknown>;
  event?: string;
  payload?: unknown;
  minimumSeverity?: 'info' | 'warning' | 'error';
}

export interface CheckResult {
  passed: boolean;
  failures: string[];
}

export const ASSERTION_OPS = [
  'greaterThan',
  'lessThan',
  'equals',
  'isWithinDistance',
  'hasState',
  'noDiagnostics',
  'hasTick',
  'toEmitEvent',
] as const;

export function isAssertionOp(value: unknown): value is AssertionOp['op'] {
  return typeof value === 'string' && (ASSERTION_OPS as readonly string[]).includes(value);
}

export function evaluateCheck(game: RenderoniEngine, assertions: AssertionOp[]): CheckResult {
  const failures: string[] = [];

  for (const ast of assertions) {
    if (!ast || typeof ast !== 'object') {
      failures.push('Invalid assertion: expected an object');
      continue;
    }

    switch (ast.op) {
      case 'hasTick': {
        if (game.tick !== (ast.value as number)) {
          failures.push(`hasTick failed: expected ${ast.value}, got ${game.tick}`);
        }
        break;
      }
      case 'greaterThan': {
        const val = resolvePath(game, ast.path!);
        if (typeof val !== 'number' || val <= (ast.value as number)) {
          failures.push(`greaterThan failed for ${ast.path}: expected > ${ast.value}, got ${val}`);
        }
        break;
      }
      case 'lessThan': {
        const val = resolvePath(game, ast.path!);
        if (typeof val !== 'number' || val >= (ast.value as number)) {
          failures.push(`lessThan failed for ${ast.path}: expected < ${ast.value}, got ${val}`);
        }
        break;
      }
      case 'equals': {
        const val = resolvePath(game, ast.path!);
        if (val !== ast.value) {
          failures.push(`equals failed for ${ast.path}: expected ${ast.value}, got ${val}`);
        }
        break;
      }
      case 'isWithinDistance': {
        const entA = game.entities.has(ast.entityA!) ? game.entities.get(ast.entityA!) : null;
        const entB = game.entities.has(ast.entityB!) ? game.entities.get(ast.entityB!) : null;
        if (!entA || !entB) {
          failures.push(`isWithinDistance failed: entity ${ast.entityA} or ${ast.entityB} not found`);
        } else {
          const dist = Math.hypot(
            entA.position[0] - entB.position[0],
            entA.position[1] - entB.position[1],
            entA.position[2] - entB.position[2]
          );
          if (dist > (ast.maxDistance as number)) {
            failures.push(`isWithinDistance failed: distance ${dist.toFixed(2)} > max ${ast.maxDistance}`);
          }
        }
        break;
      }
      case 'hasState': {
        const ent = game.entities.has(ast.entityId!) ? game.entities.get(ast.entityId!) : null;
        if (!ent) {
          failures.push(`hasState failed: entity ${ast.entityId} not found`);
        } else if (ast.state) {
          for (const [k, expected] of Object.entries(ast.state)) {
            const actual = (ent.state as any)[k];
            if (actual !== expected) {
              failures.push(`hasState failed for ${k}: expected ${expected}, got ${actual}`);
            }
          }
        }
        break;
      }
      case 'toEmitEvent': {
        const events = game.events.getRecentEvents(ast.event);
        if (events.length === 0) {
          failures.push(`toEmitEvent failed: event '${ast.event}' was not emitted`);
        }
        break;
      }
      case 'noDiagnostics': {
        const minSev = ast.minimumSeverity ?? 'error';
        const errors = game.diagnostics.getRecords(minSev);
        if (errors.length > 0) {
          failures.push(`noDiagnostics failed: ${errors.length} diagnostic records with severity >= ${minSev}`);
        }
        break;
      }
      default:
        failures.push(`Unsupported assertion op: ${String(ast.op)}`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function resolvePath(game: RenderoniEngine, path: string): unknown {
  const parts = path.split('.');
  if (parts[0] === 'entities') {
    if (!game.entities.has(parts[1])) return undefined;
    const ent = game.entities.get(parts[1]);
    if (!ent) return undefined;
    if (parts[2] === 'position') {
      if (parts[3] === 'x') return ent.position[0];
      if (parts[3] === 'y') return ent.position[1];
      if (parts[3] === 'z') return ent.position[2];
      return ent.position;
    }
    if (parts[2] === 'state') {
      return (ent.state as any)[parts[3]];
    }
  }
  return undefined;
}
