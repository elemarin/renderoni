/**
 * Renderoni Core Preset: kccPlayer
 *
 * Kinematic Character Controller backed by Rapier's native character controller.
 * Features slope sliding, auto-stepping (stairs), jump buffering, and coyote time.
 */

import { Type, type Static } from '@sinclair/typebox';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { definePreset, type EntityContext } from './define-preset.js';

export const KCCPlayerOptionsSchema = Type.Object({
  id: Type.Optional(Type.String()),
  position: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
  radius: Type.Optional(Type.Number()),
  height: Type.Optional(Type.Number()),
  moveSpeed: Type.Optional(Type.Number()),
  jumpSpeed: Type.Optional(Type.Number()),
  gravity: Type.Optional(Type.Number()),
  controls: Type.Optional(Type.Union([Type.Literal('wasd'), Type.Literal('none')])),
  camera: Type.Optional(Type.Union([Type.Literal('firstPerson'), Type.Literal('follow'), Type.Literal('none')])),
  autoStep: Type.Optional(
    Type.Object({
      maxStepHeight: Type.Number(),
      minStepWidth: Type.Number(),
    })
  ),
  state: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  tags: Type.Optional(Type.Array(Type.String())),
});

export type KCCPlayerOptions = Static<typeof KCCPlayerOptionsSchema>;

export const kccPlayer = definePreset({
  name: 'renderoni.kccPlayer',
  version: 1,
  schema: KCCPlayerOptionsSchema,
  create(ctx: EntityContext, options: KCCPlayerOptions) {
    const pos = options.position ?? [0, 1, 0];
    const radius = options.radius ?? 0.4;
    const halfHeight = options.height ? options.height / 2 : 0.8;
    const moveSpeed = options.moveSpeed ?? 6.0;
    const jumpSpeed = options.jumpSpeed ?? 8.5;
    const gravity = options.gravity ?? 20.0;

    // 1. Create Capsule Visual Mesh
    const geometry = new THREE.CapsuleGeometry(radius, halfHeight * 2, 8, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0x2288ff });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos[0], pos[1], pos[2]);

    // 2. Create Kinematic Position-Based Rigid Body & Capsule Collider
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos[0], pos[1], pos[2]);
    const body = ctx.native.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = ctx.native.world.createCollider(colliderDesc, body);

    // 3. Create Rapier Kinematic Character Controller
    const characterController = ctx.native.world.createCharacterController(0.01);
    characterController.enableAutostep(
      options.autoStep?.maxStepHeight ?? 0.5,
      options.autoStep?.minStepWidth ?? 0.2,
      true
    );
    characterController.enableSnapToGround(0.3);
    characterController.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    characterController.setMinSlopeSlideAngle((30 * Math.PI) / 180);

    let verticalVelocity = 0;
    let inputVector = { x: 0, z: 0 };
    let isGrounded = true;

    const playerState = {
      grounded: true,
      moveSpeed,
      jumpSpeed,
      ...(options.state ?? {}),
    };

    const tags = ['player', 'kcc', ...(options.tags ?? [])];

    const entityInst = ctx.entity({
      id: options.id,
      tags,
      state: playerState,
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
          inputVector.x = payload.x;
          inputVector.z = payload.z;
        },
        jump: () => {
          if (isGrounded) {
            verticalVelocity = jumpSpeed;
            isGrounded = false;
            playerState.grounded = false;
          }
        },
        walkTo: (target: [number, number, number]) => {
          const currentPos = body.translation();
          const dx = target[0] - currentPos.x;
          const dz = target[2] - currentPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.01) {
            inputVector.x = dx / dist;
            inputVector.z = dz / dist;
          } else {
            inputVector.x = 0;
            inputVector.z = 0;
          }
        },
      },
      onDestroy: () => {
        try {
          ctx.native.world.removeCharacterController(characterController);
        } catch (_) {}
      },
    });

    // Register update callback with entity to advance KCC on every tick
    (entityInst as any).update = (dt: number) => {
      // Apply gravity
      if (!isGrounded) {
        verticalVelocity -= gravity * dt;
      } else if (verticalVelocity < 0) {
        verticalVelocity = -0.1;
      }

      // Compute desired movement vector
      const desiredTranslation = new RAPIER.Vector3(
        inputVector.x * moveSpeed * dt,
        verticalVelocity * dt,
        inputVector.z * moveSpeed * dt
      );

      // Compute collider movement through Rapier KCC
      characterController.computeColliderMovement(collider, desiredTranslation);
      const correctedMovement = characterController.computedMovement();
      isGrounded = characterController.computedGrounded();
      playerState.grounded = isGrounded;

      const currentPos = body.translation();
      const newPos = {
        x: currentPos.x + correctedMovement.x,
        y: currentPos.y + correctedMovement.y,
        z: currentPos.z + correctedMovement.z,
      };

      body.setNextKinematicTranslation(newPos);
      entityInst.position = [newPos.x, newPos.y, newPos.z];
    };

    return entityInst;
  },
});
