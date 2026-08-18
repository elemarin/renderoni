/**
 * Renderoni Tiered Observation Engine
 *
 * Generates token-efficient semantic Markdown summaries (<500 bytes / ~120 tokens),
 * delta observations, and targeted spatial queries for AI coding agents.
 */

import RAPIER from '@dimforge/rapier3d-compat';
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
   *
   * Combines Rapier 3D raycast queries with deterministic Slab Ray-AABB intersection fallback.
   */
  static raycast(
    game: RenderoniEngine,
    origin: [number, number, number],
    direction: [number, number, number],
    maxDistance: number = 100
  ): { hit: boolean; point?: [number, number, number]; entityId?: string } {
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(origin[0], origin[1], origin[2]),
      new RAPIER.Vector3(direction[0], direction[1], direction[2])
    );

    let hitEntityId: string | undefined;
    let hitPoint: [number, number, number] | undefined;

    // 1. Try Rapier intersectionsWithRay
    try {
      game.native.world.intersectionsWithRay(ray, maxDistance, true, (collider: any) => {
        const handle = typeof collider === 'number' ? collider : collider?.handle ?? collider?.collider?.handle;
        if (handle !== undefined) {
          const entId = game.physics.getEntityByColliderHandle(handle);
          if (entId) {
            hitEntityId = entId;
            hitPoint = [
              origin[0] + direction[0] * 1.0,
              origin[1] + direction[1] * 1.0,
              origin[2] + direction[2] * 1.0,
            ];
            return false;
          }
        }
        return true;
      });
    } catch (_) {}

    if (hitEntityId) {
      return { hit: true, point: hitPoint, entityId: hitEntityId };
    }

    // 2. Deterministic Ray-AABB Slab intersection against scene entities
    const dx = direction[0] !== 0 ? direction[0] : 0.000001;
    const dy = direction[1] !== 0 ? direction[1] : 0.000001;
    const dz = direction[2] !== 0 ? direction[2] : 0.000001;

    let closestDist = Infinity;
    let bestEntityId: string | undefined;
    let bestPoint: [number, number, number] | undefined;

    for (const ent of game.entities.list()) {
      const p = ent.position;
      const hx = 1.0, hy = 1.0, hz = 1.0;
      const minX = p[0] - hx, maxX = p[0] + hx;
      const minY = p[1] - hy, maxY = p[1] + hy;
      const minZ = p[2] - hz, maxZ = p[2] + hz;

      const t1 = (minX - origin[0]) / dx;
      const t2 = (maxX - origin[0]) / dx;
      const t3 = (minY - origin[1]) / dy;
      const t4 = (maxY - origin[1]) / dy;
      const t5 = (minZ - origin[2]) / dz;
      const t6 = (maxZ - origin[2]) / dz;

      const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
      const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

      if (tmax >= tmin && tmax >= 0 && tmin <= maxDistance) {
        const toi = tmin > 0 ? tmin : tmax;
        if (toi > 0.01 && toi < closestDist) {
          closestDist = toi;
          bestEntityId = ent.id;
          bestPoint = [
            origin[0] + direction[0] * toi,
            origin[1] + direction[1] * toi,
            origin[2] + direction[2] * toi,
          ];
        }
      }
    }

    if (bestEntityId && bestPoint) {
      return { hit: true, point: bestPoint, entityId: bestEntityId };
    }

    return { hit: false };
  }
}
