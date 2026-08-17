/**
 * Renderoni Tiered Observation Engine
 *
 * Generates token-efficient semantic Markdown summaries (<500 bytes / ~120 tokens),
 * delta observations, and targeted spatial queries for AI coding agents.
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
   * Tier 0: High-density Semantic Markdown Topology (<500 bytes)
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

    const markdown = lines.join('\n');
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

  /**
   * Tier 2: Targeted Spatial Query (Raycast)
   */
  static raycast(
    game: RenderoniEngine,
    origin: [number, number, number],
    direction: [number, number, number],
    maxDistance: number = 100
  ): { hit: boolean; point?: [number, number, number]; entityId?: string } {
    const ray = {
      origin: { x: origin[0], y: origin[1], z: origin[2] },
      dir: { x: direction[0], y: direction[1], z: direction[2] },
    };

    const hit = game.native.world.castRay(
      ray as any,
      maxDistance,
      true
    );

    if (hit) {
      const entityId = game.physics.getEntityByColliderHandle(hit.collider.handle);
      const point: [number, number, number] = [
        origin[0] + direction[0] * hit.timeOfImpact,
        origin[1] + direction[1] * hit.timeOfImpact,
        origin[2] + direction[2] * hit.timeOfImpact,
      ];
      return { hit: true, point, entityId };
    }

    return { hit: false };
  }
}
