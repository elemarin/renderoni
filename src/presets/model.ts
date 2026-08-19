/**
 * Mount a THREE.Object3D factory result (img2threejs-style Group) as an entity.
 */

import { Type, type Static } from '@sinclair/typebox';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { definePreset, type EntityContext } from './define-preset.js';

export const ModelOptionsSchema = Type.Object({
  id: Type.Optional(Type.String()),
  object: Type.Any(),
  position: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
  physics: Type.Optional(Type.Union([Type.Literal('static'), Type.Literal('dynamic'), Type.Literal('none')])),
  colliderShape: Type.Optional(Type.Union([Type.Literal('box'), Type.Literal('sphere'), Type.Literal('cylinder')])),
  colliderSize: Type.Optional(Type.Array(Type.Number())),
  tags: Type.Optional(Type.Array(Type.String())),
  state: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export type ModelOptions = Omit<Static<typeof ModelOptionsSchema>, 'object'> & {
  object: THREE.Object3D;
};

export const model = definePreset({
  name: 'renderoni.model',
  version: 1,
  schema: ModelOptionsSchema,
  create(ctx: EntityContext, options: ModelOptions) {
    const pos = options.position ?? [0, 0, 0];
    const object = options.object;
    object.position.set(pos[0], pos[1], pos[2]);

    const physics = options.physics ?? 'none';
    let body: RAPIER.RigidBody | undefined;
    let collider: RAPIER.Collider | undefined;

    if (physics !== 'none') {
      const desc =
        physics === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
      desc.setTranslation(pos[0], pos[1], pos[2]);
      body = ctx.native.world.createRigidBody(desc);

      const size = options.colliderSize ?? [1, 1, 1];
      let col: RAPIER.ColliderDesc;
      if (options.colliderShape === 'sphere') {
        col = RAPIER.ColliderDesc.ball(size[0] ?? 0.5);
      } else if (options.colliderShape === 'cylinder') {
        col = RAPIER.ColliderDesc.cylinder((size[1] ?? 1) / 2, size[0] ?? 0.5);
      } else {
        col = RAPIER.ColliderDesc.cuboid((size[0] ?? 1) / 2, (size[1] ?? 1) / 2, (size[2] ?? 1) / 2);
      }
      collider = ctx.native.world.createCollider(col, body);
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
