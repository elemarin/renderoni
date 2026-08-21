/**
 * Renderoni Unified Engine Core
 *
 * Orchestrates the deterministic kernel, lifecycle, entity management,
 * preset instantiation, and presentation loop.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SimulationClock, type SimulationClockOptions } from './clock.js';
import { PRNG } from './prng.js';
import { StructuralCommandQueue } from './commands.js';
import { DualBufferTransformPipeline } from './transform-buffer.js';
import { PhysicsEngine, type CollisionEvent, type SensorEvent } from './physics.js';
import { StateHasher } from './hashing.js';
import { ResourceOwnershipTracker } from './ownership.js';
import { DiagnosticLogger } from './diagnostics.js';
import { InputManager } from '../input/input-manager.js';
import { ActionRegistry } from '../input/actions.js';
import {
  type EntityConfig,
  type EntityContext,
  type EntityInstance,
  type NativeBindingConfig,
  type PresetInstance,
} from '../presets/define-preset.js';
import { evaluateCheck, type AssertionOp, type CheckResult } from '../testing/check.js';
import { GameLoop, type GameLoopOptions } from './loop.js';

/** Body handles an entity config owns, from the body instance or a bare handle. */
function collectBodyHandles(rapier: NonNullable<NativeBindingConfig['rapier']>): number[] {
  if (rapier.body) return [rapier.body.handle];
  return rapier.bodyHandle !== undefined ? [rapier.bodyHandle] : [];
}

/**
 * Collider handles an entity config owns.
 *
 * Read from the actual colliders as well as any bare handles, so
 * collider-only entities (colliders attached to a foreign body, or standalone
 * trigger volumes) are tracked and freed like every other resource.
 */
function collectColliderHandles(rapier: NonNullable<NativeBindingConfig['rapier']>): number[] {
  const handles = new Set<number>();
  for (const collider of rapier.colliders ?? []) handles.add(collider.handle);
  for (const handle of rapier.colliderHandles ?? []) handles.add(handle);
  return Array.from(handles);
}

/** How often skipped bodies are audited for native moves Rapier cannot report. */
const CANONICAL_AUDIT_INTERVAL_TICKS = 60;

export type EngineMode = 'interactive' | 'headless';

export interface RenderoniConfig {
  mode?: EngineMode;
  seed?: number | string;
  canvas?: HTMLCanvasElement;
  clock?: SimulationClockOptions;
  gravity?: [number, number, number];
  subsystems?: Array<(engine: RenderoniEngine) => void>;
  /** Opt-in play / win / lose / restart match loop. */
  loop?: boolean | GameLoopOptions;
}

export class EventEmitter {
  private listeners: Map<string, Set<(payload: any) => void>> = new Map();
  private eventBuffer: Array<{ event: string; payload: unknown; tick: number }> = [];

  on(event: string, callback: (payload: any) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
    return () => set!.delete(callback);
  }

  emit(event: string, payload: unknown, tick: number = 0): void {
    this.eventBuffer.push({ event, payload, tick });
    if (this.eventBuffer.length > 2048) {
      this.eventBuffer.shift();
    }

    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        cb(payload);
      }
    }
  }

  /**
   * Emits without letting one failing listener hide the event from the rest.
   *
   * Used for teardown events, where a throwing listener must neither skip the
   * other listeners nor abort the cleanup that follows. Returns the errors that
   * listeners threw so the caller can report them.
   */
  emitCollecting(event: string, payload: unknown, tick: number = 0): unknown[] {
    this.eventBuffer.push({ event, payload, tick });
    if (this.eventBuffer.length > 2048) {
      this.eventBuffer.shift();
    }

    const errors: unknown[] = [];
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(payload);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    return errors;
  }

  getRecentEvents(eventName?: string): Array<{ event: string; payload: unknown; tick: number }> {
    if (eventName) {
      return this.eventBuffer.filter((e) => e.event === eventName);
    }
    return [...this.eventBuffer];
  }

  clear(): void {
    this.eventBuffer = [];
    this.listeners.clear();
  }
}

export class SystemManager {
  private prePhysics: Array<(ctx: { dt: number; tick: number; events: EventEmitter }) => void> = [];
  private postPhysics: Array<(ctx: { dt: number; tick: number; events: EventEmitter }) => void> = [];

  add(system: {
    phase?: 'prePhysics' | 'postPhysics';
    update: (ctx: { dt: number; tick: number; events: EventEmitter }) => void;
  }): () => void {
    const collection = system.phase === 'prePhysics' ? this.prePhysics : this.postPhysics;
    collection.push(system.update);
    return () => {
      const index = collection.indexOf(system.update);
      if (index >= 0) collection.splice(index, 1);
    };
  }

