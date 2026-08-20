/**
 * Renderoni Rapier 3D WASM Integration & Contact Dispatch
 *
 * Manages the Rapier 3D physics simulation world with deterministic contact
 * pair sorting and bulk transform copying to the Canonical Physics Buffer.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import type { DualBufferTransformPipeline } from './transform-buffer.js';
import { compareCodeUnits } from './hashing.js';

export interface PhysicsWorldConfig {
  gravity?: [number, number, number];
  integrationParameters?: {
    dt?: number;
    maxCcdSubsteps?: number;
  };
}

export interface CollisionEvent {
  entityA: string;
  entityB: string;
  started: boolean;
}

export interface SensorEvent {
  sensorEntityId: string;
  targetEntityId: string;
  started: boolean;
}

/** Overlaps that were still active when an entity was unregistered. */
export interface PendingEndEvents {
  collisions: CollisionEvent[];
  sensors: SensorEvent[];
}

/** How much work the last canonical sync did; used to verify sync skipping. */
export interface SyncStats {
  synced: number;
  skipped: number;
}

export class PhysicsEngine {
  private _world: RAPIER.World | null = null;
  private _eventQueue: RAPIER.EventQueue | null = null;
  private isInitialized = false;

  private colliderToEntity: Map<number, string> = new Map();
  private sensorColliders: Set<number> = new Set();
  private bodyToEntity: Map<number, string> = new Map();
  private entityToBody: Map<string, RAPIER.RigidBody> = new Map();
  private activeContacts: Map<string, { event: CollisionEvent; count: number }> = new Map();
  private activeSensorOverlaps: Map<string, { event: SensorEvent; count: number }> = new Map();
  /** Entities whose body was fixed or asleep at its last canonical sync. */
  private restingBodies: Set<string> = new Set();
  private lastSyncStats: SyncStats = { synced: 0, skipped: 0 };
  private readonly scratchVec3: [number, number, number] = [0, 0, 0];
  private readonly scratchQuat: [number, number, number, number] = [0, 0, 0, 1];

  /**
   * Initializes the Rapier WASM runtime and the simulation world.
   *
   * Idempotent: a second call keeps the existing world, because replacing it
   * would orphan every registered body, collider and contact while leaking the
   * previous world's WASM memory.
   */
  async init(config: PhysicsWorldConfig = {}): Promise<void> {
    if (!this.isInitialized) {
      await RAPIER.init();
      this.isInitialized = true;
    }

    if (this._world) return;

    const gravityVec = config.gravity ?? [0, -9.81, 0];
    const gravity = new RAPIER.Vector3(gravityVec[0], gravityVec[1], gravityVec[2]);
    this._world = new RAPIER.World(gravity);
    this._eventQueue = new RAPIER.EventQueue(true);

    if (config.integrationParameters?.dt !== undefined) {
      this._world.integrationParameters.dt = config.integrationParameters.dt;
    }
    if (config.integrationParameters?.maxCcdSubsteps !== undefined) {
      this._world.integrationParameters.maxCcdSubsteps = config.integrationParameters.maxCcdSubsteps;
    }
  }

  get hasWorld(): boolean {
    return this._world !== null;
  }

  get world(): RAPIER.World {
    if (!this._world) {
      throw new Error('PhysicsEngine not initialized. Call await physics.init() first.');
    }
    return this._world;
  }

  get eventQueue(): RAPIER.EventQueue {
    if (!this._eventQueue) {
      throw new Error('PhysicsEngine not initialized. Call await physics.init() first.');
    }
    return this._eventQueue;
  }

  registerEntityBody(entityId: string, body: RAPIER.RigidBody): void {
    this.bodyToEntity.set(body.handle, entityId);
    this.entityToBody.set(entityId, body);
    // A freshly registered body always needs one full canonical sync.
    this.restingBodies.delete(entityId);
  }

  registerEntityCollider(entityId: string, collider: RAPIER.Collider, isSensor = false): void {
    this.colliderToEntity.set(collider.handle, entityId);
    if (isSensor) {
      this.sensorColliders.add(collider.handle);
    }
  }

