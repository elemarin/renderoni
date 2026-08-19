/**
 * Visual mesh + optional Rapier collider. Used by per-game model builders.
 */

import { Type, type Static } from '@sinclair/typebox';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { definePreset, type EntityContext } from './define-preset.js';

export const MeshOptionsSchema = Type.Object({
  id: Type.Optional(Type.String()),
  geometry: Type.Optional(
    Type.Union([
      Type.Literal('box'),
      Type.Literal('sphere'),
      Type.Literal('cylinder'),
      Type.Literal('capsule'),
      Type.Literal('cone'),
    ])
  ),
  customGeometry: Type.Optional(Type.Any()),
  material: Type.Optional(Type.Any()),
  size: Type.Optional(Type.Array(Type.Number())),
  color: Type.Optional(Type.Number()),
  position: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
  physics: Type.Optional(Type.Union([Type.Literal('static'), Type.Literal('dynamic'), Type.Literal('none')])),
  tags: Type.Optional(Type.Array(Type.String())),
  state: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export type MeshOptions = Omit<Static<typeof MeshOptionsSchema>, 'customGeometry' | 'material'> & {
  customGeometry?: THREE.BufferGeometry;
  material?: THREE.Material;
};

function makeGeometry(options: MeshOptions): THREE.BufferGeometry {
  if (options.customGeometry) return options.customGeometry;
  const shape = options.geometry ?? 'box';
  const size = options.size ?? [1, 1, 1];
  if (shape === 'sphere') return new THREE.SphereGeometry(options.size?.[0] ?? 0.5, 16, 16);
  if (shape === 'cylinder') {
    const r = size[0] ?? 0.5;
    const h = size[2] ?? size[1] ?? 1;
    return new THREE.CylinderGeometry(r, size[1] ?? r, h, 16);
  }
  if (shape === 'capsule') return new THREE.CapsuleGeometry(size[0] ?? 0.4, size[1] ?? 1.2, 6, 12);
  if (shape === 'cone') return new THREE.ConeGeometry(size[0] ?? 0.5, size[1] ?? 1, 12);
  return new THREE.BoxGeometry(size[0] ?? 1, size[1] ?? 1, size[2] ?? 1);
}

function makeCollider(options: MeshOptions, object: THREE.Object3D): RAPIER.ColliderDesc | null {
  if ((options.physics ?? 'none') === 'none') return null;
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  return RAPIER.ColliderDesc.cuboid(Math.max(size.x / 2, 0.05), Math.max(size.y / 2, 0.05), Math.max(size.z / 2, 0.05));
}

export const mesh = definePreset({
  name: 'renderoni.mesh',
  version: 1,
  schema: MeshOptionsSchema,
  create(ctx: EntityContext, options: MeshOptions) {
    const pos = options.position ?? [0, 0, 0];
    const geometry = makeGeometry(options);
    const material =
      options.material ?? new THREE.MeshStandardMaterial({ color: options.color ?? 0x94a3b8, roughness: 0.8 });
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.depthTest = true;
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = false;
    object.receiveShadow = true;
    object.position.set(pos[0], pos[1], pos[2]);

    const physics = options.physics ?? 'none';
    let body: RAPIER.RigidBody | undefined;
    let collider: RAPIER.Collider | undefined;
    if (physics !== 'none') {
      const desc =
        physics === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
      desc.setTranslation(pos[0], pos[1], pos[2]);
      body = ctx.native.world.createRigidBody(desc);
      const col = makeCollider(options, object);
      if (col) collider = ctx.native.world.createCollider(col, body);
    }

    return ctx.entity({
      id: options.id,
      tags: options.tags ?? [],
      state: options.state ?? {},
      native: {
        three: { object, ownership: 'owned' },
        rapier: body
          ? { body, colliders: collider ? [collider] : [], colliderHandles: collider ? [collider.handle] : [], ownership: 'owned' }
          : undefined,
      },
    });
  },
});
