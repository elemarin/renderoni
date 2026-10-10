/**
 * Renderoni Core Preset: Body
 *
 * Wraps Three.js visual meshes with Rapier 3D rigid bodies and colliders.
 */

import { Type, type Static } from '@sinclair/typebox';
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { definePreset, type EntityContext } from './define-preset.js';

export const BodyShapeSchema = Type.Union([
  Type.Literal('box'),
  Type.Literal('sphere'),
  Type.Literal('cylinder'),
  Type.Literal('capsule'),
]);

export const BodyTypeSchema = Type.Union([
  Type.Literal('fixed'),
  Type.Literal('dynamic'),
  Type.Literal('kinematicPositionBased'),
  Type.Literal('kinematicVelocityBased'),
]);

export const BodyOptionsSchema = Type.Object({
  id: Type.Optional(Type.String()),
  shape: Type.Optional(BodyShapeSchema),
  type: Type.Optional(BodyTypeSchema),
  size: Type.Optional(Type.Array(Type.Number())), // [width, height, depth] or [radius] or [radius, height]
  radius: Type.Optional(Type.Number()),
  position: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
  rotation: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number(), Type.Number()])),
  mass: Type.Optional(Type.Number()),
  color: Type.Optional(Type.Number()),
  friction: Type.Optional(Type.Number()),
  restitution: Type.Optional(Type.Number()),
  visible: Type.Optional(Type.Boolean()),
  tags: Type.Optional(Type.Array(Type.String())),
});

export type BodyOptions = Static<typeof BodyOptionsSchema>;

export const body = definePreset({
  name: 'renderoni.body',
  version: 1,
  schema: BodyOptionsSchema,
  create(ctx: EntityContext, options: BodyOptions) {
    // Throws RND_0412 up front when the engine runs without physics.
    const R = ctx.native.rapier;
    const shape = options.shape ?? 'box';
    const bodyType = options.type ?? 'fixed';
    const pos = options.position ?? [0, 0, 0];
    const color = options.color ?? 0x8b5a2b;

    // 1. Create Three.js Mesh
    let geometry: THREE.BufferGeometry;
    let colliderDesc: RAPIER.ColliderDesc;

    if (shape === 'sphere') {
      const radius = options.radius ?? (options.size?.[0] ? options.size[0] / 2 : 0.5);
      geometry = new THREE.SphereGeometry(radius, 16, 16);
      colliderDesc = R.ColliderDesc.ball(radius);
    } else if (shape === 'cylinder') {
      const radius = options.radius ?? 0.5;
      const height = options.size?.[1] ?? 2.0;
      geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
      colliderDesc = R.ColliderDesc.cylinder(height / 2, radius);
    } else if (shape === 'capsule') {
      const radius = options.radius ?? 0.5;
      const halfHeight = options.size?.[1] ? options.size[1] / 2 : 1.0;
      geometry = new THREE.CapsuleGeometry(radius, halfHeight * 2, 8, 16);
      colliderDesc = R.ColliderDesc.capsule(halfHeight, radius);
    } else {
      // Default: box
      const sx = options.size?.[0] ?? 1.0;
      const sy = options.size?.[1] ?? 1.0;
      const sz = options.size?.[2] ?? 1.0;
      geometry = new THREE.BoxGeometry(sx, sy, sz);
      colliderDesc = R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
    }

    const material = new THREE.MeshStandardMaterial({ color });
    const mesh = options.visible === false ? new THREE.Group() : new THREE.Mesh(geometry, material);
    if (options.visible === false) {
      geometry.dispose();
      material.dispose();
    }
    mesh.position.set(pos[0], pos[1], pos[2]);

    if (options.rotation) {
      mesh.quaternion.set(options.rotation[0], options.rotation[1], options.rotation[2], options.rotation[3]);
    }

    // 2. Create Rapier Rigid Body & Collider
    let rigidBodyDesc: RAPIER.RigidBodyDesc;
    if (bodyType === 'dynamic') {
      rigidBodyDesc = R.RigidBodyDesc.dynamic();
    } else if (bodyType === 'kinematicPositionBased') {
      rigidBodyDesc = R.RigidBodyDesc.kinematicPositionBased();
    } else if (bodyType === 'kinematicVelocityBased') {
      rigidBodyDesc = R.RigidBodyDesc.kinematicVelocityBased();
    } else {
      rigidBodyDesc = R.RigidBodyDesc.fixed();
    }

    rigidBodyDesc.setTranslation(pos[0], pos[1], pos[2]);
    if (options.rotation) {
      rigidBodyDesc.setRotation({
        x: options.rotation[0],
        y: options.rotation[1],
        z: options.rotation[2],
        w: options.rotation[3],
      });
    }

    if (options.mass !== undefined && bodyType === 'dynamic') {
      rigidBodyDesc.setAdditionalMass(options.mass);
    }

    const rigidBody = ctx.native.world.createRigidBody(rigidBodyDesc);

    if (options.friction !== undefined) {
      colliderDesc.setFriction(options.friction);
    }
    if (options.restitution !== undefined) {
      colliderDesc.setRestitution(options.restitution);
    }
    colliderDesc.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    colliderDesc.setActiveCollisionTypes(R.ActiveCollisionTypes.ALL);

    const collider = ctx.native.world.createCollider(colliderDesc, rigidBody);

    const tags = ['body', shape, ...(options.tags ?? [])];

    return ctx.entity({
      id: options.id,
      tags,
      state: {},
      native: {
        three: { object: mesh, ownership: 'owned' },
        rapier: {
          body: rigidBody,
          bodyHandle: rigidBody.handle,
          colliders: [collider],
          colliderHandles: [collider.handle],
          ownership: 'owned',
        },
      },
    });
  },
});
