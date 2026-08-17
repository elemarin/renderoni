/**
 * Renderoni Core Preset: Sensor
 *
 * Implements trigger volumes for overlap detection (sensor.enter, sensor.exit).
 */

import { Type, type Static } from '@sinclair/typebox';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { definePreset, type EntityContext } from './define-preset.js';

export const SensorShapeSchema = Type.Union([
  Type.Literal('box'),
  Type.Literal('sphere'),
  Type.Literal('cylinder'),
]);

export const SensorOptionsSchema = Type.Object({
  id: Type.Optional(Type.String()),
  shape: Type.Optional(SensorShapeSchema),
  size: Type.Optional(Type.Array(Type.Number())), // [width, height, depth]
  radius: Type.Optional(Type.Number()),
  position: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
  tags: Type.Optional(Type.Array(Type.String())),
  debugMesh: Type.Optional(Type.Boolean()),
});

export type SensorOptions = Static<typeof SensorOptionsSchema>;

export const sensor = definePreset({
  name: 'renderoni.sensor',
  version: 1,
  schema: SensorOptionsSchema,
  create(ctx: EntityContext, options: SensorOptions) {
    const shape = options.shape ?? 'box';
    const pos = options.position ?? [0, 0, 0];

    let colliderDesc: RAPIER.ColliderDesc;
    let geometry: THREE.BufferGeometry | null = null;

    if (shape === 'sphere') {
      const radius = options.radius ?? (options.size?.[0] ? options.size[0] / 2 : 1.0);
      colliderDesc = RAPIER.ColliderDesc.ball(radius);
      if (options.debugMesh) geometry = new THREE.SphereGeometry(radius, 8, 8);
    } else if (shape === 'cylinder') {
      const radius = options.radius ?? 1.0;
      const height = options.size?.[1] ?? 2.0;
      colliderDesc = RAPIER.ColliderDesc.cylinder(height / 2, radius);
      if (options.debugMesh) geometry = new THREE.CylinderGeometry(radius, radius, height, 8);
    } else {
      const sx = options.size?.[0] ?? 1.0;
      const sy = options.size?.[1] ?? 1.0;
      const sz = options.size?.[2] ?? 1.0;
      colliderDesc = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
      if (options.debugMesh) geometry = new THREE.BoxGeometry(sx, sy, sz);
    }

    colliderDesc.setSensor(true);
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    colliderDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);

    // Fixed sensor body
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2]);
    const body = ctx.native.world.createRigidBody(bodyDesc);
    const collider = ctx.native.world.createCollider(colliderDesc, body);

    let mesh: THREE.Object3D;
    if (geometry) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true });
      mesh = new THREE.Mesh(geometry, mat);
    } else {
      mesh = new THREE.Group();
    }
    mesh.position.set(pos[0], pos[1], pos[2]);

    const tags = ['sensor', shape, ...(options.tags ?? [])];

    return ctx.entity({
      id: options.id,
      tags,
      state: { overlappingCount: 0 },
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
    });
  },
});