  /**
   * Drops every mapping for an entity and reports the overlaps that were still
   * active, so callers can synthesize deterministic `contact.end` / `sensor.exit`
   * events. Without them, sensor overlap counters stick forever when a body is
   * destroyed while inside a trigger volume.
   */
  unregisterEntity(entityId: string): PendingEndEvents {
    const collisions: CollisionEvent[] = [];
    for (const [key, contact] of this.activeContacts) {
      if (contact.event.entityA === entityId || contact.event.entityB === entityId) {
        collisions.push({
          entityA: contact.event.entityA,
          entityB: contact.event.entityB,
          started: false,
        });
        this.activeContacts.delete(key);
      }
    }
    collisions.sort((a, b) => {
      const first = compareCodeUnits(a.entityA, b.entityA);
      return first !== 0 ? first : compareCodeUnits(a.entityB, b.entityB);
    });

    const sensors: SensorEvent[] = [];
    for (const [key, overlap] of this.activeSensorOverlaps) {
      if (
        overlap.event.sensorEntityId === entityId ||
        overlap.event.targetEntityId === entityId
      ) {
        sensors.push({
          sensorEntityId: overlap.event.sensorEntityId,
          targetEntityId: overlap.event.targetEntityId,
          started: false,
        });
        this.activeSensorOverlaps.delete(key);
      }
    }
    sensors.sort((a, b) => {
      const first = compareCodeUnits(a.sensorEntityId, b.sensorEntityId);
      return first !== 0 ? first : compareCodeUnits(a.targetEntityId, b.targetEntityId);
    });

    const body = this.entityToBody.get(entityId);
    if (body) {
      this.bodyToEntity.delete(body.handle);
      this.entityToBody.delete(entityId);
    }
    for (const [handle, registeredEntityId] of this.colliderToEntity) {
      if (registeredEntityId === entityId) {
        this.colliderToEntity.delete(handle);
        this.sensorColliders.delete(handle);
      }
    }
    this.restingBodies.delete(entityId);

    return { collisions, sensors };
  }

  getEntityByColliderHandle(handle: number): string | undefined {
    return this.colliderToEntity.get(handle);
  }

  getEntityByBodyHandle(handle: number): string | undefined {
    return this.bodyToEntity.get(handle);
  }

  getBodyByEntity(entityId: string): RAPIER.RigidBody | undefined {
    return this.entityToBody.get(entityId);
  }

  getActiveContacts(): CollisionEvent[] {
    return Array.from(this.activeContacts.values()).map(({ event }) => event).sort((a, b) => {
      const first = compareCodeUnits(a.entityA, b.entityA);
      return first !== 0 ? first : compareCodeUnits(a.entityB, b.entityB);
    });
  }

  /**
   * Sensor overlaps that are currently open, in deterministic order.
   *
   * Tracked separately from {@link PhysicsEngine.getActiveContacts} so the
   * hashed contact set keeps its exact format.
   */
  getActiveSensorOverlaps(): SensorEvent[] {
    return Array.from(this.activeSensorOverlaps.values())
      .map(({ event }) => event)
      .sort((a, b) => {
        const first = compareCodeUnits(a.sensorEntityId, b.sensorEntityId);
        return first !== 0 ? first : compareCodeUnits(a.targetEntityId, b.targetEntityId);
      });
  }

  /** Bodies synced and skipped during the last canonical sync. */
  getSyncStats(): SyncStats {
    return { ...this.lastSyncStats };
  }

  /**
   * Forces the next canonical sync to read this entity's body again.
   *
   * Mandatory part of the native escape hatch: Rapier cannot report that a
   * fixed body was moved with `body.setTranslation()` / `body.setRotation()`,
   * so call this right after a native write to a fixed or sleeping body. Writes
   * made through entity setters, impulses or velocity changes invalidate
   * themselves and never need it.
   */
  markDirty(entityId: string): void {
    this.restingBodies.delete(entityId);
  }

  /** Forces the next canonical sync to read every registered body again. */
  markAllDirty(): void {
    this.restingBodies.clear();
  }

