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
  type PresetInstance,
} from '../presets/define-preset.js';
import { evaluateCheck, type AssertionOp, type CheckResult } from '../testing/check.js';
import { GameLoop, type GameLoopOptions } from './loop.js';

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

  getRecentEvents(eventName?: string): Array<{ event: string; payload: unknown; tick: number }> {
    if (eventName) {
      return this.eventBuffer.filter((e) => e.event === eventName);
    }
    return [...this.eventBuffer];
  }

  clear(): void {
    this.eventBuffer = [];
  }
}

export class SystemManager {
  private prePhysics: Array<(ctx: { dt: number; tick: number; events: EventEmitter }) => void> = [];
  private postPhysics: Array<(ctx: { dt: number; tick: number; events: EventEmitter }) => void> = [];

  add(system: {
    phase?: 'prePhysics' | 'postPhysics';
    update: (ctx: { dt: number; tick: number; events: EventEmitter }) => void;
  }): void {
    if (system.phase === 'prePhysics') {
      this.prePhysics.push(system.update);
    } else {
      this.postPhysics.push(system.update);
    }
  }

  runPre(ctx: { dt: number; tick: number; events: EventEmitter }): void {
    for (const sys of this.prePhysics) sys(ctx);
  }

  runPost(ctx: { dt: number; tick: number; events: EventEmitter }): void {
    for (const sys of this.postPhysics) sys(ctx);
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
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  constructor(config: RenderoniConfig = {}) {
    this.mode = config.mode ?? 'headless';
    this.seed = config.seed ?? 42;
    this.physics = new PhysicsEngine();

    this.clock = new SimulationClock(config.clock);
    this.prng = new PRNG(typeof this.seed === 'number' ? this.seed : 42);
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

  async init(config: RenderoniConfig = {}): Promise<void> {
    await Promise.all([
      this.physics.init({ gravity: config.gravity }),
      this.hasher.init(),
    ]);

    if (config.subsystems) {
      for (const sub of config.subsystems) {
        sub(this);
      }
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
   */
  add<T extends EntityInstance = EntityInstance>(
    factoryOrEntity: PresetInstance<any> | EntityConfig | ((ctx: EntityContext) => EntityInstance)
  ): T {
    let inst: EntityInstance;
    const generateId = () => `entity_${this.entitiesMap.size + 1}`;

    const ctx: EntityContext = {
      id: (factoryOrEntity as any).options?.id ?? (factoryOrEntity as any).id ?? generateId(),
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
        let slot: number | undefined;

        if (cfg.native?.three?.object) {
          this.native.scene.add(cfg.native.three.object);
          this.ownership.addThreeObject(entId, cfg.native.three.object, cfg.native.three.ownership ?? 'owned');
        }

        if (cfg.native?.rapier?.body) {
          slot = this.transformPipeline.allocateSlot(entId);
          const pos = cfg.native.rapier.body.translation();
          const rot = cfg.native.rapier.body.rotation();
          this.transformPipeline.setTransform(slot, pos.x, pos.y, pos.z, rot.x, rot.y, rot.z, rot.w);
          this.ownership.addRapierHandles(
            entId,
            [cfg.native.rapier.body.handle],
            cfg.native.rapier.colliderHandles ?? [],
            cfg.native.rapier.ownership ?? 'owned'
          );
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
            if (cfg.native?.three?.object) {
              cfg.native.three.object.position.set(pos[0], pos[1], pos[2]);
            }
          },
          get quaternion() {
            if (slot !== undefined) {
              return (instance as any).transformPipeline.getQuaternion(slot);
            }
            return [0, 0, 0, 1];
          },
          destroy: () => {
            this.remove(entId);
          },
          onDestroy: cfg.onDestroy,
        };

        (instance as any).transformPipeline = this.transformPipeline;
        return instance;
      },
    };

    if (typeof (factoryOrEntity as any).create === 'function') {
      inst = (factoryOrEntity as any).create(ctx);
    } else if (typeof factoryOrEntity === 'function') {
      inst = factoryOrEntity(ctx);
    } else {
      inst = ctx.entity(factoryOrEntity as EntityConfig);
    }

    this.entitiesMap.set(inst.id, inst);

    if (inst.native.rapier?.body) {
      this.physics.registerEntityBody(inst.id, inst.native.rapier.body);
    }

    if (inst.native.rapier?.colliders) {
      const isSensor = inst.tags.has('sensor');
      for (const collider of inst.native.rapier.colliders) {
        this.physics.registerEntityCollider(inst.id, collider, isSensor);
      }
    }

    return inst as T;
  }

  /**
   * Removes and destroys an entity instance.
   */
  remove(id: string): void {
    const ent = this.entitiesMap.get(id);
    if (!ent) return;

    if (ent.slot !== undefined) {
      this.transformPipeline.releaseSlot(id);
    }

    this.physics.unregisterEntity(id);

    if (ent.native.three?.object) {
      this.native.scene.remove(ent.native.three.object);
    }

    if (ent.native.rapier?.body) {
      try {
        this.native.world.removeRigidBody(ent.native.rapier.body);
      } catch (_) {}
    }

    if (ent.onDestroy) {
      ent.onDestroy();
    }

    this.ownership.disposeEntity(id, this.native.world as any);
    this.entitiesMap.delete(id);
  }

  /**
   * Steps the fixed simulation by N ticks deterministically.
   */
  step(ticksToRun: number = 1, advanceClock: boolean = true): void {
    for (let i = 0; i < ticksToRun; i++) {
      // 1. Drain & execute pending actions
      this.actions.drain(this);

      // 2. Process Pre-Physics Systems
      this.systems.runPre({
        dt: this.clock.fixedDt,
        tick: this.clock.tick,
        events: this.events,
      });

      // 3. Entity internal updates (e.g. KCC player / Dynamic player)
      for (const ent of this.entitiesMap.values()) {
        if (typeof (ent as any).update === 'function') {
          (ent as any).update(this.clock.fixedDt);
        }
      }

      // 4. Step Rapier Physics World
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
          this.events.emit(
            sensorEvent.started ? 'sensor.enter' : 'sensor.exit',
            { sensor: { id: sensorEvent.sensorEntityId }, target: { id: sensorEvent.targetEntityId } },
            currentTick
          );
        }
      );

      // 5. Sensor Trigger Overlap Checks
      for (const sensorEntity of this.entitiesMap.values()) {
        if (sensorEntity.tags.has('sensor')) {
          const sPos = sensorEntity.position;
          for (const other of this.entitiesMap.values()) {
            if (
              other.id !== sensorEntity.id &&
              (other.tags.has('player') || other.tags.has('dynamic') || other.tags.has('kcc'))
            ) {
              const oPos = other.position;
              const dx = Math.abs(sPos[0] - oPos[0]);
              const dy = Math.abs(sPos[1] - oPos[1]);
              const dz = Math.abs(sPos[2] - oPos[2]);

              if (dx < 3.5 && dy < 3.5 && dz < 3.5) {
                if (!sensorEntity.state[`overlapping_${other.id}`]) {
                  sensorEntity.state[`overlapping_${other.id}`] = true;
                  this.events.emit(
                    'sensor.enter',
                    { sensor: { id: sensorEntity.id }, target: { id: other.id } },
                    currentTick
                  );
                }
              } else if (sensorEntity.state[`overlapping_${other.id}`]) {
                delete sensorEntity.state[`overlapping_${other.id}`];
                this.events.emit(
                  'sensor.exit',
                  { sensor: { id: sensorEntity.id }, target: { id: other.id } },
                  currentTick
                );
              }
            }
          }
        }
      }

      // 6. Post-Physics Systems
      this.systems.runPost({
        dt: this.clock.fixedDt,
        tick: this.clock.tick,
        events: this.events,
      });

      // 7. Commit transform pipeline tick and advance Simulation Clock
      this.transformPipeline.commitTick();
      if (advanceClock) {
        this.clock.stepTicks(1);
      }
    }
  }

