---
name: renderoni
description: >-
  Expert guide and workflows for building 3D simulations, games, and headless tests with Renderoni (Three.js + Rapier WASM physics).
---

# Renderoni Development Skill

This skill guides the creation of 3D games, deterministic simulations, and headless test suites using **Renderoni**.

---

## 1. Quick Game Setup Template

```ts
import { createRenderoni } from 'renderoni';
import { body, kccPlayer, sensor, light } from 'renderoni/presets';
import { audio } from 'renderoni/audio';
import { vfx } from 'renderoni/vfx';

export async function createGame(canvas?: HTMLCanvasElement) {
  const game = await createRenderoni({
    mode: canvas ? 'interactive' : 'headless',
    canvas,
    gravity: [0, -18.0, 0],
    subsystems: [
      audio({ volume: 0.8 }),
      vfx({ particles: true }),
    ],
  });

  // Add lights and floor
  game.add(light({ type: 'directional', intensity: 2.0, position: [20, 40, 20] }));
  game.add(body({ shape: 'box', type: 'fixed', size: [50, 1, 50], position: [0, -0.5, 0] }));

  // Add player
  const player = game.add(kccPlayer({ id: 'player', position: [0, 1.5, 0] }));

  return game;
}
```

---

## 2. Writing Headless Tests with Vitest

```ts
import { expect, test } from 'vitest';
import { createRenderoni } from 'renderoni';
import { kccPlayer, sensor } from 'renderoni/presets';
import 'renderoni/testing/matchers';

test('simulation advances deterministically', async () => {
  const game = await createRenderoni({ mode: 'headless', seed: 123 });
  const player = game.add(kccPlayer({ id: 'player', position: [0, 1, 0] }));
  
  player.actions.move({ x: 1, z: 0 });
  game.step(60);

  expect(game).toHaveTick(60);
  expect(player.position[0]).toBeGreaterThan(0.5);
  expect(game).toHavePassedDiagnostics();
});
```

---

## 3. Creating Custom Declarative Presets

```ts
import { definePreset } from 'renderoni/presets';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const spinningObstacle = definePreset<{ speed?: number }>('spinning_obstacle', (options, ctx) => {
  const speed = options.speed ?? 2.0;

  // 1. Create Three.js Visual Mesh
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xef4444 })
  );

  // 2. Create Rapier Kinematic Physics Body
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(0, 1, 0);
  const body = ctx.native.world.createRigidBody(bodyDesc);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(2, 0.25, 0.25);
  const collider = ctx.native.world.createCollider(colliderDesc, body);

  return ctx.entity({
    tags: ['obstacle', 'hazard'],
    native: {
      three: { object: mesh },
      rapier: { body, colliderHandles: [collider.handle] },
    },
    actions: {
      update: () => {
        body.setNextKinematicRotation(
          new RAPIER.Quaternion(0, Math.sin(ctx.id.length * speed), 0, Math.cos(ctx.id.length * speed))
        );
      },
    },
  });
});
```
