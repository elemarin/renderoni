/**
 * Renderoni Keyframed Replay Engine & Virtual Slot Map
 *
 * Records discrete action streams and periodic savestate keyframes for fast O(1) seeking,
 * with Virtual Slot Map translation across snapshot restores.
 */

import type { RenderoniEngine } from '../core/engine.js';

export interface KeyframeSnapshot {
  tick: number;
  hash: string;
  entityPositions: Record<string, [number, number, number]>;
  entityQuaternions: Record<string, [number, number, number, number]>;
}

export interface ReplayBundle {
  version: number;
  seed: number | string;
  keyframeInterval: number;
  actions: Array<{ tick: number; name: string; payload?: unknown }>;
  keyframes: KeyframeSnapshot[];
}

export class VirtualSlotMap {
  private entityToSlot: Map<string, number> = new Map();
  private slotToEntity: Map<number, string> = new Map();

  register(entityId: string, slot: number): void {
    this.entityToSlot.set(entityId, slot);
    this.slotToEntity.set(slot, entityId);
  }

  getSlot(entityId: string): number | undefined {
    return this.entityToSlot.get(entityId);
  }

  getEntity(slot: number): string | undefined {
    return this.slotToEntity.get(slot);
  }

  clear(): void {
    this.entityToSlot.clear();
    this.slotToEntity.clear();
  }
}

export class ReplayRecorder {
  private keyframeInterval: number;
  private actions: Array<{ tick: number; name: string; payload?: unknown }> = [];
  private keyframes: KeyframeSnapshot[] = [];
  private seed: number | string;

  constructor(seed: number | string = 42, keyframeInterval: number = 600) {
    this.seed = seed;
    this.keyframeInterval = keyframeInterval;
  }

  recordAction(tick: number, name: string, payload?: unknown): void {
    this.actions.push({ tick, name, payload });
  }

  captureKeyframe(game: RenderoniEngine): KeyframeSnapshot {
    const entityPositions: Record<string, [number, number, number]> = {};
    const entityQuaternions: Record<string, [number, number, number, number]> = {};

    for (const ent of game.entities.list()) {
      entityPositions[ent.id] = [...ent.position];
      entityQuaternions[ent.id] = [...ent.quaternion];
    }

    const snapshot: KeyframeSnapshot = {
      tick: game.tick,
      hash: game.getStateHash(),
      entityPositions,
      entityQuaternions,
    };

    this.keyframes.push(snapshot);
    return snapshot;
  }

  exportBundle(): ReplayBundle {
    return {
      version: 1,
      seed: this.seed,
      keyframeInterval: this.keyframeInterval,
      actions: [...this.actions],
      keyframes: [...this.keyframes],
    };
  }
}
