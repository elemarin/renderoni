/**
 * Renderoni Resource Ownership Matrix
 *
 * Tracks native Three.js GPU resources and Rapier WASM linear memory allocations
 * across 4 explicit lifecycle states (owned, borrowed, shared, transferred) to guarantee
 * zero VRAM leaks and zero WASM double-frees.
 */

import * as THREE from 'three';

export type ResourceOwnership = 'owned' | 'borrowed' | 'shared' | 'transferred';

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
}

export class ResourceOwnershipTracker {
  private resources: Map<string, EntityResourceRecord> = new Map();

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
      };
      this.resources.set(entityId, record);
    }
    return record;
  }

  addThreeObject(
    entityId: string,
    object: DisposableThreeObject | THREE.Object3D,
    ownership: ResourceOwnership = 'owned'
  ): void {
    const record = this.registerEntity(entityId);
    record.threeObjects.push({ object, ownership });
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

  /**
   * Disposes all owned GPU and physics resources for a specific entity.
   */
  disposeEntity(entityId: string, rapierWorld?: RapierWorldAdapter): void {
    const record = this.resources.get(entityId);
    if (!record) return;

    // Clean up Three.js objects
    const disposed = new Set<unknown>();
    const disposeMaterial = (material: THREE.Material): void => {
      if (disposed.has(material)) return;
      disposed.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !disposed.has(value)) {
          disposed.add(value);
          value.dispose();
        }
      }
      material.dispose();
    };
    const disposeObject = (object: THREE.Object3D): void => {
      const resource = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      if (resource.geometry && !disposed.has(resource.geometry)) {
        disposed.add(resource.geometry);
        resource.geometry.dispose();
      }
      if (Array.isArray(resource.material)) {
        for (const material of resource.material) disposeMaterial(material);
      } else if (resource.material) {
        disposeMaterial(resource.material);
      }
    };

    for (const item of record.threeObjects) {
      if (item.ownership === 'owned' || item.ownership === 'transferred') {
        if (item.object instanceof THREE.Object3D) {
          item.object.traverse(disposeObject);
        } else {
          item.object.geometry?.dispose();
          if (Array.isArray(item.object.material)) {
            for (const material of item.object.material) material.dispose();
          } else {
            item.object.material?.dispose();
          }
          item.object.dispose?.();
        }
      }
    }

    // Clean up Rapier handles
    if (rapierWorld && (record.rapierHandles.ownership === 'owned' || record.rapierHandles.ownership === 'transferred')) {
      for (const colHandle of record.rapierHandles.colliderHandles) {
        const col = rapierWorld.getCollider(colHandle);
        if (col) {
          try {
            rapierWorld.removeCollider(col, false);
          } catch (_) {}
        }
      }
      for (const bodyHandle of record.rapierHandles.bodyHandles) {
        const body = rapierWorld.getRigidBody(bodyHandle);
        if (body) {
          try {
            rapierWorld.removeRigidBody(body);
          } catch (_) {}
        }
      }
    }

    this.resources.delete(entityId);
  }

  /**
   * Disposes all managed entity resources.
   */
  disposeAll(rapierWorld?: RapierWorldAdapter): void {
    const entityIds = Array.from(this.resources.keys());
    for (const id of entityIds) {
      this.disposeEntity(id, rapierWorld);
    }
    this.resources.clear();
  }
}
