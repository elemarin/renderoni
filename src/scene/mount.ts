/**
 * Instantiate a compact scene inventory against a factory registry.
 */

import type { RenderoniEngine } from '../core/engine.js';
import type { EntityInstance } from '../presets/define-preset.js';
import { proceduralModel } from '../presets/procedural-model.js';
import * as THREE from 'three';
import {
  parseSceneInventory,
  type SceneElement,
  type SceneInventory,
} from './inventory.js';

export type ModelFactory = () => THREE.Object3D;

export interface MountSceneOptions {
  /** Fallback factory when a registry key is missing. */
  fallback?: (element: SceneElement) => ModelFactory;
}

export function createFallbackFactory(element: SceneElement): ModelFactory {
  return () => {
    const group = new THREE.Group();
    const hint = element.collider;
    const size = hint?.size ?? [1, 1, 1];
    const color =
      element.kind === 'pickup' ? 0xfbbf24 : element.kind === 'actor' ? 0x38bdf8 : 0x94a3b8;

    let mesh: THREE.Mesh;
    if (hint?.shape === 'sphere') {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(hint.radius ?? size[0] ?? 0.5, 12, 12),
        new THREE.MeshStandardMaterial({ color })
      );
    } else if (hint?.shape === 'cylinder') {
      const radius = hint.radius ?? size[0] ?? 0.4;
      const height = size[1] ?? 1;
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 12),
        new THREE.MeshStandardMaterial({ color })
      );
    } else if (hint?.shape === 'capsule') {
      const radius = hint.radius ?? size[0] ?? 0.35;
      const height = size[1] ?? 1.4;
      mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius, Math.max(height - radius * 2, 0.1), 6, 10),
        new THREE.MeshStandardMaterial({ color })
      );
    } else {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size[0] ?? 1, size[1] ?? 1, size[2] ?? 1),
        new THREE.MeshStandardMaterial({ color })
      );
    }
    group.add(mesh);
    group.name = element.factory;
    return group;
  };
}

export function mountSceneInventory(
  engine: RenderoniEngine,
  inventoryOrJson: SceneInventory | unknown,
  factories: Record<string, ModelFactory>,
  options: MountSceneOptions = {}
): EntityInstance[] {
  const inventory = parseSceneInventory(inventoryOrJson);
  const fallback = options.fallback ?? createFallbackFactory;
  const spawned: EntityInstance[] = [];

  for (const element of inventory.elements) {
    const create = factories[element.factory] ?? fallback(element);
    const type =
      element.kind === 'actor'
        ? 'kinematicPositionBased'
        : element.kind === 'pickup'
          ? 'kinematicPositionBased'
          : 'fixed';

    spawned.push(
      engine.add(
        proceduralModel({
          id: element.id,
          create,
          position: element.position,
          rotation: element.rotation,
          scale: element.scale,
          type,
          collider: element.collider,
          tags: [element.kind, ...(element.role ? [element.role] : []), ...(element.tags ?? [])],
          state: { factory: element.factory, role: element.role, kind: element.kind },
        })
      )
    );
  }

  return spawned;
}
