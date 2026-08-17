/**
 * Renderoni Type-Safe Preset Authoring (definePreset)
 *
 * Backed by @sinclair/typebox for compile-time TS type inference
 * and runtime JSON Schema generation for AI agents via MCP.
 */

import { type TSchema, type Static } from '@sinclair/typebox';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { ResourceOwnership } from '../core/ownership.js';
import type { PRNG } from '../core/prng.js';

export interface EntityContext {
  id: string;
  native: {
    world: RAPIER.World;
    threeScene?: THREE.Scene;
  };
  events: {
    emit(event: string, payload?: unknown): void;
    on(event: string, handler: (payload: any) => void): () => void;
  };
  prng: PRNG;
  entity(config: EntityConfig): EntityInstance;
}

export interface NativeBindingConfig {
  three?: {
    object: THREE.Object3D;
    ownership?: ResourceOwnership;
  };
  rapier?: {
    body?: RAPIER.RigidBody;
    bodyHandle?: number;
    colliders?: RAPIER.Collider[];
    colliderHandles?: number[];
    ownership?: ResourceOwnership;
  };
}

export interface EntityConfig<TState extends Record<string, unknown> = Record<string, unknown>> {
  id?: string;
  tags?: string[];
  state?: TState;
  native?: NativeBindingConfig;
  actions?: Record<string, (payload?: any) => void>;
  onDestroy?: () => void;
}

export interface EntityInstance<TState extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly presetName: string;
  tags: Set<string>;
  state: TState;
  native: NativeBindingConfig;
  actions: Record<string, (payload?: any) => void>;
  slot?: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  destroy: () => void;
  onDestroy?: () => void;
}

export interface PresetDef<TSchemaType extends TSchema, TOptions = Static<TSchemaType>> {
  name: string;
  version: number;
  schema?: TSchemaType;
  create: (ctx: EntityContext, options: TOptions) => EntityInstance;
}

export interface PresetFactory<TOptions> {
  (options?: TOptions): PresetInstance<TOptions>;
  presetName: string;
  version: number;
  schema?: unknown;
}

export interface PresetInstance<TOptions = unknown> {
  presetName: string;
  version: number;
  options: TOptions;
  create: (ctx: EntityContext) => EntityInstance;
}

export function definePreset<TSchemaType extends TSchema, TOptions = Static<TSchemaType>>(
  def: PresetDef<TSchemaType, TOptions>
): PresetFactory<TOptions> {
  const factory = function (options: TOptions = {} as TOptions): PresetInstance<TOptions> {
    return {
      presetName: def.name,
      version: def.version,
      options,
      create: (ctx: EntityContext) => def.create(ctx, options),
    };
  };

  factory.presetName = def.name;
  factory.version = def.version;
  factory.schema = def.schema;

  return factory;
}
