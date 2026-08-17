/**
 * Renderoni Core Engine & Game Instance
 *
 * Unified runtime coordinating the deterministic simulation kernel,
 * physics world, entity registry, action stream, and presentation pipeline.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SimulationClock } from './clock.js';
import { PRNG } from './prng.js';
import { StructuralCommandQueue } from './commands.js';
import { DualBufferTransformPipeline } from './transform-buffer.js';
import { PhysicsEngine, type CollisionEvent, type SensorEvent } from './physics.js';
import { StateHasher } from './hashing.js';
import { ResourceOwnershipTracker } from './ownership.js';
import { DiagnosticLogger } from './diagnostics.js';
import { ActionRegistry } from '../input/actions.js';
import { InputManager } from '../input/input-manager.js';
import type { EntityContext, EntityInstance, PresetInstance, PresetFactory } from '../presets/define-preset.js';

export interface SystemDefinition {
  name?: string;
  phase: 'prePhysics' | 'postPhysics';
  update: (ctx: SystemUpdateContext) => void;
}

export interface SystemUpdateContext {
  tick: number;
  dt: number;
  prng: PRNG;
  events: EventEmitter;
}

export class EventEmitter {
  private listeners: Map<string, Set<(payload: any) => void>> = new Map();
  private eventRingBuffer: Array<{ event: string; payload: unknown; tick: number }> = [];

  on(event: string, handler: (payload: any) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit(event: string, payload?: unknown, currentTick: number = 0): void {
    this.eventRingBuffer.push({ event, payload, tick: currentTick });
    if (this.eventRingBuffer.length > 500) {
      this.eventRingBuffer.shift();
    }

    const set = this.listeners.get(event);
    if (set) {
      for (const handler of set) {
        handler(payload);
      }
    }
  }

  getRecentEvents(eventName?: string): Array<{ event: string; payload: unknown; tick: number }> {
    if (!eventName) return [...this.eventRingBuffer];
    return this.eventRingBuffer.filter((e) => e.event === eventName);
  }

  clear(): void {
    this.listeners.clear();
    this.eventRingBuffer = [];
  }
}

export interface RenderoniConfig {
  mode?: 'interactive' | 'headless';
  seed?: number | string;
  tickRateHz?: number;
  subsystems?: Array<(game: RenderoniEngine) => void | { name: string }>;
  gravity?: [number, number, number];
}

export class RenderoniEngine {
  readonly mode: 'interactive' | 'headless';
  readonly seed: number | string;
  readonly tickRateHz: number;

  readonly clock: SimulationClock;
  readonly prng: PRNG;
  readonly commands: StructuralCommandQueue;
  readonly transformPipeline: DualBufferTransformPipeline;
  readonly physics: PhysicsEngine;
  readonly hasher: StateHasher;
  readonly ownership: ResourceOwnershipTracker;
  readonly diagnostics: DiagnosticLogger;
  readonly actions: ActionRegistry;
  readonly input: InputManager;
  readonly events: EventEmitter;

  readonly threeScene?: THREE.Scene;

  private entitiesMap: Map<string, EntityInstance> = new Map();
  private _systemsList: SystemDefinition[] = [];
  private autoEntityIdCounter = 1;

  constructor(config: RenderoniConfig = {}) {
    this.mode = config.mode ?? 'headless';
    this.seed = config.seed ?? 42;
    this.tickRateHz = config.tickRateHz ?? 60;

    this.clock = new SimulationClock({ tickRateHz: this.tickRateHz });
    this.prng = new PRNG(this.seed);
    this.commands = new StructuralCommandQueue();
    this.transformPipeline = new DualBufferTransformPipeline(256);
    this.physics = new PhysicsEngine();
    this.hasher = new StateHasher();
    this.ownership = new ResourceOwnershipTracker();
    this.diagnostics = new DiagnosticLogger();
    this.actions = new ActionRegistry();
    this.input = new InputManager();
    this.events = new EventEmitter();

    if (this.mode === 'interactive') {
      this.threeScene = new THREE.Scene();
    }
  }

  async init(config: RenderoniConfig = {}): Promise<void> {
    await this.physics.init({ gravity: config.gravity });
    await this.hasher.init();

    // Attach DOM input if interactive and window is available
    if (this.mode === 'interactive') {
      this.input.attachDOM();
    }

    // Initialize registered subsystems
    if (config.subsystems) {
      for (const subsystem of config.subsystems) {
        if (typeof subsystem === 'function') {
          subsystem(this);
        }
      }
    }
  }

  get tick(): number {
    return this.clock.tick;
  }

  get native(): { world: RAPIER.World; threeScene?: THREE.Scene } {
    return {
      world: this.physics.world,
      threeScene: this.threeScene,
    };
  }

  /**
   * Universal entity addition verb.
   */
  add<TOptions>(presetInstance: PresetInstance<TOptions>): EntityInstance {
    const autoId = presetInstance.options && typeof presetInstance.options === 'object' && 'id' in presetInstance.options && (presetInstance.options as any).id
      ? (presetInstance.options as any).id
      : `entity_${this.autoEntityIdCounter++}`;

    const entityCtx: EntityContext = {
      id: autoId,
      native: {
        world: this.physics.world,
        threeScene: this.threeScene,
      },
      events: {
        emit: (evt, payload) => this.events.emit(evt, payload, this.clock.tick),
        on: (evt, handler) => this.events.on(evt, handler),
      },
      prng: this.prng.fork(autoId),
      entity: (cfg) => {
        const id = cfg.id ?? autoId;
        const inst: EntityInstance = {
          id,
          presetName: presetInstance.presetName,
          tags: new Set(cfg.tags ?? []),
          state: (cfg.state ?? {}) as any,
          native: cfg.native ?? {},
          actions: cfg.actions ?? {},
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          destroy: () => this.remove(id),
          onDestroy: cfg.onDestroy,
        };

        // Extract initial position/rotation
        if (cfg.native?.rapier?.body) {
          const trans = cfg.native.rapier.body.translation();
          const rot = cfg.native.rapier.body.rotation();
          inst.position = [trans.x, trans.y, trans.z];
          inst.quaternion = [rot.x, rot.y, rot.z, rot.w];
        } else if (cfg.native?.three?.object) {
          const p = cfg.native.three.object.position;
          const q = cfg.native.three.object.quaternion;
          inst.position = [p.x, p.y, p.z];
          inst.quaternion = [q.x, q.y, q.z, q.w];
        }

        return inst;
      },
    };

    const instance = presetInstance.create(entityCtx);

    // Allocate transform slot
    const slot = this.transformPipeline.allocateSlot(instance.id);
    instance.slot = slot;
    this.transformPipeline.setTransform(
      slot,
      instance.position[0],
      instance.position[1],
      instance.position[2],
      instance.quaternion[0],
      instance.quaternion[1],
      instance.quaternion[2],
      instance.quaternion[3]
    );

    // Register with Rapier physics engine
    if (instance.native.rapier?.body) {
      this.physics.registerEntityBody(instance.id, instance.native.rapier.body);
    }
    if (instance.native.rapier?.colliders) {
      const isSensor = instance.tags.has('sensor');
      for (const collider of instance.native.rapier.colliders) {
        this.physics.registerEntityCollider(instance.id, collider, isSensor);
      }
    }

    // Register with Three.js scene
    if (this.threeScene && instance.native.three?.object) {
      this.threeScene.add(instance.native.three.object);
    }

    // Register resource ownership
    if (instance.native.three?.object) {
      this.ownership.addThreeObject(instance.id, instance.native.three.object, instance.native.three.ownership);
    }
    if (instance.native.rapier?.bodyHandle !== undefined || instance.native.rapier?.colliderHandles) {
      this.ownership.addRapierHandles(
        instance.id,
        instance.native.rapier.bodyHandle !== undefined ? [instance.native.rapier.bodyHandle] : [],
        instance.native.rapier.colliderHandles ?? [],
        instance.native.rapier.ownership
      );
    }

    this.entitiesMap.set(instance.id, instance);
    this.events.emit('entity.spawn', { entityId: instance.id }, this.clock.tick);

    return instance;
  }

  /**
   * Removes an entity and frees its owned resources.
   */
  remove(entityId: string): void {
    const instance = this.entitiesMap.get(entityId);
    if (!instance) return;

    instance.onDestroy?.();

    if (this.threeScene && instance.native.three?.object) {
      this.threeScene.remove(instance.native.three.object);
    }

    this.physics.unregisterEntity(entityId);
    this.ownership.disposeEntity(entityId, this.physics.hasWorld ? (this.physics.world as any) : undefined);
    this.transformPipeline.releaseSlot(entityId);
    this.entitiesMap.delete(entityId);

    this.events.emit('entity.destroy', { entityId }, this.clock.tick);
  }

  get entities() {
    return {
      get: <T = EntityInstance>(id: string, _preset?: PresetFactory<any>): T => {
        const ent = this.entitiesMap.get(id);
        if (!ent) throw new Error(`Entity not found with ID: ${id}`);
        return ent as unknown as T;
      },
      has: (id: string): boolean => this.entitiesMap.has(id),
      list: (): EntityInstance[] => Array.from(this.entitiesMap.values()),
    };
  }

  get systems() {
    return {
      add: (system: SystemDefinition): void => {
        this._systemsList.push(system);
      },
    };
  }

  /**
   * Injects an action programmatically (for AI agents and automated testing).
   */
  act(action: { name: string; payload?: unknown }): void {
    this.actions.dispatch(action.name, action.payload);
  }

  /**
   * Advances the simulation by N deterministic fixed ticks.
   */
  step(ticks: number = 1): void {
    for (let t = 0; t < ticks; t++) {
      this.tickSingle();
    }
  }

  private tickSingle(): void {
    const currentTick = this.clock.tick;
    const dt = this.clock.fixedDt;

    // 1. Tick PRNG derivation
    const tickPrng = this.prng.fork(`tick_${currentTick}`);

    // 2. Drain structural commands
    this.commands.drain({
      onSpawnEntity: () => {},
      onDestroyEntity: (cmd) => this.remove(cmd.entityId),
      onAddTag: (cmd) => this.entitiesMap.get(cmd.entityId)?.tags.add(cmd.tag),
      onRemoveTag: (cmd) => this.entitiesMap.get(cmd.entityId)?.tags.delete(cmd.tag),
      onSetState: (cmd) => {
        const ent = this.entitiesMap.get(cmd.entityId);
        if (ent) (ent.state as any)[cmd.path] = cmd.value;
      },
    });

    // 3. Drain and execute actions
    this.actions.drain(this);

    // 4. Run Pre-Physics Systems & entity updates
    const sysCtx: SystemUpdateContext = {
      tick: currentTick,
      dt,
      prng: tickPrng,
      events: this.events,
    };

    for (let i = 0; i < this._systemsList.length; i++) {
      if (this._systemsList[i].phase === 'prePhysics') {
        this._systemsList[i].update(sysCtx);
      }
    }

    // Entity internal updates (e.g. KCC player / Dynamic player)
    for (const ent of this.entitiesMap.values()) {
      if (typeof (ent as any).update === 'function') {
        (ent as any).update(dt);
      }
    }

    // 5. Step Rapier Physics World
    this.physics.step(
      this.transformPipeline,
      (colEvent: CollisionEvent) => {
        this.events.emit(colEvent.started ? 'collision.enter' : 'collision.exit', colEvent, currentTick);
      },
      (sensorEvent: SensorEvent) => {
        this.events.emit(
          sensorEvent.started ? 'sensor.enter' : 'sensor.exit',
          { sensor: { id: sensorEvent.sensorEntityId }, target: { id: sensorEvent.targetEntityId } },
          currentTick
        );
      }
    );

    // 6. Sync entity position caches
    for (const ent of this.entitiesMap.values()) {
      if (ent.slot !== undefined) {
        this.transformPipeline.getPosition(ent.slot, ent.position);
        this.transformPipeline.getQuaternion(ent.slot, ent.quaternion);
      }
    }

    // 7. Run Post-Physics Systems
    for (let i = 0; i < this._systemsList.length; i++) {
      if (this._systemsList[i].phase === 'postPhysics') {
        this._systemsList[i].update(sysCtx);
      }
    }

    // 8. Commit transform tick
    this.transformPipeline.commitTick();

    // 9. Advance Clock
    this.clock.stepTicks(1);
  }

  /**
   * Computes XXH3-64 deterministic state hash.
   */
  getStateHash(): string {
    const records = Array.from(this.entitiesMap.values())
      .filter((e) => e.slot !== undefined)
      .map((e) => ({ id: e.id, slot: e.slot! }));

    return this.hasher.computeHash(records, this.transformPipeline.currentBuffer);
  }

  /**
   * Asserts machine AST check operations.
   */
  check(assertions: Array<{ op: string; [key: string]: unknown }>): { passed: boolean; failures: string[] } {
    const failures: string[] = [];

    for (const ast of assertions) {
      if (ast.op === 'greaterThan') {
        const path = ast.path as string;
        const val = this.resolvePath(path);
        if (typeof val !== 'number' || val <= (ast.value as number)) {
          failures.push(`greaterThan failed for ${path}: expected > ${ast.value}, got ${val}`);
        }
      } else if (ast.op === 'lessThan') {
        const path = ast.path as string;
        const val = this.resolvePath(path);
        if (typeof val !== 'number' || val >= (ast.value as number)) {
          failures.push(`lessThan failed for ${path}: expected < ${ast.value}, got ${val}`);
        }
      } else if (ast.op === 'isWithinDistance') {
        const entA = this.entitiesMap.get(ast.entityA as string);
        const entB = this.entitiesMap.get(ast.entityB as string);
        if (!entA || !entB) {
          failures.push(`isWithinDistance failed: entity ${ast.entityA} or ${ast.entityB} not found`);
        } else {
          const dist = Math.hypot(
            entA.position[0] - entB.position[0],
            entA.position[1] - entB.position[1],
            entA.position[2] - entB.position[2]
          );
          if (dist > (ast.maxDistance as number)) {
            failures.push(`isWithinDistance failed: dist ${dist.toFixed(2)} > max ${ast.maxDistance}`);
          }
        }
      } else if (ast.op === 'noDiagnostics') {
        if (this.diagnostics.hasErrors()) {
          failures.push('noDiagnostics failed: errors present in diagnostic logger');
        }
      }
    }

    return { passed: failures.length === 0, failures };
  }

  private resolvePath(path: string): unknown {
    const parts = path.split('.');
    if (parts[0] === 'entities') {
      const ent = this.entitiesMap.get(parts[1]);
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

  dispose(): void {
    if (this.physics.hasWorld) {
      this.ownership.disposeAll(this.physics.world as any);
    }
    this.physics.dispose();
    this.input.dispose();
    this.events.clear();
    this.entitiesMap.clear();
  }
}
