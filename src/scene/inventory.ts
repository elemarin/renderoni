/**
 * Compact scene inventory — the token-cheap contract between
 * prompt → image → object detection → img2threejs factories → Renderoni.
 *
 * Keep this JSON small. Do not embed generated model source here.
 */

export const SCENE_ELEMENT_KINDS = ['terrain', 'prop', 'actor', 'pickup', 'decor'] as const;
export type SceneElementKind = (typeof SCENE_ELEMENT_KINDS)[number];

export const SCENE_COLLIDER_SHAPES = ['box', 'sphere', 'capsule', 'cylinder'] as const;
export type SceneColliderShape = (typeof SCENE_COLLIDER_SHAPES)[number];

export interface SceneColliderHint {
  shape: SceneColliderShape;
  /** Box [w,h,d], cylinder [radius, height], capsule [radius, height]. */
  size?: number[];
  radius?: number;
  sensor?: boolean;
}

export interface SceneElement {
  id: string;
  /** Registry key for an img2threejs `createXxxModel()` factory. */
  factory: string;
  /** Optional object-specific reconstruction image. */
  image?: string;
  kind: SceneElementKind;
  position: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: number;
  collider?: SceneColliderHint;
  tags?: string[];
  role?: string;
  /** Optional crop / region hint from the source image (normalized 0–1). */
  imageRegion?: { x: number; y: number; w: number; h: number };
}

export interface SceneInventory {
  version: 1;
  prompt: string;
  image?: string;
  seed?: number;
  elements: SceneElement[];
}

function isTuple3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number');
}

function isTuple4(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number');
}

export function parseSceneInventory(input: unknown): SceneInventory {
  if (!input || typeof input !== 'object') {
    throw new Error('Scene inventory must be an object');
  }

  const rec = input as Record<string, unknown>;
  if (typeof rec.prompt !== 'string' || rec.prompt.length === 0) {
    throw new Error('Scene inventory requires a prompt');
  }
  if (!Array.isArray(rec.elements) || rec.elements.length === 0) {
    throw new Error('Scene inventory requires at least one element');
  }

  const elements = rec.elements.map((raw, index) => parseElement(raw, index));
  const ids = new Set<string>();
  for (const el of elements) {
    if (ids.has(el.id)) throw new Error(`Duplicate scene element id: ${el.id}`);
    ids.add(el.id);
  }

  return {
    version: 1,
    prompt: rec.prompt,
    image: typeof rec.image === 'string' ? rec.image : undefined,
    seed: typeof rec.seed === 'number' ? rec.seed : undefined,
    elements,
  };
}

function parseElement(raw: unknown, index: number): SceneElement {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Scene element ${index} must be an object`);
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== 'string' || !rec.id) {
    throw new Error(`Scene element ${index} is missing id`);
  }
  if (typeof rec.factory !== 'string' || !rec.factory) {
    throw new Error(`Scene element ${rec.id} is missing factory`);
  }
  if (!SCENE_ELEMENT_KINDS.includes(rec.kind as SceneElementKind)) {
    throw new Error(`Scene element ${rec.id} has invalid kind`);
  }
  if (!isTuple3(rec.position)) {
    throw new Error(`Scene element ${rec.id} needs position [x,y,z]`);
  }

  return {
    id: rec.id,
    factory: rec.factory,
    image: typeof rec.image === 'string' ? rec.image : undefined,
    kind: rec.kind as SceneElementKind,
    position: rec.position,
    rotation: isTuple4(rec.rotation) ? rec.rotation : undefined,
    scale: typeof rec.scale === 'number' ? rec.scale : undefined,
    collider: parseCollider(rec.collider, rec.id),
    tags: Array.isArray(rec.tags) ? rec.tags.filter((t): t is string => typeof t === 'string') : undefined,
    role: typeof rec.role === 'string' ? rec.role : undefined,
    imageRegion:
      rec.imageRegion && typeof rec.imageRegion === 'object'
        ? (rec.imageRegion as SceneElement['imageRegion'])
        : undefined,
  };
}

function parseCollider(raw: unknown, id: string): SceneColliderHint | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') throw new Error(`Scene element ${id} collider is invalid`);
  const rec = raw as Record<string, unknown>;
  if (!SCENE_COLLIDER_SHAPES.includes(rec.shape as SceneColliderShape)) {
    throw new Error(`Scene element ${id} has invalid collider.shape`);
  }
  return {
    shape: rec.shape as SceneColliderShape,
    size: Array.isArray(rec.size) ? rec.size.filter((n): n is number => typeof n === 'number') : undefined,
    radius: typeof rec.radius === 'number' ? rec.radius : undefined,
    sensor: typeof rec.sensor === 'boolean' ? rec.sensor : undefined,
  };
}

export function uniqueFactories(inventory: SceneInventory): string[] {
  return [...new Set(inventory.elements.map((el) => el.factory))];
}
