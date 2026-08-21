/**
 * Renderoni Resource Ownership Matrix
 *
 * Tracks native Three.js GPU resources and Rapier WASM linear memory allocations
 * across 4 explicit lifecycle states (owned, borrowed, shared, transferred) to guarantee
 * zero VRAM leaks and zero WASM double-frees.
 *
 * `owned` and `transferred` resources are refcounted globally, so geometries and
 * materials shared by clones survive until the last holder is removed.
 * `borrowed` and `shared` resources belong to the caller and are never disposed
 * by the engine.
 */

import * as THREE from 'three';

export type ResourceOwnership = 'owned' | 'borrowed' | 'shared' | 'transferred';

export interface DisposableResource {
  dispose: () => void;
}

export interface DisposableThreeObject {
  geometry?: { dispose: () => void };
  material?: { dispose: () => void } | Array<{ dispose: () => void }>;
  dispose?: () => void;
  [key: string]: unknown;
}

export interface RapierWorldAdapter {
  removeRigidBody(body: unknown): void;
  removeCollider(collider: unknown, wakeUp: boolean): void;
  getRigidBody(handle: number): unknown;
  getCollider(handle: number): unknown;
}

export interface EntityResourceRecord {
  entityId: string;
  threeObjects: Array<{ object: DisposableThreeObject | THREE.Object3D; ownership: ResourceOwnership }>;
  rapierHandles: {
    bodyHandles: number[];
    colliderHandles: number[];
    ownership: ResourceOwnership;
  };
  /** Engine-created GPU resources this entity holds a disposal reference to. */
  ownedResources: Set<DisposableResource>;
  /** Caller-provided GPU resources the engine must never dispose. */
  borrowedResources: Set<DisposableResource>;
}

function isDisposable(value: unknown): value is DisposableResource {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { dispose?: unknown }).dispose === 'function'
  );
}

/**
 * Disposable resources reachable from an object graph, split by who owns them.
 *
 * A borrowed material owns its texture graph: the caller keeps every texture
 * hanging off it, including textures attached after the entity was registered.
 */
export interface ResourceClassification {
  owned: Set<DisposableResource>;
  borrowed: Set<DisposableResource>;
}

function classifyMaterial(
  material: THREE.Material,
  borrowedRoots: ReadonlySet<DisposableResource>,
  visitedMaterials: Set<THREE.Material>,
  out: ResourceClassification
): void {
  if (visitedMaterials.has(material)) return;
  visitedMaterials.add(material);

  const materialIsBorrowed = borrowedRoots.has(material);
  (materialIsBorrowed ? out.borrowed : out.owned).add(material);

  for (const value of Object.values(material)) {
    if (!(value instanceof THREE.Texture)) continue;
    // Textures of a borrowed material belong to the caller, whenever they were attached.
    const textureIsBorrowed = materialIsBorrowed || borrowedRoots.has(value);
    (textureIsBorrowed ? out.borrowed : out.owned).add(value);
  }
}

function classifyNode(
  node: unknown,
  borrowedRoots: ReadonlySet<DisposableResource>,
  visitedMaterials: Set<THREE.Material>,
  out: ResourceClassification
): void {
  const resource = node as {
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material | THREE.Material[];
    dispose?: unknown;
  };

  if (resource.geometry && isDisposable(resource.geometry)) {
    (borrowedRoots.has(resource.geometry) ? out.borrowed : out.owned).add(resource.geometry);
  }

  if (Array.isArray(resource.material)) {
    for (const material of resource.material) {
      classifyMaterial(material, borrowedRoots, visitedMaterials, out);
    }
  } else if (resource.material) {
    classifyMaterial(resource.material, borrowedRoots, visitedMaterials, out);
  }

  if (typeof resource.dispose === 'function') {
    const self = node as DisposableResource;
    (borrowedRoots.has(self) ? out.borrowed : out.owned).add(self);
  }
}

/**
 * Walks an object graph and classifies every disposable resource it reaches.
 *
 * Always re-scans materials instead of short-circuiting on resources that are
 * already known, so textures attached after registration are discovered at
 * cleanup. Cloned Three.js objects share geometries and materials, so the same
 * resource can be reachable from several entities; callers refcount the result
 * instead of disposing eagerly.
 */
export function classifyObjectResources(
  object: DisposableThreeObject | THREE.Object3D,
  borrowedRoots: ReadonlySet<DisposableResource> = new Set()
): ResourceClassification {
  const out: ResourceClassification = { owned: new Set(), borrowed: new Set() };
  const visitedMaterials = new Set<THREE.Material>();

  if (object instanceof THREE.Object3D) {
    object.traverse((child) => classifyNode(child, borrowedRoots, visitedMaterials, out));
  } else {
    classifyNode(object, borrowedRoots, visitedMaterials, out);
  }

  return out;
}