  /**
   * Dispatches an action.
   */
  act(action: { name: string; payload?: unknown }): void {
    this.actions.dispatch(action.name, action.payload);
  }

  /**
   * Computes deterministic XXH3 state hash.
   */
  getStateHash(): string {
    const rawEntities = Array.from(this.entitiesMap.values()).map((e) => ({
      id: e.id,
      slot: e.slot ?? 0,
      position: e.position,
      quaternion: e.quaternion,
      state: e.state,
    }));

    return this.hasher.computeHash(rawEntities, this.transformPipeline.currentBuffer);
  }

  /**
   * Evaluates machine AST assertions for test runners and agents.
   */
  check(assertions: AssertionOp[]): CheckResult {
    return evaluateCheck(this, assertions);
  }

  /**
   * Starts interactive presentation render loop.
   */
  start(onUpdate?: (dt: number) => void): void {
    if (this.isRunning) return;
    this.isRunning = true;

    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (!this.isRunning) return;

      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      const numTicks = this.clock.advancePresentation(dt);
      if (numTicks > 0) {
        this.step(numTicks, false);
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
   */
  dispose(): void {
    this.stop();
    this.ownership.disposeAll(this.native.world as any);
    this.physics.dispose();
    if (this.native.renderer) {
      this.native.renderer.dispose();
    }
    this.entitiesMap.clear();
    this.events.clear();
  }
}
