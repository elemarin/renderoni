import type { RenderoniEngine, EventEmitter } from '../core/engine.js';
import type { PRNG } from '../core/prng.js';
import type { ResourceOwnership } from '../core/ownership.js';
import type { EntityConfig, EntityContext, EntityInstance, PresetInstance } from '../presets/define-preset.js';
import type { SceneInventory } from './inventory.js';
import type { ModelFactory, MountSceneOptions } from './mount.js';
import { mountSceneInventory } from './mount.js';
import type { PersistentStore, SceneContext } from './types.js';
import * as THREE from 'three';

export class PersistentStoreImpl implements PersistentStore {
  private data = new Map<string, unknown>();

  get<T = unknown>(key: string, defaultValue?: T): T {
    if (this.data.has(key)) {
      return this.data.get(key) as T;
    }
    return defaultValue as T;
  }

  set<T = unknown>(key: string, value: T): void {
    this.data.set(key, value);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  delete(key: string): boolean {
    return this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  toJSON(): Record<string, unknown> {
    return Object.fromEntries(this.data.entries());
  }

  fromJSON(state: Record<string, unknown>): void {
    this.data.clear();
    for (const [k, v] of Object.entries(state)) {
      this.data.set(k, v);
    }
  }
}

export class SceneContextImpl implements SceneContext {
  readonly engine: RenderoniEngine;
  readonly sceneId: string;
  readonly levelId: string;
  readonly prng: PRNG;
  readonly persistent: PersistentStore;
  readonly state: Record<string, unknown> = {};

  private spawnedEntityIds = new Set<string>();
  private threeRoots = new Set<THREE.Object3D>();
  private cleanups: Array<() => void> = [];

  constructor(options: {
    engine: RenderoniEngine;
    sceneId: string;
    levelId: string;
    prng: PRNG;
    persistent: PersistentStore;
  }) {
    this.engine = options.engine;
    this.sceneId = options.sceneId;
    this.levelId = options.levelId;
    this.prng = options.prng;
    this.persistent = options.persistent;
  }

  spawn<T extends EntityInstance = EntityInstance>(
    preset: PresetInstance<any> | EntityConfig | ((ctx: EntityContext) => EntityInstance)
  ): T {
    const entity = this.engine.add(preset as any) as T;
    this.spawnedEntityIds.add(entity.id);
    return entity;
  }

  mount(
    inventory: SceneInventory | unknown,
    factories: Record<string, ModelFactory> = {},
    options: MountSceneOptions = {}
  ): EntityInstance[] {
    const spawned = mountSceneInventory(this.engine, inventory, factories, options);
    for (const entity of spawned) {
      this.spawnedEntityIds.add(entity.id);
    }
    return spawned;
  }

  addSystem(system: {
    phase?: 'prePhysics' | 'postPhysics';
    update: (ctx: { dt: number; tick: number; events: EventEmitter }) => void;
  }): () => void {
    const unregister = this.engine.systems.add(system);
    this.cleanups.push(unregister);
    return unregister;
  }

  addThreeObject(object: THREE.Object3D, ownership: ResourceOwnership = 'owned'): void {
    this.engine.native.scene.add(object);
    this.threeRoots.add(object);
    this.engine.ownership.addThreeObject(`scene:${this.sceneId}:${object.id}`, object, ownership);
  }

  registerAction(name: string, handler: (payload?: any) => any): () => void {
    this.engine.actions.register({ name, handle: handler });
    const unregister = () => {
      this.engine.actions.unregister(name);
    };
    this.cleanups.push(unregister);
    return unregister;
  }

  on(event: string, handler: (payload?: any) => void): () => void {
    const unregister = this.engine.events.on(event, handler);
    this.cleanups.push(unregister);
    return unregister;
  }

  trackDisposable(disposable: { dispose: () => void }): void {
    this.cleanups.push(() => disposable.dispose());
  }

  getSpawnedEntityIds(): Set<string> {
    return new Set(this.spawnedEntityIds);
  }

  dispose(preserveEntityIds: Set<string> = new Set()): void {
    const errors: unknown[] = [];

    // 1. Run cleanups (systems, event listeners, actions, disposables)
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch (err) {
        errors.push(err);
      }
    }
    this.cleanups = [];

    // 2. Remove scene-owned entities from engine
    for (const entityId of this.spawnedEntityIds) {
      if (preserveEntityIds.has(entityId)) continue;
      try {
        if (this.engine.entities.has(entityId)) {
          this.engine.remove(entityId);
        }
      } catch (err) {
        errors.push(err);
      }
    }
    this.spawnedEntityIds.clear();

    // 3. Remove direct Three roots
    for (const root of this.threeRoots) {
      try {
        root.removeFromParent();
        root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else if (child.material) {
              child.material.dispose();
            }
          }
        });
      } catch (err) {
        errors.push(err);
      }
    }
    this.threeRoots.clear();

    if (errors.length > 0) {
      if (typeof AggregateError !== 'undefined') {
        throw new AggregateError(errors, `Errors occurred during SceneContext teardown (${this.sceneId})`);
      } else {
        throw errors[0];
      }
    }
  }
}