export class ResourceOwnershipTracker {
  private resources: Map<string, EntityResourceRecord> = new Map();
  /** How many live entities would dispose each engine-created resource. */
  private ownedRefCounts: Map<DisposableResource, number> = new Map();
  /** How many live entities borrowed each resource; borrowed resources are never disposed. */
  private borrowedRefCounts: Map<DisposableResource, number> = new Map();
  /** Resources whose last owner is gone but which a borrower still holds. */
  private pendingDisposal: Set<DisposableResource> = new Set();

  /** Number of entities with tracked resources; returns to baseline after cleanup. */
  get entityCount(): number {
    return this.resources.size;
  }

  registerEntity(entityId: string): EntityResourceRecord {
    let record = this.resources.get(entityId);
    if (!record) {
      record = {
        entityId,
        threeObjects: [],
        rapierHandles: {
          bodyHandles: [],
          colliderHandles: [],
          ownership: 'owned',
        },
        ownedResources: new Set(),
        borrowedResources: new Set(),
      };
      this.resources.set(entityId, record);
    }
    return record;
  }

  addThreeObject(
    entityId: string,
    object: DisposableThreeObject | THREE.Object3D,
    ownership: ResourceOwnership = 'owned',
    borrowed: Iterable<DisposableResource> = []
  ): void {
    const record = this.registerEntity(entityId);
    record.threeObjects.push({ object, ownership });

    // Caller-provided roots are protected first, so the graph walk can treat
    // their whole sub-graph (a material and its textures) as borrowed.
    for (const resource of borrowed) {
      if (isDisposable(resource)) this.protectResource(record, resource);
    }

    const classified = classifyObjectResources(object, record.borrowedResources);
    for (const resource of classified.borrowed) this.protectResource(record, resource);

    if (ownership === 'owned' || ownership === 'transferred') {
      for (const resource of classified.owned) this.retainOwned(record, resource);
    } else {
      // Borrowed and shared object graphs belong to the caller end to end.
      for (const resource of classified.owned) this.protectResource(record, resource);
    }
  }

  /** Declares caller-provided resources the engine must never dispose. */
  markBorrowed(entityId: string, resources: Iterable<DisposableResource>): void {
    const record = this.registerEntity(entityId);
    for (const resource of resources) {
      if (isDisposable(resource)) this.protectResource(record, resource);
    }
  }

  addRapierHandles(
    entityId: string,
    bodyHandles: number[],
    colliderHandles: number[],
    ownership: ResourceOwnership = 'owned'
  ): void {
    const record = this.registerEntity(entityId);
    record.rapierHandles.bodyHandles.push(...bodyHandles);
    record.rapierHandles.colliderHandles.push(...colliderHandles);
    record.rapierHandles.ownership = ownership;
  }

  /** True while at least one live entity borrowed the resource. */
  isBorrowed(resource: DisposableResource): boolean {
    return this.borrowedRefCounts.has(resource);
  }

  /** How many live entities would dispose the resource; 0 when untracked. */
  getOwnedRefCount(resource: DisposableResource): number {
    return this.ownedRefCounts.get(resource) ?? 0;
  }

  /** True while disposal is deferred until the last borrower releases it. */
  isDisposalPending(resource: DisposableResource): boolean {
    return this.pendingDisposal.has(resource);
  }

  /**
   * Disposes the GPU and physics resources this entity is the last owner of.
   *
   * Object graphs are re-scanned first, so resources attached after
   * registration are reconciled before anything is released: late textures on
   * an engine-owned material become owned, late textures on a caller-provided
   * material stay borrowed, and resources another live entity still renders
   * with are adopted by that entity instead of being disposed.
   *
   * Every cleanup step runs even when one throws. Failures are returned so the
   * engine can report and aggregate them instead of losing them.
   */
  disposeEntity(entityId: string, rapierWorld?: RapierWorldAdapter): unknown[] {
    const record = this.resources.get(entityId);
    if (!record) return [];
    // Delete first so a disposal side effect cannot re-enter this record.
    this.resources.delete(entityId);

    const errors: unknown[] = [];
    const lateResources = new Set<DisposableResource>();

    for (const item of record.threeObjects) {
      if (item.ownership !== 'owned' && item.ownership !== 'transferred') continue;

      const classified = classifyObjectResources(item.object, record.borrowedResources);
      for (const resource of classified.borrowed) this.protectResource(record, resource);
      for (const resource of classified.owned) {
        if (record.ownedResources.has(resource) || record.borrowedResources.has(resource)) continue;
        const wasTracked = this.ownedRefCounts.has(resource);
        this.retainOwned(record, resource);
        if (!wasTracked) lateResources.add(resource);
      }
    }

    // A resource discovered only now may also hang off a live entity's graph;
    // let that entity claim it before this record gives its reference back.
    this.adoptLateResources(lateResources);

    for (const resource of record.ownedResources) {
      this.releaseOwned(resource, errors);
    }
    for (const resource of record.borrowedResources) {
      this.releaseBorrowed(resource, errors);
    }
    record.borrowedResources.clear();
    record.ownedResources.clear();

    // Clean up Rapier handles
    if (rapierWorld && (record.rapierHandles.ownership === 'owned' || record.rapierHandles.ownership === 'transferred')) {
      for (const colHandle of record.rapierHandles.colliderHandles) {
        const col = rapierWorld.getCollider(colHandle);
        if (col) {
          try {
            rapierWorld.removeCollider(col, false);
          } catch (error) {
            errors.push(error);
          }
        }
      }
      for (const bodyHandle of record.rapierHandles.bodyHandles) {
        const body = rapierWorld.getRigidBody(bodyHandle);
        if (body) {
          try {
            rapierWorld.removeRigidBody(body);
          } catch (error) {
            errors.push(error);
          }
        }
      }
    }

    return errors;
  }

