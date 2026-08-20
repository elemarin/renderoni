/**
 * Renderoni Tiered Observation Engine
 *
 * Generates token-efficient semantic Markdown summaries (<=500 bytes / ~120 tokens)
 * and delta observations for AI coding agents.
 */

import type { RenderoniEngine } from './engine.js';

export interface Tier0Observation {
  markdown: string;
  bytes: number;
}

export interface DeltaObservation {
  fromTick: number;
  toTick: number;
  entityPositions: Record<string, [number, number, number]>;
  recentEvents: Array<{ event: string; payload: unknown; tick: number }>;
}

export class ObservationEngine {
  /**
   * Tier 0: High-density Semantic Markdown Topology (<=500 bytes)
   */
  static generateTier0(game: RenderoniEngine): Tier0Observation {
    const tick = game.tick;
    const timeSec = (tick * game.clock.fixedDt).toFixed(2);
    const hash = game.getStateHash();

    const lines: string[] = [
      `# Tick: ${tick} | Time: ${timeSec}s | Mode: ${game.mode} | Hash: ${hash}`,
    ];

    const entities = game.entities.list();
    for (const ent of entities) {
      const pos = ent.position.map((v) => v.toFixed(1)).join(', ');
      const tags = Array.from(ent.tags).join(',');
      const stateSummary = Object.entries(ent.state)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');

      lines.push(`${ent.id}: pos[${pos}] tags[${tags}] ${stateSummary ? `state[${stateSummary}]` : ''}`);
    }

    const recent = game.events.getRecentEvents().slice(-3);
    if (recent.length > 0) {
      const evts = recent.map((e) => `${e.event}(t:${e.tick})`).join(', ');
      lines.push(`RecentEvents: [${evts}]`);
    }

    const markdown = truncateToUtf8Budget(lines.join('\n'), 500);
    const bytes = new TextEncoder().encode(markdown).length;

    return {
      markdown,
      bytes,
    };
  }

  /**
   * Tier 1: Delta Observation since a reference tick
   */
  static generateDelta(game: RenderoniEngine, fromTick: number): DeltaObservation {
    const entityPositions: Record<string, [number, number, number]> = {};
    for (const ent of game.entities.list()) {
      entityPositions[ent.id] = [...ent.position];
    }

    const recentEvents = game.events
      .getRecentEvents()
      .filter((e) => e.tick >= fromTick);

    return {
      fromTick,
      toTick: game.tick,
      entityPositions,
      recentEvents,
    };
  }
}

const textEncoder = new TextEncoder();
const TRUNCATION_MARKER = '\n… [truncated]';

function truncateToUtf8Budget(value: string, budget: number): string {
  if (textEncoder.encode(value).length <= budget) {
    return value;
  }

  const markerBytes = textEncoder.encode(TRUNCATION_MARKER).length;
  const contentBudget = Math.max(0, budget - markerBytes);
  let result = '';
  let bytes = 0;

  for (const character of value) {
    const characterBytes = textEncoder.encode(character).length;
    if (bytes + characterBytes > contentBudget) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }

  return `${result}${TRUNCATION_MARKER}`;
}
