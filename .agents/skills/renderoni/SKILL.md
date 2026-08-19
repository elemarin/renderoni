---
name: renderoni
description: >-
  Comprehensive guide and best practices for building high-performance 3D games, deterministic simulations, and headless test suites with Renderoni, Three.js, and Rapier WASM physics.
---

# 🍝 Renderoni: Master 3D Game Development & Optimization Guide

This skill provides comprehensive architectural guidelines, Three.js optimization patterns, Rapier WASM physics practices, and agent-native workflows for developing production-grade 3D web games with Renderoni.

---

## 📑 Table of Contents
1. [The Renderoni Philosophy: Ecosystem Force Multiplier](#1-the-renderoni-philosophy-ecosystem-force-multiplier)
2. [Core Architectural Principles & Determinism](#2-core-architectural-principles--determinism)
3. [Leveraging Existing Three.js & Rapier Ecosystems (Zero Lock-In)](#3-leveraging-existing-threejs--rapier-ecosystems-zero-lock-in)
4. [Three.js Performance & Optimization Mastery](#4-threejs-performance--optimization-mastery)
5. [Rapier Physics & Character Controller Best Practices](#5-rapier-physics--character-controller-best-practices)
6. [Game Architecture & Declarative Presets](#6-game-architecture--declarative-presets)
7. [Camera, Input & Audio Systems](#7-camera-input--audio-systems)
8. [VFX, Particles & Juice](#8-vfx-particles--juice)
9. [Headless Testing & Agent Verification](#9-headless-testing--agent-verification)
10. [Prompt-to-Scene (img2threejs)](#10-prompt-to-scene-img2threejs)

---

## 1. The Renderoni Philosophy: Ecosystem Force Multiplier

Renderoni is **not** a proprietary walled garden or a new DSL. It is designed to be the glue and force-multiplier for the two industry standards of 3D web development: **Three.js** and **Rapier WebAssembly Physics**.

```
┌─────────────────────────────────────────────────────────────┐
│                 YOUR GAMEPLAY & CREATIVITY                  │
│       GLTF Models • Custom Shaders • Game Rules • Content   │
├─────────────────────────────────────────────────────────────┤
│                         RENDERONI                           │
│  Fixed Timestep Loop • Dual-Buffer Transform Interpolation │
│  Character Controllers • Spatial Audio • Particle Pools     │
│  State Hashing • Headless CI Testing • Built-in MCP Tools   │
├──────────────────────────────┬──────────────────────────────┤
│           Three.js           │          Rapier WASM         │
│  (Shaders, WebGL/WebGPU, PBR)│  (Fast Multi-threaded Physics)│
└──────────────────────────────┴──────────────────────────────┘
```

### What Developers Get Out of the Box:
- **No Hand-Rolled Game Loops**: Automatic fixed-timestep accumulator with zero visual jitter on 60Hz, 120Hz, or 144Hz monitors via dual-buffer transform interpolation.
- **No Physics Boilerplate**: Out-of-the-box Kinematic Character Controllers (climbing slopes, sliding against walls, jumping, step height).
- **Direct Native Escape Hatches**: Direct access to `THREE.Scene`, `THREE.WebGLRenderer`, and `RAPIER.World` whenever needed.
- **$<10\text{ms}$ Headless CI**: Game logic and physics run headlessly in Node.js without browser automation or mock DOMs.
- **Agent-Native MCP**: Built-in Model Context Protocol server enabling AI agents (Claude, Antigravity, Cursor) to inspect scenes and test gameplay deterministically.

---

## 2. Core Architectural Principles & Determinism

Renderoni is built around a **strict 4-layer separation of concerns**:
- **L0 (Deterministic Kernel)**: Integer clock (`clock.ts`), seeded PRNG (`prng.ts`), dual-buffer transform pipeline (`transform-buffer.ts`), XXH3 state hashing (`hashing.ts`), and resource ownership tracking (`ownership.ts`).
- **L1 (Batteries & Subsystems)**: Declarative presets (`body`, `sensor`, `light`, `kccPlayer`, `dynamicPlayer`), spatial audio, animations, VFX, UI anchors.
- **L2 (Tooling & Agents)**: MCP server, Vitest matchers, AST check engine, replay CLI.
- **L3 (Application & Demos)**: Game content, shaders, game rules.

### 🛡️ The 3 Golden Rules of Determinism:
1. **Never use non-deterministic sources in gameplay logic**:
   - ❌ `Math.random()`, `Date.now()`, `performance.now()`, `requestAnimationFrame()`.
   - ✅ Always use `ctx.prng.next()`, `engine.prng`, and integer `engine.clock.tick`.
2. **Never bypass the Dual-Buffer Transform Pipeline**:
   - Physics writes transforms into canonical buffer slots (`transformPipeline.setTransform()`).
   - Three.js meshes read interpolated transforms (`transformPipeline.getInterpolated()`) during rendering. Never mutate render matrices directly inside physics updates.
3. **Quantized State Hashing**:
   - Transform coordinates are quantized into fixed-point representations ($Q20.12$) before XXH3 hashing to prevent IEEE 754 floating-point divergence across platforms.

---

## 3. Leveraging Existing Three.js & Rapier Ecosystems (Zero Lock-In)

Developers can bring any Three.js loader, shader, or Rapier feature directly into Renderoni:

### A. Loading 3D Models with `GLTFLoader`
```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { definePreset } from 'renderoni/presets';
import RAPIER from '@dimforge/rapier3d-compat';

export const animatedCharacter = definePreset<{ gltfUrl: string }>('animated_character', async (options, ctx) => {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(options.gltfUrl);
  
  // Create Rapier Collider matching model bounds
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 0);
  const body = ctx.native.world.createRigidBody(bodyDesc);
  const collider = ctx.native.world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.4), body);

  return ctx.entity({
    tags: ['character', 'player'],
    native: {
      three: { object: gltf.scene },
      rapier: { body, colliderHandles: [collider.handle] },
    },
  });
});
```

### B. Custom Shaders & Post-Processing
Attach custom Three.js `ShaderMaterial`, post-processing passes (Bloom, SSAO, Film Grain), or render passes directly to `game.native.renderer` and `game.native.scene`.

### C. Advanced Rapier Joints & Vehicles
Use `ctx.native.world.createImpulseJoint()` to create rope bridges, ragdolls, revolute hinges, and suspension constraints without any restrictions.

---

## 4. Three.js Performance & Optimization Mastery

High frame rates ($60\text{--}120\text{ fps}$) in WebGL/WebGPU require minimizing CPU overhead and optimizing GPU memory bandwidth.

### 🚀 A. Zero-Allocation Render Loop (Crucial)
Never instantiate objects (`new THREE.Vector3()`, `new THREE.Matrix4()`, `new THREE.Raycaster()`, object literals `{}`) inside the update or render loop. Every allocation triggers garbage collection (GC) pauses.

```ts
// ❌ BAD: Allocates new Vector3 instances 60 times per second
game.start((dt) => {
  const target = new THREE.Vector3(player.position[0], player.position[1] + 2, player.position[2]);
  camera.position.lerp(target, 0.1);
});

// ✅ GOOD: Reuse module-level scratch objects (Zero GC pressure)
const _scratchVecA = new THREE.Vector3();
const _scratchVecB = new THREE.Vector3();

game.start((dt) => {
  _scratchVecA.set(player.position[0], player.position[1] + 2, player.position[2]);
  camera.position.lerp(_scratchVecA, 0.1);
});
```

### 📦 B. Draw Call Minimization & Batching
Every distinct mesh material/geometry pair incurs a CPU draw call. Aim to keep total draw calls **under 100** per frame.

1. **InstancedMesh for repeated objects** (grass, trees, coins, bullets, debris):
   ```ts
   // Render 2,000 trees in 1 single draw call
   const treeGeometry = new THREE.ConeGeometry(1, 3, 5);
   const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x166534 });
   const instancedTrees = new THREE.InstancedMesh(treeGeometry, treeMaterial, 2000);
   
   const dummy = new THREE.Object3D();
   for (let i = 0; i < 2000; i++) {
     dummy.position.set(prng.range(-100, 100), 0, prng.range(-100, 100));
     dummy.scale.setScalar(prng.range(0.8, 1.3));
     dummy.updateMatrix();
     instancedTrees.setMatrixAt(i, dummy.matrix);
   }
   instancedTrees.instanceMatrix.needsUpdate = true;
   scene.add(instancedTrees);
   ```
2. **BufferGeometry Merging**:
   For static level geometry that does not move, merge multiple geometries into a single `BufferGeometry` using `BufferGeometryUtils.mergeGeometries()`.

### 💡 C. Lighting & Shadow Map Optimization
- **Limit shadow casters**: Typically use **1 Directional Light** (Sun) with shadow mapping enabled, plus lightweight ambient/hemisphere lighting.
- **Tight Shadow Frustum**: Keep the shadow camera bounding box as small as possible around the player to maximize shadow resolution without bloating texture memory:
  ```ts
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 100;
  dirLight.shadow.camera.left = -30;
  dirLight.shadow.camera.right = 30;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  dirLight.shadow.bias = -0.0005; // Eliminates shadow acne
  ```

### 🧹 D. Resource Disposal & Memory Leak Prevention
Always dispose of geometries, materials, and textures when entities are destroyed:
```ts
function disposeHierarchy(node: THREE.Object3D): void {
  node.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }
  });
}
```
*Note: Renderoni's `OwnershipMatrix` (`ctx.entity()`) tracks and automates this cleanup automatically when calling `entity.destroy()`.*

---

## 5. Rapier Physics & Character Controller Best Practices

### 🏃 A. Kinematic Character Controller (KCC) vs Dynamic Rigidbody
- **Player & Humanoid NPCs**: Use `kccPlayer` / Rapier Character Controller. Dynamic rigid bodies feel "floaty", stick to walls, and tip over on slopes. KCC provides crisp, responsive platformer controls, slope sliding, and step climbing.
- **Physics Props & Debris**: Use `dynamicPlayer` or `body({ type: 'dynamic' })` with proper friction ($0.5$) and restitution ($0.2$).
- **Fuselage / Vehicles**: Use flat horizontal cuboid colliders (`RAPIER.ColliderDesc.cuboid(x, y, z)`) with high angular damping ($3.0\text{--}5.0$) rather than vertical capsules to avoid tipping.

### 🔍 B. Collision Groups & Interaction Filtering
Use Rapier collision groups to prevent unnecessary collision checks (e.g. Player projectiles shouldn't collide with the player):

```ts
// Bitmasks: Membership (16 bits) | Filter (16 bits)
const GROUP_TERRAIN    = 0x0001;
const GROUP_PLAYER     = 0x0002;
const GROUP_ENEMY      = 0x0004;
const GROUP_PROJECTILE = 0x0008;

// Player collides with Terrain and Enemy, but ignores Player Projectiles
const playerFilter = (GROUP_PLAYER << 16) | (GROUP_TERRAIN | GROUP_ENEMY);
colliderDesc.setCollisionGroups(playerFilter);
```

---

## 6. Game Architecture & Declarative Presets

Renderoni encourages the **Preset Pattern** using `definePreset`:

```ts
import { definePreset } from 'renderoni/presets';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export interface TurretOptions {
  id?: string;
  position?: [number, number, number];
  fireRateHz?: number;
}

export const turret = definePreset<TurretOptions>('turret', (options, ctx) => {
  const pos = options.position ?? [0, 0, 0];

  // Visual
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 1, 16), new THREE.MeshStandardMaterial({ color: 0x334155 }));
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.8), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
  barrel.position.set(0, 0.6, -0.8);
  group.add(base, barrel);
  group.position.set(...pos);

  // Physics
  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(...pos);
  const body = ctx.native.world.createRigidBody(bodyDesc);
  const collider = ctx.native.world.createCollider(RAPIER.ColliderDesc.cylinder(0.5, 1.2), body);

  return ctx.entity({
    tags: ['enemy', 'turret'],
    state: { health: 100 },
    native: {
      three: { object: group },
      rapier: { body, colliderHandles: [collider.handle] },
    },
    actions: {
      shoot: () => {
        ctx.events.emit('bullet.spawn', { origin: group.position, direction: [0, 0, -1] });
      },
    },
  });
});
```

---

## 7. Camera, Input & Audio Systems

### 🎥 Camera Modes:
- **Smooth 3rd-Person Chase**: Use spherical coordinates (`theta`, `phi`, `radius`) lerped smoothly towards the player's position + offset.
- **Cockpit / First-Person**: Attach camera directly to the player's eye socket or cockpit anchor with zero rotational lag.
- **Screen Shake**: Add high-frequency, decaying random displacement to camera target during explosions/hits using `ctx.prng`.

### 🔊 Web Audio Best Practices:
- Use procedural audio synthesis (OscillatorNode + GainNode envelope) for lightweight, zero-latency SFX without loading heavy MP3 assets.
- Resume `AudioContext` automatically on the first user interaction (`pointerdown` or `keydown`).

---

## 8. VFX, Particles & Juice

- **Particle Pools**: Maintain a pre-allocated pool of $100\text{--}500$ particle objects. Never create/destroy meshes during particle emission; activate and reset existing particles from the pool.
- **Visual Feedback ("Juice")**:
  - Hit stop / frame freeze ($50\text{ms}$).
  - Squash & Stretch scale tweens on jump/land.
  - Floating damage numbers projected via Renderoni UI anchors (`ui().anchor()`).

---

## 9. Headless Testing & Agent Verification

Renderoni tests run in pure Node.js in $<10\text{ms}$ with Vitest:

```ts
import { expect, test } from 'vitest';
import { createRenderoni } from 'renderoni';
import { kccPlayer, sensor } from 'renderoni/presets';
import 'renderoni/testing/matchers';

test('hero triggers sensor and verifies determinism hash', async () => {
  const game = await createRenderoni({ mode: 'headless', seed: 42 });
  
  const hero = game.add(kccPlayer({ id: 'hero', position: [0, 1, 0] }));
  const coin = game.add(sensor({ id: 'coin', position: [2, 1, 0] }));

  let collected = false;
  game.events.on('sensor.enter', () => { collected = true; });

  hero.actions.move({ x: 1, z: 0 });
  game.step(30);

  expect(collected).toBe(true);
  expect(game).toHaveTick(30);
  expect(game).toHavePassedDiagnostics();
});
```

---

## 10. Prompt-to-Scene (img2threejs)

Do not one-shot a whole game. Keep a compact `SceneInventory` in context, reconstruct each unique `factory` with [img2threejs](https://github.com/img2threejs/img2threejs), then mount:

```ts
import { mountSceneInventory } from 'renderoni/scene';
import { proceduralModel } from 'renderoni/presets';

mountSceneInventory(game, inventory, { woodCrate: createWoodCrateModel });
```

Full agent recipe: `.agents/skills/prompt-to-scene/SKILL.md`.
