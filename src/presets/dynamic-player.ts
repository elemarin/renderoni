/**
 * Renderoni Core Preset: dynamicPlayer
 *
 * Physics-driven rigid-body controller for marbles, rolling spheres, and dynamic vehicles.
 */

import { Type, type Static } from '@sinclair/typebox';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { definePreset, type EntityContext } from './define-preset.js';

export const DynamicPlayerOptionsSchema = Type.Object({
  id: Type.Optional(Type.String()),
  position: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
  radius: Type.Optional(Type.Number()),
  mass: Type.Optional(Type.Number()),
  linearDamping: Type.Optional(Type.Number()),
  angularDamping: Type.Optional(Type.Number()),
  moveForce: Type.Optional(Type.Number()),
  jumpImpulse: Type.Optional(Type.Number()),
  color: Type.Optional(Type.Number()),
  tags: Type.Optional(Type.Array(Type.String())),
});

export type DynamicPlayerOptions = Static<typeof DynamicPlayerOptionsSchema>;

export const dynamicPlayer = definePreset({
  name: 'renderoni.dynamicPlayer',
  version: 1,
  schema: DynamicPlayerOptionsSchema,
  create(ctx: EntityContext, options: DynamicPlayerOptions) {
    const pos = options.position ?? [0, 1, 0];
    const radius = options.radius ?? 0.5;
    const mass = options.mass ?? 1.0;
    const moveForce = options.moveForce ?? 25.0;
    const jumpImpulse = options.jumpImpulse ?? 8.0;
    const color = options.color ?? 0xff5533;

    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos[0], pos[1], pos[2]);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos[0], pos[1], pos[2])
      .setAdditionalMass(mass)
      .setLinearDamping(options.linearDamping ?? 0.5)
      .setAngularDamping(options.angularDamping ?? 0.5);

    const body = ctx.native.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(radius);
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = ctx.native.world.createCollider(colliderDesc, body);

    let moveInput = { x: 0, z: 0 };

    const tags = ['player', 'dynamic', ...(options.tags ?? [])];

    const entityInst = ctx.entity({
      id: options.id,
      tags,
      state: { moveForce, jumpImpulse },
      native: {
        three: { object: mesh, ownership: 'owned' },
        rapier: {
          body,
          bodyHandle: body.handle,
          colliders: [collider],
          colliderHandles: [collider.handle],
          ownership: 'owned',
        },
      },
      actions: {
        move: (payload: { x: number; z: number }) => {
          moveInput.x = payload.x;
          moveInput.z = payload.z;
        },
        jump: () => {
          body.applyImpulse({ x: 0, y: jumpImpulse * mass, z: 0 }, true);
        },
        applyForce: (force: [number, number, number]) => {
          body.addForce({ x: force[0], y: force[1], z: force[2] }, true);
        },
        applyImpulse: (impulse: [number, number, number]) => {
          body.applyImpulse({ x: impulse[0], y: impulse[1], z: impulse[2] }, true);
        },
      },
    });

    (entityInst as any).update = (_dt: number) => {
      if (moveInput.x !== 0 || moveInput.z !== 0) {
        body.addForce({ x: moveInput.x * moveForce, y: 0, z: moveInput.z * moveForce }, true);
      }
    };

    return entityInst;
  },
});
