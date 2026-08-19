/**
 * Mount an img2threejs-style THREE.Group factory as a Renderoni entity.
 */

import { Type, type Static } from '@sinclair/typebox';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { definePreset, type EntityContext } from './define-preset.js';

export const ProceduralColliderSchema = Type.Object({
  shape: Type.Union([
    Type.Literal('box'),
    Type.Literal('sphere'),
    Type.Literal('capsule'),
    Type.Literal('cylinder'),
  ]),
  size: Type.Optional(Type.Array(Type.Number())),
  radius: Type.Optional(Type.Number()),
  sensor: Type.Optional(Type.Boolean()),
});

export const ProceduralModelOptionsSchema = Type.Object({
  id: Type.Optional(Type.String()),
  create: Type.Any(),
  position: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
  rotation: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number(), Type.Number()])),
  scale: Type.Optional(Type.Number()),
  type: Type.Optional(
    Type.Union([
      Type.Literal('fixed'),
      Type.Literal('dynamic'),
      Type.Literal('kinematicPositionBased'),
    ])
  ),
  collider: Type.Optional(ProceduralColliderSchema),
  mass: Type.Optional(Type.Number()),
  friction: Type.Optional(Type.Number()),
  restitution: Type.Optional(Type.Number()),
  tags: Type.Optional(Type.Array(Type.String())),
  state: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export type ProceduralModelOptions = Omit<Static<typeof ProceduralModelOptionsSchema>, 'create'> & {
  create: () => THREE.Object3D;
};

function colliderDesc(options: ProceduralModelOptions): RAPIER.ColliderDesc {
  const hint = options.collider ?? { shape: 'box' as const, size: [1, 1, 1] };
  const scale = options.scale ?? 1;
  const size = hint.size ?? [];

  let desc: RAPIER.ColliderDesc;
  if (hint.shape === 'sphere') {
    const radius = (hint.radius ?? size[0] ?? 0.5) * scale;
    desc = RAPIER.ColliderDesc.ball(radius);
  } else if (hint.shape === 'cylinder') {
    const radius = (hint.radius ?? size[0] ?? 0.5) * scale;
    const height = (size[1] ?? 1) * scale;
    desc = RAPIER.ColliderDesc.cylinder(height / 2, radius);
  } else if (hint.shape === 'capsule') {
    const radius = (hint.radius ?? size[0] ?? 0.4) * scale;
    const height = (size[1] ?? 1.6) * scale;
    desc = RAPIER.ColliderDesc.capsule(Math.max(height / 2 - radius, 0.05), radius);
  } else {
    const sx = (size[0] ?? 1) * scale;
    const sy = (size[1] ?? 1) * scale;
    const sz = (size[2] ?? 1) * scale;
    desc = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
  }

  if (hint.sensor) {
    desc.setSensor(true);
    desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    desc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
  }
  if (options.friction !== undefined) desc.setFriction(options.friction);
  if (options.restitution !== undefined) desc.setRestitution(options.restitution);
  if (options.mass !== undefined && !hint.sensor) desc.setMass(options.mass);
  return desc;
}

export const proceduralModel = definePreset({
  name: 'renderoni.proceduralModel',
  version: 1,
  schema: ProceduralModelOptionsSchema,
  create(ctx: EntityContext, options: ProceduralModelOptions) {
    const pos = options.position ?? [0, 0, 0];
    const rot = options.rotation ?? [0, 0, 0, 1];
    const object = options.create();
    object.position.set(pos[0], pos[1], pos[2]);
    object.quaternion.set(rot[0], rot[1], rot[2], rot[3]);
    if (options.scale !== undefined) object.scale.setScalar(options.scale);

    const bodyType = options.type ?? 'fixed';
    let bodyDesc: RAPIER.RigidBodyDesc;
    if (bodyType === 'dynamic') {
      bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    } else if (bodyType === 'kinematicPositionBased') {
      bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    } else {
      bodyDesc = RAPIER.RigidBodyDesc.fixed();
    }
    bodyDesc.setTranslation(pos[0], pos[1], pos[2]);
    bodyDesc.setRotation({ x: rot[0], y: rot[1], z: rot[2], w: rot[3] });

    const body = ctx.native.world.createRigidBody(bodyDesc);
    const collider = ctx.native.world.createCollider(colliderDesc(options), body);

    const tags = ['procedural', bodyType, ...(options.tags ?? [])];
    if (options.collider?.sensor) tags.push('sensor');

    return ctx.entity({
      id: options.id,
      tags,
      state: options.state ?? {},
      native: {
        three: { object, ownership: 'owned' },
        rapier: { body, colliders: [collider], colliderHandles: [collider.handle], ownership: 'owned' },
      },
    });
  },
});
