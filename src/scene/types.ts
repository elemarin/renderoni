import type { RenderoniEngine, EventEmitter } from '../core/engine.js';
import type { PRNG } from '../core/prng.js';
import type { ResourceOwnership } from '../core/ownership.js';
import type { EntityConfig, EntityContext, EntityInstance, PresetInstance } from '../presets/define-preset.js';
import type { SceneInventory } from './inventory.js';
import type { ModelFactory, MountSceneOptions } from './mount.js';
import * as THREE from 'three';

export interface SceneEntryPoint {
  id: string;
  position: [number, number, number];
  rotation?: [number, number, number, number];
}

export interface PersistentStore {
  get<T = unknown>(key: string, defaultValue?: T): T;
  set<T = unknown>(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  toJSON(): Record<string, unknown>;
  fromJSON(state: Record<string, unknown>): void;
}

export interface SceneContext {
  readonly engine: RenderoniEngine;
  readonly sceneId: string;
  readonly levelId: string;
  readonly prng: PRNG;
  readonly persistent: PersistentStore;
  readonly state: Record<string, unknown>;

  /** Spawn an entity tracked for automatic cleanup when this scene unloads */
  spawn<T extends EntityInstance = EntityInstance>(
    preset: PresetInstance<any> | EntityConfig | ((ctx: EntityContext) => EntityInstance)
  ): T;

  /** Mount a SceneInventory and track all spawned entities */
  mount(
    inventory: SceneInventory | unknown,
    factories?: Record<string, ModelFactory>,
    options?: MountSceneOptions
  ): EntityInstance[];

  /** Add a scene-local simulation system that will be removed on unload */
  addSystem(system: {
    phase?: 'prePhysics' | 'postPhysics';
    update: (ctx: { dt: number; tick: number; events: EventEmitter }) => void;
  }): () => void;

  /** Add a scene-owned Three.js object (lights, environment meshes) */
  addThreeObject(object: THREE.Object3D, ownership?: ResourceOwnership): void;

  /** Register a scene-local action handler automatically unregistered on unload */
  registerAction(name: string, handler: (payload?: any) => any): () => void;

  /** Listen to engine events automatically cleaned up on unload */
  on(event: string, handler: (payload?: any) => void): () => void;

  /** Register an arbitrary disposable for cleanup when the scene unloads */
  trackDisposable(disposable: { dispose: () => void }): void;
}

export interface SceneDefinition {
  id: string;
  name?: string;
  inventory?: SceneInventory | unknown;
  factories?: Record<string, ModelFactory>;
  entryPoints?: Record<string, SceneEntryPoint>;
  setup?: (context: SceneContext) => void | Promise<void>;
  enter?: (context: SceneContext) => void | Promise<void>;
  exit?: (context: SceneContext) => void | Promise<void>;
  teardown?: (context: SceneContext) => void | Promise<void>;
  metadata?: Record<string, unknown>;
}

export interface LevelDefinition {
  id: string;
  name?: string;
  scenes: SceneDefinition[];
  startScene: string;
  metadata?: Record<string, unknown>;
}

export interface GameDefinition {
  id: string;
  name?: string;
  levels: LevelDefinition[];
  startLevel: string;
  persistentEntities?: string[];
  metadata?: Record<string, unknown>;
}

export interface SwitchSceneOptions {
  persist?: string[];
  entryPoint?: string;
  transition?: string;
}
