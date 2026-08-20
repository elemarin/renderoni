/**
 * Renderoni Rapier 3D WASM Integration & Contact Dispatch
 *
 * Manages the Rapier 3D physics simulation world with deterministic contact
 * pair sorting and bulk transform copying to the Canonical Physics Buffer.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import type { DualBufferTransformPipeline } from './transform-buffer.js';

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

export class PhysicsEngine {
  private _world: RAPIER.World | null = null;
  private _eventQueue: RAPIER.EventQueue | null = null;
  private isInitialized = false;

  private colliderToEntity: Map<number, string> = new Map();
  private sensorColliders: Set<number> = new Set();
  private bodyToEntity: Map<number, string> = new Map();
  private entityToBody: Map<string, RAPIER.RigidBody> = new Map();
  private activeContacts: Map<string, CollisionEvent> = new Map();

  async init(config: PhysicsWorldConfig = {}): Promise<void> {
    if (!this.isInitialized) {
      await RAPIER.init();
      this.isInitialized = true;
    }

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
  }

  registerEntityCollider(entityId: string, collider: RAPIER.Collider, isSensor = false): void {
    this.colliderToEntity.set(collider.handle, entityId);
    if (isSensor) {
      this.sensorColliders.add(collider.handle);
    }
  }

  unregisterEntity(entityId: string): void {
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
    return Array.from(this.activeContacts.values()).sort((a, b) => {
      const first = a.entityA.localeCompare(b.entityA);
      return first !== 0 ? first : a.entityB.localeCompare(b.entityB);
    });
  }

  /**
   * Advances the Rapier physics world by 1 fixed step, drains collision/sensor events,
   * sorts them deterministically by EntityID, and updates the canonical transform buffer.
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
        const [first, second] = entA.localeCompare(entB) < 0 ? [entA, entB] : [entB, entA];
        rawCollisions.push({ entityA: first, entityB: second, started });
      }
    });

    // Deterministic sort collisions
    rawCollisions.sort((a, b) => {
      const cmpA = a.entityA.localeCompare(b.entityA);
      return cmpA !== 0 ? cmpA : a.entityB.localeCompare(b.entityB);
    });
    for (const collision of rawCollisions) {
      const key = `${collision.entityA}\0${collision.entityB}`;
      if (collision.started) {
        this.activeContacts.set(key, collision);
      } else {
        this.activeContacts.delete(key);
      }
    }

    if (onCollision) {
      for (let i = 0; i < rawCollisions.length; i++) {
        onCollision(rawCollisions[i]);
      }
    }

    // Deterministic sort sensors
    rawSensors.sort((a, b) => {
      const cmpA = a.sensorEntityId.localeCompare(b.sensorEntityId);
      return cmpA !== 0 ? cmpA : a.targetEntityId.localeCompare(b.targetEntityId);
    });

    if (onSensor) {
      for (let i = 0; i < rawSensors.length; i++) {
        onSensor(rawSensors[i]);
      }
    }

    // 2. Bulk copy Rapier rigid body transforms to Canonical Physics Buffer
    for (const [entityId, body] of this.entityToBody) {
      const slot = transformPipeline.getSlot(entityId);
      if (slot !== undefined) {
        const trans = body.translation();
        const rot = body.rotation();
        transformPipeline.setTransform(slot, trans.x, trans.y, trans.z, rot.x, rot.y, rot.z, rot.w);
      }
    }

    return { collisions: rawCollisions, sensors: rawSensors };
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
  }
}