  runPre(ctx: { dt: number; tick: number; events: EventEmitter }): void {
    for (const sys of this.prePhysics) sys(ctx);
  }

  runPost(ctx: { dt: number; tick: number; events: EventEmitter }): void {
    for (const sys of this.postPhysics) sys(ctx);
  }

  clear(): void {
    this.prePhysics = [];
    this.postPhysics = [];
  }
}

export class RenderoniEngine {
  readonly mode: EngineMode;
  readonly seed: number | string;

  // L0 Deterministic Kernel Components
  readonly clock: SimulationClock;
  readonly prng: PRNG;
  readonly commands: StructuralCommandQueue;
  readonly transformPipeline: DualBufferTransformPipeline;
  readonly physics: PhysicsEngine;
  readonly hasher: StateHasher;
  readonly ownership: ResourceOwnershipTracker;
  readonly diagnostics: DiagnosticLogger;

  // Unified Subsystems & Input
  readonly events: EventEmitter;
  readonly systems: SystemManager;
  readonly input: InputManager;
  readonly actions: ActionRegistry;
  readonly loop: GameLoop;

  // Native 3D Presentation Objects
  readonly native: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer | null;
    get world(): RAPIER.World;
  };

  private entitiesMap: Map<string, EntityInstance> = new Map();
  private readonly initialConfig: RenderoniConfig;
  private nextEntityId: number = 1;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private initPromise: Promise<void> | null = null;
  private isDisposed: boolean = false;
  /** Ids claimed by an in-flight add() call, before the instance is registered. */
  private pendingEntityIds: Set<string> = new Set();
  private removingEntityIds: Set<string> = new Set();
  private discardedResourceCount: number = 0;
  private ticksSinceCanonicalAudit: number = 0;

  constructor(config: RenderoniConfig = {}) {
    this.initialConfig = config;
    this.mode = config.mode ?? 'headless';
    this.seed = config.seed ?? 42;
    this.physics = new PhysicsEngine();

    this.clock = new SimulationClock(config.clock);
    this.prng = new PRNG(this.seed);
    this.commands = new StructuralCommandQueue();
    this.transformPipeline = new DualBufferTransformPipeline(1024);
    this.hasher = new StateHasher();
    this.ownership = new ResourceOwnershipTracker();
    this.diagnostics = new DiagnosticLogger();

    this.events = new EventEmitter();
    this.systems = new SystemManager();
    this.input = new InputManager();
    this.actions = new ActionRegistry();
    this.loop = new GameLoop(config.loop);

    if (this.loop.enabled) {
      this.actions.register({ name: 'loop.start', handle: () => this.loop.start() });
      this.actions.register({ name: 'loop.restart', handle: () => this.loop.restart() });
      this.actions.register({
        name: 'loop.win',
        handle: (reason?: string) => this.loop.win(typeof reason === 'string' ? reason : 'You win'),
      });
      this.actions.register({
        name: 'loop.lose',
        handle: (reason?: string) => this.loop.lose(typeof reason === 'string' ? reason : 'You lose'),
      });
    }

    // 3D Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer | null = null;
    if (this.mode === 'interactive' && config.canvas) {
      renderer = new THREE.WebGLRenderer({ canvas: config.canvas, antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
    }

    const physicsRef = this.physics;
    this.native = {
      scene,
      camera,
      renderer,
      get world() {
        return physicsRef.world;
      },
    };
  }

  /**
   * Initializes physics, hashing and the configured subsystems exactly once.
   *
   * Calling `init()` again is a no-op that returns the original promise:
   * building a second Rapier world would orphan every body already created and
   * leak the previous world, and rerunning subsystems would duplicate their
   * entities, systems and listeners.
   */
  async init(config: RenderoniConfig = this.initialConfig): Promise<void> {
    this.assertUsable('init()');

    if (this.initPromise) {
      this.diagnostics.emit('RND_0402', 'init() called on an already initialized engine; ignored.', {
        severity: 'info',
        tick: this.clock.tick,
        remediation:
          'Call createRenderoni() (or init()) once per engine. Re-initializing would replace the physics world and rerun subsystems.',
      });
      return this.initPromise;
    }

    const resolvedConfig = { ...this.initialConfig, ...config };
    this.initPromise = this.runInit(resolvedConfig).catch((error: unknown) => {
      // A failed init must stay retryable instead of locking the engine out.
      this.initPromise = null;
      throw error;
    });

    return this.initPromise;
  }

  private async runInit(resolvedConfig: RenderoniConfig): Promise<void> {
    await Promise.all([
      this.physics.init({
        gravity: resolvedConfig.gravity,
        integrationParameters: { dt: this.clock.fixedDt },
      }),
      this.hasher.init(),
    ]);

    if (resolvedConfig.subsystems) {
      for (const sub of resolvedConfig.subsystems) {
        sub(this);
      }
    }
  }

  /** True once dispose() has run; disposed engines reject further simulation. */
  get disposed(): boolean {
    return this.isDisposed;
  }

  private assertUsable(operation: string): void {
    if (this.isDisposed) {
      const message =
        `RND_0405: ${operation} called on a disposed engine. ` +
        'Create a new engine with createRenderoni() instead of reusing a disposed one.';
      this.diagnostics.emit('RND_0405', message, {
        severity: 'error',
        tick: this.clock.tick,
        remediation: 'Create a new engine with createRenderoni().',
      });
      throw new Error(message);
    }
  }

  get tick(): number {
    return this.clock.tick;
  }

  get tickRateHz(): number {
    return this.clock.tickRateHz;
  }

  get entities() {
    return {
      get: (id: string) => this.entitiesMap.get(id),
      has: (id: string) => this.entitiesMap.has(id),
      list: () => Array.from(this.entitiesMap.values()),
    };
  }

  /**
   * Adds an entity created via definePreset.
   *
   * The final entity id is validated before any resource is registered or the
   * object is inserted into the scene, so a duplicate id can never silently
   * replace a live entity or leak the bodies, colliders and GPU resources the
   * rejected factory already created.
   */
  add<T extends EntityInstance = EntityInstance>(
    factoryOrEntity: PresetInstance<any> | EntityConfig | ((ctx: EntityContext) => EntityInstance)
  ): T {
    this.assertUsable('add()');

    let inst: EntityInstance;
    let registeredId: string | undefined;
    const created: Array<{ id: string; object?: THREE.Object3D }> = [];
    const generateId = () => {
      let id: string;
      do {
        id = `entity_${this.nextEntityId++}`;
      } while (this.isEntityIdTaken(id));
      return id;
    };
    const requestedId = (factoryOrEntity as any).options?.id ?? (factoryOrEntity as any).id;
    if (requestedId !== undefined && this.isEntityIdTaken(requestedId)) {
      throw this.duplicateEntityIdError(requestedId);
    }

    const ctx: EntityContext = {
      id: requestedId ?? generateId(),
      native: {
        world: this.native.world,
        threeScene: this.native.scene,
      },
      events: {
        emit: (evt: string, payload?: unknown) => this.events.emit(evt, payload, this.clock.tick),
        on: (evt: string, handler: (payload: any) => void) => this.events.on(evt, handler),
      },
      prng: this.prng.fork((factoryOrEntity as any).presetName ?? 'entity'),
      entity: (cfg: EntityConfig) => {
        const entId = cfg.id ?? ctx.id;
        const physics = this.physics;
        let slot: number | undefined;

        if (this.isEntityIdTaken(entId)) {
          // Release whatever the rejected factory already built before failing.
          this.discardEntityConfig(cfg);
          throw this.duplicateEntityIdError(entId);
        }
        this.pendingEntityIds.add(entId);
        created.push({ id: entId, object: cfg.native?.three?.object });

        if (cfg.native?.three?.object) {
          this.native.scene.add(cfg.native.three.object);
          this.ownership.addThreeObject(
            entId,
            cfg.native.three.object,
            cfg.native.three.ownership ?? 'owned',
            cfg.native.three.borrowed ?? []
          );
        }

        const rapier = cfg.native?.rapier;
        if (rapier) {
          if (rapier.body) {
            slot = this.transformPipeline.allocateSlot(entId);
            // Seed transform *and* velocity: velocity is canonical state and is
            // hashed, so two bodies created with different linvel/angvel must
            // differ before the first step. A non-finite component throws here
            // and add() rolls the half-built entity back.
            physics.syncEntityCanonicalState(entId, rapier.body, slot, this.transformPipeline);
          }

          const bodyHandles = collectBodyHandles(rapier);
          const colliderHandles = collectColliderHandles(rapier);
          if (bodyHandles.length > 0 || colliderHandles.length > 0) {
            this.ownership.addRapierHandles(
              entId,
              bodyHandles,
              colliderHandles,
              rapier.ownership ?? 'owned'
            );
          }
        }

        const instance: EntityInstance = {
          id: entId,
          presetName: (factoryOrEntity as any).presetName ?? 'custom',
          tags: new Set(cfg.tags ?? []),
          state: cfg.state ?? {},
          native: cfg.native ?? {},
          actions: cfg.actions ?? {},
          slot,
          get position() {
            if (slot !== undefined) {
              return (instance as any).transformPipeline.getPosition(slot);
            }
            if (cfg.native?.three?.object) {
              const p = cfg.native.three.object.position;
              return [p.x, p.y, p.z];
            }
            return [0, 0, 0];
          },
          set position(pos: [number, number, number]) {
            if (slot !== undefined) {
              const rot = (instance as any).transformPipeline.getQuaternion(slot);
              (instance as any).transformPipeline.setTransform(
                slot,
                pos[0],
                pos[1],
                pos[2],
                rot[0],
                rot[1],
                rot[2],
                rot[3]
              );
            }
            if (cfg.native?.rapier?.body) {
              cfg.native.rapier.body.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
              // Resting bodies are skipped by the canonical sync; make Rapier
              // authoritative again on the next one.
              physics.markDirty(entId);
            }
            if (cfg.native?.three?.object) {
              cfg.native.three.object.position.set(pos[0], pos[1], pos[2]);
            }
          },
          get quaternion() {
            if (slot !== undefined) {
              return (instance as any).transformPipeline.getQuaternion(slot);
            }
            if (cfg.native?.three?.object) {
              const q = cfg.native.three.object.quaternion;
              return [q.x, q.y, q.z, q.w];
            }
            return [0, 0, 0, 1];
          },
          set quaternion(rotation: [number, number, number, number]) {
            if (slot !== undefined) {
              const pos = (instance as any).transformPipeline.getPosition(slot);
              (instance as any).transformPipeline.setTransform(
                slot,
                pos[0],
                pos[1],
                pos[2],
                rotation[0],
                rotation[1],
                rotation[2],
                rotation[3]
              );
            }
            if (cfg.native?.rapier?.body) {
              cfg.native.rapier.body.setRotation(
                { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
                true
              );
              physics.markDirty(entId);
            }
            cfg.native?.three?.object?.quaternion.set(
              rotation[0],
              rotation[1],
              rotation[2],
              rotation[3]
            );
          },
          destroy: () => {
            this.removeEntity(entId);
          },
          onDestroy: cfg.onDestroy,
        };

        (instance as any).transformPipeline = this.transformPipeline;
        return instance;
      },
    };

    try {
      if (typeof (factoryOrEntity as any).create === 'function') {
        inst = (factoryOrEntity as any).create(ctx);
      } else if (typeof factoryOrEntity === 'function') {
        inst = factoryOrEntity(ctx);
      } else {
        inst = ctx.entity(factoryOrEntity as EntityConfig);
      }

      // A hand-rolled factory can return an instance whose id never went
      // through ctx.entity(); reject it before it replaces a live entity.
      if (this.entitiesMap.has(inst.id)) {
        throw this.duplicateEntityIdError(inst.id);
      }

      this.entitiesMap.set(inst.id, inst);
      registeredId = inst.id;

      if (inst.native.rapier?.body) {
        this.physics.registerEntityBody(inst.id, inst.native.rapier.body);
      }

      for (const collider of this.resolveColliders(inst.native.rapier)) {
        const isSensor = inst.tags.has('sensor') || collider.isSensor();
        this.physics.registerEntityCollider(inst.id, collider, isSensor);
      }
    } catch (error) {
      // Roll back every partially registered entity from this add() call.
      if (registeredId !== undefined && !created.some((record) => record.id === registeredId)) {
        this.entitiesMap.delete(registeredId);
        this.rollbackEntityResources(registeredId);
      }
      for (const record of created) {
        this.entitiesMap.delete(record.id);
        if (record.object) this.native.scene.remove(record.object);
        this.rollbackEntityResources(record.id);
      }
      throw error;
    } finally {
      for (const record of created) {
        this.pendingEntityIds.delete(record.id);
      }
    }

    return inst as T;
  }

  private isEntityIdTaken(id: string): boolean {
    return this.entitiesMap.has(id) || this.pendingEntityIds.has(id);
  }

  /**
   * Keeps the `overlappingCount` a sensor entity reports in sync with the open
   * overlaps physics tracks, including the exits synthesized on removal.
   */
  private applySensorOverlapDelta(sensorEntityId: string, delta: number): void {
    const sensorEntity = this.entitiesMap.get(sensorEntityId);
    if (!sensorEntity) return;
    const current = sensorEntity.state.overlappingCount;
    if (typeof current !== 'number') return;
    sensorEntity.state.overlappingCount = Math.max(0, current + delta);
  }

  /**
   * Repairs and reports canonical rows that drifted from Rapier.
   *
   * Fixed bodies are skipped by the canonical sync for performance, and Rapier
   * exposes no change flag for them, so a native `body.setTranslation()` that
   * skips `engine.physics.markDirty(id)` would otherwise leave the canonical
   * buffer, the state hash and the interpolated render transform stale.
   */
  private auditCanonicalState(): void {
    this.ticksSinceCanonicalAudit = 0;
    if (!this.physics.hasWorld) return;

    const stale = this.physics.verifyRestingBodies(this.transformPipeline);
    for (const entityId of stale) {
      this.diagnostics.emit(
        'RND_0408',
        `RND_0408: canonical transform of entity "${entityId}" was stale and has been repaired from Rapier. ` +
          'A resting body was moved natively without invalidating it.',
        {
          severity: 'error',
          tick: this.clock.tick,
          entityId,
          remediation:
            'Call engine.physics.markDirty(entityId) right after moving a fixed or sleeping body with the native Rapier API.',
        }
      );
    }
  }

  private duplicateEntityIdError(id: string): Error {
    const message =
      `RND_0401: entity id already exists: "${id}". ` +
      'Entity ids must be unique; the duplicate was rejected before any resource was registered.';
    this.diagnostics.emit('RND_0401', message, {
      severity: 'error',
      tick: this.clock.tick,
      entityId: id,
      remediation: 'Use a unique id, or engine.remove(id) before adding the replacement.',
    });
    return new Error(message);
  }

  /** Resolves live colliders from instances or bare handles. */
  private resolveColliders(rapier: NativeBindingConfig['rapier']): RAPIER.Collider[] {
    if (!rapier) return [];
    const colliders: RAPIER.Collider[] = [...(rapier.colliders ?? [])];
    const known = new Set(colliders.map((collider) => collider.handle));

    for (const handle of rapier.colliderHandles ?? []) {
      if (known.has(handle)) continue;
      const collider = this.native.world.getCollider(handle);
      if (collider) {
        known.add(handle);
        colliders.push(collider);
      }
    }

    return colliders;
  }

  /**
   * Frees the native resources of an entity config that was rejected before it
   * ever became a live entity.
   */
  private discardEntityConfig(cfg: EntityConfig): void {
    const quarantineId = `__renderoni_discarded_${this.discardedResourceCount++}`;

    if (cfg.native?.three?.object) {
      this.ownership.addThreeObject(
        quarantineId,
        cfg.native.three.object,
        cfg.native.three.ownership ?? 'owned',
        cfg.native.three.borrowed ?? []
      );
    }
    if (cfg.native?.rapier) {
      this.ownership.addRapierHandles(
        quarantineId,
        collectBodyHandles(cfg.native.rapier),
        collectColliderHandles(cfg.native.rapier),
        cfg.native.rapier.ownership ?? 'owned'
      );
    }

    this.reportResourceDisposalErrors(
      quarantineId,
      this.ownership.disposeEntity(quarantineId, this.physics.hasWorld ? (this.native.world as any) : undefined)
    );
  }

  private rollbackEntityResources(id: string): void {
    this.transformPipeline.releaseSlot(id);
    this.physics.unregisterEntity(id);
    this.reportResourceDisposalErrors(
      id,
      this.ownership.disposeEntity(id, this.physics.hasWorld ? (this.native.world as any) : undefined)
    );
  }

  /**
   * Records native resource cleanup failures.
   *
   * Bookkeeping always completes, so a throwing `dispose()` cannot strand the
   * remaining resources; the failures are surfaced here instead of vanishing.
   */
  private reportResourceDisposalErrors(entityId: string, errors: unknown[]): unknown[] {
    if (errors.length === 0) return errors;

    this.diagnostics.emit(
      'RND_0409',
      `RND_0409: ${errors.length} native resource(s) of entity "${entityId}" failed to dispose; ` +
        'the rest of the cleanup still completed. ' +
        errors.map((error) => (error instanceof Error ? error.message : String(error))).join('; '),
      {
        severity: 'error',
        tick: this.clock.tick,
        entityId,
        remediation:
          'Fix the throwing geometry, material or texture dispose(); engine cleanup cannot roll back GPU state for you.',
      }
    );

    return errors;
  }

  /**
   * Removes and destroys an entity instance.
   *
   * Overlaps that are still open emit deterministic `contact.end` and
   * `sensor.exit` events before the physics mappings are dropped, so overlap
   * counters kept by gameplay code cannot stick. Neither a throwing exit
   * listener nor a throwing `onDestroy` hook can cancel the rest of the
   * teardown: every failure is collected, reported as a diagnostic, and
   * rethrown as one AggregateError after the entity is fully released.
   */
  remove(id: string): void {
    this.assertUsable('remove()');
    this.removeEntity(id);
  }

  private removeEntity(id: string): void {
    const ent = this.entitiesMap.get(id);
    if (!ent) return;
    if (this.removingEntityIds.has(id)) return;
    this.removingEntityIds.add(id);

    const errors: unknown[] = [];
    const codes = new Set<string>();
    const guard = (step: () => void): void => {
      try {
        step();
      } catch (error) {
        errors.push(error);
        codes.add('RND_0403');
      }
    };

    try {
      // Collected before the mappings are deleted, emitted while the entity is
      // still reachable so listeners can inspect it one last time.
      const ended = this.physics.unregisterEntity(id);
      const tick = this.clock.tick;
      const listenerErrors: unknown[] = [];
      for (const contact of ended.collisions) {
        listenerErrors.push(
          ...this.events.emitCollecting(
            'contact.end',
            { a: { id: contact.entityA }, b: { id: contact.entityB } },
            tick
          )
        );
      }
      for (const overlap of ended.sensors) {
        guard(() => this.applySensorOverlapDelta(overlap.sensorEntityId, -1));
        listenerErrors.push(
          ...this.events.emitCollecting(
            'sensor.exit',
            { sensor: { id: overlap.sensorEntityId }, target: { id: overlap.targetEntityId } },
            tick
          )
        );
      }
      if (listenerErrors.length > 0) {
        errors.push(...listenerErrors);
        codes.add('RND_0407');
        this.diagnostics.emit(
          'RND_0407',
          `RND_0407: ${listenerErrors.length} listener(s) threw while entity "${id}" emitted its teardown events; cleanup continued.`,
          {
            severity: 'error',
            tick: this.clock.tick,
            entityId: id,
            remediation:
              'Make contact.end / sensor.exit listeners total; they run during teardown and cannot cancel it.',
          }
        );
      }

      if (ent.slot !== undefined) {
        guard(() => this.transformPipeline.releaseSlot(id));
      }

      if (ent.native.three?.object) {
        guard(() => this.native.scene.remove(ent.native.three!.object));
      }

      if (ent.onDestroy) {
        try {
          ent.onDestroy();
        } catch (hookError) {
          errors.push(hookError);
          codes.add('RND_0403');
          this.diagnostics.emit(
            'RND_0403',
            `RND_0403: onDestroy hook of entity "${id}" threw; the entity was still fully cleaned up. ` +
              (hookError instanceof Error ? hookError.message : String(hookError)),
            {
              severity: 'error',
              tick: this.clock.tick,
              entityId: id,
              remediation:
                'Make onDestroy hooks total; they run during teardown and cannot cancel it.',
            }
          );
        }
      }

      let disposalErrors: unknown[] = [];
      guard(() => {
        disposalErrors = this.reportResourceDisposalErrors(
          id,
          this.ownership.disposeEntity(id, this.physics.hasWorld ? (this.native.world as any) : undefined)
        );
      });
      if (disposalErrors.length > 0) {
        errors.push(...disposalErrors);
        codes.add('RND_0409');
      }
      this.entitiesMap.delete(id);

      if (errors.length > 0) {
        throw new AggregateError(
          errors,
          `${Array.from(codes).sort().join(', ')}: cleanup of entity "${id}" completed after ` +
            `${errors.length} error(s) in teardown listeners, hooks or resource disposal.`
        );
      }
    } finally {
      this.removingEntityIds.delete(id);
    }
  }

  /**
   * Steps the fixed simulation by N ticks deterministically.
   */
  step(ticksToRun: number = 1, advanceClock: boolean = true): void {
    this.assertUsable('step()');

    if (!Number.isInteger(ticksToRun) || ticksToRun < 0) {
      throw new Error(
        `RND_0202: step(ticks) requires a finite non-negative integer, received ${String(ticksToRun)}. ` +
          'Fixed-step simulation cannot run fractional, negative or NaN tick counts.'
      );
    }

    for (let i = 0; i < ticksToRun; i++) {
      // Preserve the last authoritative transform for presentation interpolation.
      this.transformPipeline.commitTick();

      // 1. Drain & execute pending actions
      this.actions.drain(this);

      // 2. Drain structural mutations before iterating entities.
      //    Queued mutations come from gameplay code and agents, so a rejected
      //    id or a throwing destroy hook is reported and skipped instead of
      //    aborting the whole tick.
      this.commands.drain({
        onSpawnEntity: (command) => {
          try {
            this.add({ id: command.entityId, tags: command.tags, state: command.initialState });
          } catch (error) {
            this.reportCommandFailure('spawnEntity', command.entityId, error);
          }
        },
        onDestroyEntity: (command) => {
          try {
            this.removeEntity(command.entityId);
          } catch (error) {
            this.reportCommandFailure('destroyEntity', command.entityId, error);
          }
        },
        onAddTag: (command) => this.entitiesMap.get(command.entityId)?.tags.add(command.tag),
        onRemoveTag: (command) => this.entitiesMap.get(command.entityId)?.tags.delete(command.tag),
        onSetState: (command) => {
          const entity = this.entitiesMap.get(command.entityId);
          if (entity) entity.state[command.path] = command.value;
        },
      });

      // 3. Process Pre-Physics Systems
      this.systems.runPre({
        dt: this.clock.fixedDt,
        tick: this.clock.tick,
        events: this.events,
      });

      // 4. Entity internal updates (e.g. KCC player / Dynamic player)
      for (const ent of this.entitiesMap.values()) {
        ent.update?.(this.clock.fixedDt);
      }

      // 5. Step Rapier Physics World
      const currentTick = this.clock.tick;
      this.physics.step(
        this.transformPipeline,
        (contact: CollisionEvent) => {
          this.events.emit(
            contact.started ? 'contact.start' : 'contact.end',
            { a: { id: contact.entityA }, b: { id: contact.entityB } },
            currentTick
          );
        },
        (sensorEvent: SensorEvent) => {
          this.applySensorOverlapDelta(sensorEvent.sensorEntityId, sensorEvent.started ? 1 : -1);
          this.events.emit(
            sensorEvent.started ? 'sensor.enter' : 'sensor.exit',
            { sensor: { id: sensorEvent.sensorEntityId }, target: { id: sensorEvent.targetEntityId } },
            currentTick
          );
        }
      );

      // 6. Post-Physics Systems
      this.systems.runPost({
        dt: this.clock.fixedDt,
        tick: this.clock.tick,
        events: this.events,
      });

      // 7. Re-sync authoritative Rapier state so impulses, velocity writes and
      //    teleports applied by post-physics systems are canonical for this tick.
      this.physics.syncCanonicalState(this.transformPipeline);

      // 8. Periodically audit skipped bodies so a native move that Rapier
      //    cannot report can never become silent stale canonical state.
      this.ticksSinceCanonicalAudit++;
      if (this.ticksSinceCanonicalAudit >= CANONICAL_AUDIT_INTERVAL_TICKS) {
        this.auditCanonicalState();
      }

      // 9. Advance Simulation Clock
      if (advanceClock) {
        this.clock.stepTicks(1);
      }
    }
  }

  /**
   * Dispatches an action.
   */
  act(action: { name: string; payload?: unknown }): void {
    this.assertUsable('act()');
    this.actions.dispatch(action.name, action.payload);
  }

  private reportCommandFailure(command: string, entityId: string, error: unknown): void {
    const message =
      `RND_0404: queued ${command} command for entity "${entityId}" failed and was skipped. ` +
      (error instanceof Error ? error.message : String(error));
    this.diagnostics.emit('RND_0404', message, {
      severity: 'error',
      tick: this.clock.tick,
      entityId,
      remediation:
        'Queued structural commands must use unique ids and total onDestroy hooks; the tick continued without this command.',
    });
  }

  /**
   * Computes deterministic XXH3 state hash.
   *
   * Requires an initialized engine: hashing before `init()` would report a
   * placeholder digest for state that was never simulated.
   *
   * Bodies skipped by the canonical sync are audited first, so a native move
   * Rapier cannot report is repaired and diagnosed instead of being hashed as
   * stale state.
   */
  getStateHash(): string {
    if (!this.hasher.isReady) {
      throw new Error(
        'RND_0201: getStateHash() called before the engine finished initializing. ' +
          'Use `const game = await createRenderoni(...)` or `await game.init()` first.'
      );
    }

    this.auditCanonicalState();

    const rawEntities = Array.from(this.entitiesMap.values()).map((e) => ({
      id: e.id,
      slot: e.slot,
      position: e.position,
      quaternion: e.quaternion,
      state: e.state,
    }));

    return this.hasher.computeHash(
      rawEntities,
      this.transformPipeline.currentBuffer,
      this.physics.getActiveContacts()
    );
  }

  /**
   * Evaluates machine AST assertions for test runners and agents.
   */
  check(assertions: AssertionOp[]): CheckResult {
    return evaluateCheck(this, assertions);
  }

  /**
   * Starts interactive presentation render loop.
   *
   * When an opt-in match loop is enabled, fixed simulation only advances while
   * the loop is `playing`. Frame time observed during `ready`, `won` and `lost`
   * is dropped instead of accumulated, so pressing Start never replays a
   * backlog of ticks. Presentation (onUpdate and rendering) keeps running in
   * every phase. Headless `step()` is unaffected and always runs the ticks it
   * is asked for.
   */
  start(onUpdate?: (dt: number) => void): void {
    this.assertUsable('start()');
    if (this.isRunning) return;
    this.isRunning = true;

    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (!this.isRunning) return;

      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      if (this.loop.playing) {
        const numTicks = this.clock.advancePresentation(dt);
        if (numTicks > 0) {
          this.step(numTicks);
        }
      }

      if (onUpdate) {
        onUpdate(dt);
      }

      // Render presentation interpolation
      if (this.native.renderer) {
        const alpha = this.clock.alpha;
        const outPos: [number, number, number] = [0, 0, 0];
        const outQuat: [number, number, number, number] = [0, 0, 0, 1];

        for (const ent of this.entitiesMap.values()) {
          if (ent.slot !== undefined && ent.native.three?.object) {
            this.transformPipeline.interpolate(ent.slot, alpha, outPos, outQuat);
            ent.native.three.object.position.set(outPos[0], outPos[1], outPos[2]);
            ent.native.three.object.quaternion.set(outQuat[0], outQuat[1], outQuat[2], outQuat[3]);
          }
        }

        this.native.renderer.render(this.native.scene, this.native.camera);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stops presentation render loop.
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Disposes all engine resources cleanly.
   *
   * Every teardown step runs even when an earlier one throws: entities, GPU
   * resources, the Rapier world, action handlers, systems and listeners are
   * always released. Failures are reported as diagnostics and rethrown as one
   * AggregateError once cleanup has finished.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    const errors: unknown[] = [];
    const guard = (step: () => void): void => {
      try {
        step();
      } catch (error) {
        errors.push(error);
      }
    };

    guard(() => this.stop());

    for (const id of Array.from(this.entitiesMap.keys())) {
      guard(() => this.removeEntity(id));
    }
    // Entities whose teardown failed must not keep resources registered.
    for (const id of Array.from(this.entitiesMap.keys())) {
      guard(() => {
        this.entitiesMap.delete(id);
        this.rollbackEntityResources(id);
      });
    }

    guard(() => this.input.dispose());
    guard(() => this.clearActionHandlers());
    guard(() => this.actions.clear());
    guard(() => this.commands.clear());
    guard(() => this.systems.clear());
    guard(() => {
      const disposalErrors = this.reportResourceDisposalErrors(
        '<engine>',
        this.ownership.disposeAll(this.physics.hasWorld ? (this.native.world as any) : undefined)
      );
      errors.push(...disposalErrors);
    });
    guard(() => this.physics.dispose());
    guard(() => {
      if (this.native.renderer) this.native.renderer.dispose();
    });
    guard(() => this.events.clear());
    this.pendingEntityIds.clear();
    this.removingEntityIds.clear();

    if (errors.length > 0) {
      const message = `RND_0406: engine dispose completed with ${errors.length} error(s); all resources were still released.`;
      this.diagnostics.emit('RND_0406', message, {
        severity: 'error',
        tick: this.clock.tick,
        remediation: 'Fix the reported onDestroy hooks or subsystem teardown; cleanup itself already finished.',
      });
      throw new AggregateError(errors, message);
    }
  }

  /**
   * Drops the closures registered as action handlers.
   *
   * Handlers capture entities, scenes and subsystems, so leaving them
   * registered keeps a disposed engine's whole object graph alive.
   */
  private clearActionHandlers(): void {
    const noop = () => {};
    for (const descriptor of this.actions.list()) {
      this.actions.register({ name: descriptor.name, handle: noop });
    }
  }
}
