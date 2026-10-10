/**
 * Renderoni Tiered Observation Engine
 *
 * Generates token-efficient semantic Markdown summaries (<=500 bytes / ~120 tokens)
 * and delta observations for AI coding agents.
 */

import type { RenderoniEngine } from './engine.js';
import type { WorldProvider } from './worlds.js';

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

/** UTF-8 byte budget of a Tier 0 observation. */
export const TIER0_BUDGET_BYTES = 500;

export class ObservationEngine {
  /**
   * Tier 0: High-density Semantic Markdown Topology (<=500 bytes)
   *
   * World providers with `observe()` are appended after the entity section
   * (entity lines plus the RecentEvents line), each under a `## <name>`
   * heading, in name order. The budget left after the header line is shared:
   *
   * 1. Entities reserve what they need, up to half of it.
   * 2. The rest is split evenly between providers; each is called with its
   *    share (heading included) and truncated to it.
   * 3. Whatever providers leave unused goes back to the entity section.
   *
   * So neither side can starve the other: entities always keep up to half the
   * budget and every provider keeps at least an equal slice of the other half.
   * Without providers the output is unchanged.
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

    const providers = game.worlds.list().filter((provider) => typeof provider.observe === 'function');
    const markdown =
      providers.length === 0
        ? truncateToUtf8Budget(lines.join('\n'), TIER0_BUDGET_BYTES)
        : composeWithProviders(lines[0], lines.slice(1), providers);
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

function utf8Length(value: string): number {
  return textEncoder.encode(value).length;
}

/**
 * Lays out the Tier 0 header, entity section and provider sections within
 * {@link TIER0_BUDGET_BYTES}. Every section after the header is budgeted
 * including the newline that separates it from the previous one.
 */
function composeWithProviders(
  header: string,
  entityLines: string[],
  providers: WorldProvider[]
): string {
  const remaining = Math.max(0, TIER0_BUDGET_BYTES - utf8Length(header));
  const entityText = entityLines.length > 0 ? `\n${entityLines.join('\n')}` : '';
  const entityReserve = Math.min(utf8Length(entityText), Math.floor(remaining / 2));
  const share = Math.floor((remaining - entityReserve) / providers.length);

  let providerText = '';
  for (const provider of providers) {
    const heading = `\n## ${provider.name}`;
    const bodyBudget = Math.max(0, share - utf8Length(heading));
    const body = provider.observe!(bodyBudget)
      .map((line) => `\n${line}`)
      .join('');
    const section = `${heading}${body}`;
    if (utf8Length(section) <= share) {
      providerText += section;
    } else if (share > utf8Length(TRUNCATION_MARKER)) {
      providerText += truncateToUtf8Budget(section, share);
    }
    // A share too small to hold even the truncation marker shows nothing.
  }

  const entityBudget = remaining - utf8Length(providerText);
  const entitySection =
    utf8Length(entityText) <= entityBudget ? entityText : truncateToUtf8Budget(entityText, entityBudget);

  return truncateToUtf8Budget(`${header}${entitySection}${providerText}`, TIER0_BUDGET_BYTES);
}

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