  /**
   * Advances the Rapier physics world by 1 fixed step, drains collision/sensor events,
   * sorts them deterministically by EntityID, and updates the canonical transform buffer.
   *
   * Events are reported as entity-pair transitions: `started` fires when the
   * first collider pair of two entities touches, `!started` when the last one
   * separates. Per-collider overlaps are refcounted internally, which keeps
   * enter/exit dispatch symmetric with the exits synthesized on removal.
   */
  step(
    transformPipeline: DualBufferTransformPipeline,
    onCollision?: (event: CollisionEvent) => void,
    onSensor?: (event: SensorEvent) => void
  ): { collisions: CollisionEvent[]; sensors: SensorEvent[] } {
    const world = this.world;
    const eventQueue = this.eventQueue;

    // Step Rapier WASM
    world.step(eventQueue);

    // 1. Drain & Sort Collision / Sensor Events
    const rawCollisions: CollisionEvent[] = [];
    const rawSensors: SensorEvent[] = [];

    eventQueue.drainCollisionEvents((handle1: number, handle2: number, started: boolean) => {
      const entA = this.colliderToEntity.get(handle1);
      const entB = this.colliderToEntity.get(handle2);
      if (!entA || !entB) return;

      const isSensorA = this.sensorColliders.has(handle1);
      const isSensorB = this.sensorColliders.has(handle2);

      if (isSensorA || isSensorB) {
        const sensorEntityId = isSensorA ? entA : entB;
        const targetEntityId = isSensorA ? entB : entA;
        rawSensors.push({ sensorEntityId, targetEntityId, started });
      } else {
        const [first, second] = compareCodeUnits(entA, entB) < 0 ? [entA, entB] : [entB, entA];
        rawCollisions.push({ entityA: first, entityB: second, started });
      }
    });

    // Deterministic sort collisions
    rawCollisions.sort((a, b) => {
      const cmpA = compareCodeUnits(a.entityA, b.entityA);
      return cmpA !== 0 ? cmpA : compareCodeUnits(a.entityB, b.entityB);
    });

    // Collapse per-collider events into entity-pair transitions. Entities with
    // several colliders would otherwise report one start per collider pair but
    // only one synthesized end, so overlap counters could never return to zero.
    const collisions: CollisionEvent[] = [];
    for (const collision of rawCollisions) {
      const key = `${collision.entityA}\0${collision.entityB}`;
      const active = this.activeContacts.get(key);
      if (collision.started) {
        const count = (active?.count ?? 0) + 1;
        this.activeContacts.set(key, { event: active?.event ?? collision, count });
        if (count === 1) collisions.push(collision);
      } else {
        if (!active) continue;
        if (active.count > 1) {
          active.count--;
        } else {
          this.activeContacts.delete(key);
          collisions.push(collision);
        }
      }
    }

    if (onCollision) {
      for (let i = 0; i < collisions.length; i++) {
        onCollision(collisions[i]);
      }
    }

    // Deterministic sort sensors
    rawSensors.sort((a, b) => {
      const cmpA = compareCodeUnits(a.sensorEntityId, b.sensorEntityId);
      return cmpA !== 0 ? cmpA : compareCodeUnits(a.targetEntityId, b.targetEntityId);
    });

    const sensors: SensorEvent[] = [];
    for (const overlap of rawSensors) {
      const key = `${overlap.sensorEntityId}\0${overlap.targetEntityId}`;
      const active = this.activeSensorOverlaps.get(key);
      if (overlap.started) {
        const count = (active?.count ?? 0) + 1;
        this.activeSensorOverlaps.set(key, { event: active?.event ?? overlap, count });
        if (count === 1) sensors.push(overlap);
      } else {
        if (!active) continue;
        if (active.count > 1) {
          active.count--;
        } else {
          this.activeSensorOverlaps.delete(key);
          sensors.push(overlap);
        }
      }
    }

    if (onSensor) {
      for (let i = 0; i < sensors.length; i++) {
        onSensor(sensors[i]);
      }
    }

    // 2. Bulk copy Rapier rigid body transforms and velocities to the Canonical Physics Buffer
    this.syncCanonicalState(transformPipeline);

    return { collisions, sensors };
  }

  /**
   * Copies authoritative Rapier transforms and velocities into the canonical buffer.
   *
   * Called once right after the world step so post-physics systems read fresh
   * canonical state, and once again after those systems run so impulses,
   * velocity writes and teleports they apply are part of the tick's canonical
   * state (and therefore of the state hash).
   *
   * Fixed and sleeping bodies are read once and then skipped until they move
   * again: Rapier never mutates them while they rest, and the tick where a body
   * falls asleep is still synced in full, so canonical state stays exact while
   * large static scenes stop paying for per-tick WASM reads.
   *
   * Engine setters and any native write that wakes the body (impulses, velocity
   * writes, kinematic moves) resume syncing on their own. Native writes that
   * Rapier cannot report — above all `setTranslation()` on a fixed body — must
   * call {@link PhysicsEngine.markDirty}; {@link PhysicsEngine.verifyRestingBodies}
   * exists so a missed call can never become silent stale state.
   */
  syncCanonicalState(transformPipeline: DualBufferTransformPipeline): void {
    let synced = 0;
    let skipped = 0;

    for (const [entityId, body] of this.entityToBody) {
      const slot = transformPipeline.getSlot(entityId);
      if (slot === undefined) continue;

      if (this.restingBodies.has(entityId)) {
        if (body.isFixed() || body.isSleeping()) {
          skipped++;
          continue;
        }
        this.restingBodies.delete(entityId);
      }

      this.writeCanonicalState(entityId, body, slot, transformPipeline);

      synced++;
      if (body.isFixed() || body.isSleeping()) {
        this.restingBodies.add(entityId);
      }
    }

    this.lastSyncStats = { synced, skipped };
  }