  /**
   * Lets live entities claim resources that were attached to their object
   * graphs after registration, so a shared late attachment is not disposed
   * while another entity still renders with it.
   */
  private adoptLateResources(lateResources: Set<DisposableResource>): void {
    if (lateResources.size === 0) return;

    for (const record of this.resources.values()) {
      for (const item of record.threeObjects) {
        if (item.ownership !== 'owned' && item.ownership !== 'transferred') continue;

        const classified = classifyObjectResources(item.object, record.borrowedResources);
        for (const resource of classified.borrowed) {
          if (lateResources.has(resource)) this.protectResource(record, resource);
        }
        for (const resource of classified.owned) {
          if (lateResources.has(resource)) this.retainOwned(record, resource);
        }
      }
    }
  }

  /**
   * Disposes all managed entity resources and reports every failure.
   */
  disposeAll(rapierWorld?: RapierWorldAdapter): unknown[] {
    const errors: unknown[] = [];
    const entityIds = Array.from(this.resources.keys());
    for (const id of entityIds) {
      errors.push(...this.disposeEntity(id, rapierWorld));
    }
    this.resources.clear();
    this.ownedRefCounts.clear();
    this.borrowedRefCounts.clear();
    this.pendingDisposal.clear();
    return errors;
  }

  private retainOwned(record: EntityResourceRecord, resource: DisposableResource): void {
    if (record.borrowedResources.has(resource)) return;
    if (record.ownedResources.has(resource)) return;
    record.ownedResources.add(resource);
    // A new owner cancels a disposal that was waiting on the last borrower.
    this.pendingDisposal.delete(resource);
    this.ownedRefCounts.set(resource, (this.ownedRefCounts.get(resource) ?? 0) + 1);
  }

  private protectResource(record: EntityResourceRecord, resource: DisposableResource): void {
    if (record.borrowedResources.has(resource)) return;
    record.borrowedResources.add(resource);
    this.borrowedRefCounts.set(resource, (this.borrowedRefCounts.get(resource) ?? 0) + 1);
  }

  private releaseOwned(resource: DisposableResource, errors: unknown[]): void {
    const remaining = (this.ownedRefCounts.get(resource) ?? 1) - 1;
    if (remaining > 0) {
      this.ownedRefCounts.set(resource, remaining);
      return;
    }

    this.ownedRefCounts.delete(resource);

    // A borrower still renders with it: hand disposal over to the last borrow
    // release instead of dropping the claim, which used to leak the resource.
    if (this.borrowedRefCounts.has(resource)) {
      this.pendingDisposal.add(resource);
      return;
    }

    this.disposeResource(resource, errors);
  }

  private releaseBorrowed(resource: DisposableResource, errors: unknown[]): void {
    const remaining = (this.borrowedRefCounts.get(resource) ?? 1) - 1;
    if (remaining > 0) {
      this.borrowedRefCounts.set(resource, remaining);
      return;
    }

    this.borrowedRefCounts.delete(resource);
    if (!this.pendingDisposal.has(resource)) return;

    this.pendingDisposal.delete(resource);
    // Only resources the engine still owned when the borrow ended are disposed;
    // purely caller-provided resources are never touched.
    if (!this.ownedRefCounts.has(resource)) {
      this.disposeResource(resource, errors);
    }
  }

  /**
   * Disposes one resource, keeping bookkeeping complete even when the native
   * `dispose()` throws. The failure is collected so it reaches the caller.
   */
  private disposeResource(resource: DisposableResource, errors: unknown[]): void {
    try {
      resource.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
}