  /**
   * Re-reads every skipped body and repairs canonical rows that drifted.
   *
   * Rapier exposes no change flag for fixed bodies, so a native
   * `body.setTranslation()` without {@link PhysicsEngine.markDirty} would leave
   * the canonical row, state hash and interpolated render transform stale. This
   * pass detects that drift, restores Rapier's authoritative values, and
   * reports the affected entities in deterministic order so callers can surface
   * a diagnostic instead of shipping silent stale state.
   */
  verifyRestingBodies(transformPipeline: DualBufferTransformPipeline): string[] {
    const stale: string[] = [];

    for (const entityId of this.restingBodies) {
      const body = this.entityToBody.get(entityId);
      const slot = transformPipeline.getSlot(entityId);
      if (!body || slot === undefined) continue;

      const trans = body.translation();
      const rot = body.rotation();
      const linvel = body.linvel();
      const angvel = body.angvel();

      transformPipeline.getPosition(slot, this.scratchVec3);
      transformPipeline.getQuaternion(slot, this.scratchQuat);
      const positionMatches =
        this.scratchVec3[0] === Math.fround(trans.x) &&
        this.scratchVec3[1] === Math.fround(trans.y) &&
        this.scratchVec3[2] === Math.fround(trans.z);
      const rotationMatches =
        this.scratchQuat[0] === Math.fround(rot.x) &&
        this.scratchQuat[1] === Math.fround(rot.y) &&
        this.scratchQuat[2] === Math.fround(rot.z) &&
        this.scratchQuat[3] === Math.fround(rot.w);

      transformPipeline.getLinearVelocity(slot, this.scratchVec3);
      const linearMatches =
        this.scratchVec3[0] === Math.fround(linvel.x) &&
        this.scratchVec3[1] === Math.fround(linvel.y) &&
        this.scratchVec3[2] === Math.fround(linvel.z);

      transformPipeline.getAngularVelocity(slot, this.scratchVec3);
      const angularMatches =
        this.scratchVec3[0] === Math.fround(angvel.x) &&
        this.scratchVec3[1] === Math.fround(angvel.y) &&
        this.scratchVec3[2] === Math.fround(angvel.z);

      if (positionMatches && rotationMatches && linearMatches && angularMatches) continue;

      this.writeCanonicalState(entityId, body, slot, transformPipeline);
      stale.push(entityId);
    }

    stale.sort(compareCodeUnits);
    return stale;
  }

  /**
   * Writes the authoritative Rapier state of one body into its canonical row
   * outside the per-tick sync.
   *
   * Entity creation uses this so a body that already carries velocity (for
   * example `RigidBodyDesc.setLinvel()`) is canonical — and therefore hashed —
   * before the first step, with the same non-finite validation the tick sync
   * applies.
   */
  syncEntityCanonicalState(
    entityId: string,
    body: RAPIER.RigidBody,
    slot: number,
    transformPipeline: DualBufferTransformPipeline
  ): void {
    this.writeCanonicalState(entityId, body, slot, transformPipeline);
  }

  private writeCanonicalState(
    entityId: string,
    body: RAPIER.RigidBody,
    slot: number,
    transformPipeline: DualBufferTransformPipeline
  ): void {
    const trans = body.translation();
    const rot = body.rotation();
    const linvel = body.linvel();
    const angvel = body.angvel();

    try {
      transformPipeline.setTransform(slot, trans.x, trans.y, trans.z, rot.x, rot.y, rot.z, rot.w);
      transformPipeline.setVelocity(slot, linvel.x, linvel.y, linvel.z, angvel.x, angvel.y, angvel.z);
    } catch (error) {
      throw new Error(
        `RND_0303: physics produced invalid canonical state for entity "${entityId}". ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  dispose(): void {
    if (this._world) {
      this._world.free();
      this._world = null;
    }
    if (this._eventQueue) {
      this._eventQueue.free();
      this._eventQueue = null;
    }
    this.colliderToEntity.clear();
    this.sensorColliders.clear();
    this.bodyToEntity.clear();
    this.entityToBody.clear();
    this.activeContacts.clear();
    this.activeSensorOverlaps.clear();
    this.restingBodies.clear();
    this.lastSyncStats = { synced: 0, skipped: 0 };
  }
}
