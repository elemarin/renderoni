# Renderoni: Product Proposal & Architectural Specification

> **Deterministic by design. Al dente by default.**
> A batteries-included, agent-native 3D simulation and gameplay framework for Three.js and Rapier.

---

## Document Status

| Field | Value |
|---|---|
| **Status** | Approved Specification (Post-Review Revision) |
| **Product** | Renderoni |
| **Category** | Deterministic Gameplay, Simulation, and AI Evaluation Framework for Three.js + Rapier |
| **Distribution** | Single TypeScript package with tree-shakable subpath exports (`renderoni`, `renderoni/core`, `renderoni/presets`, `renderoni/mcp`, `renderoni/testing`) |
| **Foundation** | Three.js (WebGL / WebGPU) + Rapier (WASM 3D Physics) |
| **First Implementation Slice** | MVP defined in Section 14 |
| **Audience** | Game developers, 3D web application engineers, automated test runners, and autonomous AI coding agents |

---

> **0.9 Beta Scope Note:** This document is the original architectural specification and captures the full long-term design intent, including subsystems and transports that are not part of the current public package contract. As of the `0.9.0-beta.1` public surface: **networking (`renderoni/network`) is deferred to a post-1.0 release** and is not exported or built by `tsup`; the MCP server ships **`stdio` transport only** (SSE is not implemented); gamepad input and post-processing effects (bloom/SSAO/FXAA) are not implemented; the audio subsystem is an **event-driven audio logger**, not true positional/spatial `PositionalAudio`; and `renderoni/vfx` particle bursts are currently an **event/stub surface** (`spawnParticles()` allocates a mesh and fires an event but does not yet render instanced particles) — real-time deterministic screen shake is fully implemented. See `README.md` for the authoritative list of what 0.9 currently ships. Sections below are preserved as historical design record and are annotated where they describe not-yet-shipped scope.

---

## 1. Executive Summary

Three.js is the standard for web graphics; Rapier is the standard for fast WebAssembly physics. However, connecting them into a production-grade, testable, and reproducible 3D application requires massive repetitive boilerplate: managing fixed timestep loops, transform synchronization, visual interpolation, asset lifecycles, character controllers, skeletal animations, spatial audio, UI projections, and network replication.

For autonomous AI coding agents and automated CI test runners, this architecture is historically opaque: Three.js and Rapier scenes are mutable, non-deterministic black boxes that require costly vision snapshots, fragile browser automation, and produce non-reproducible bugs.

**Renderoni solves this with a unified, dual-nature architecture:**
1. **For Human Developers:** A batteries-included, ergonomic 3D game framework. A single call to `createRenderoni()` spins up physics, rendering, camera management, asset loading, animation state machines, audio event logging, UI projections, and screen-shake/particle-event VFX with typed presets and zero boilerplate.
2. **For AI Agents & CI Suites:** A headless-first, deterministic simulation and verification kernel. It provides token-efficient semantic observations (<500B Markdown summaries), JIT-validated semantic actions, fixed-point state hashing, keyframed replays, and a built-in Model Context Protocol (MCP) server for instant agent pairing.

### 1.1 Prior Art & Architectural Learnings

Existing open-source web engine attempts (such as `three-game-engine` and `@react-three/fiber` ecosystems) have validated the demand for combining Three.js with Rapier. Analyzing their implementations reveals four critical architectural lessons that directly shape Renderoni:

1. **The Transform Nesting Hazard:** Prior engines often nest child `THREE.Group`s inside parent groups. Because Rapier calculates physics in flat world Cartesian space, writing world transforms into nested local groups causes severe visual and physics drift. *Renderoni mandates root-level scene attachment and a dual-buffer transform pipeline.*
2. **The Browser Global Coupling Trap:** Previous engines tie their root classes to `window`, `document`, and DOM `FileSystemDirectoryHandle`, making it impossible to run headless tests in Node.js/Bun. *Renderoni strictly decouples kernel simulation from DOM/presentation.*
3. **Stringly-Typed Component Bags vs. Type Inference:** Ad-hoc string-based component registries (`componentClassForType[type]`) lead to broken autocomplete and untyped state. *Renderoni uses `@sinclair/typebox` for compile-time TS type inference and runtime schema validation.*
4. **UI Performance & Accessibility:** Attempting to render 3D WebGL text geometry (`three-mesh-ui`) introduces heavy VRAM overhead and poor styling flexibility. *Renderoni leverages reactive state stores and 3D-to-2D CSS screen anchors for lightweight, accessible HUDs.*

---

## 2. Product Architecture & Layers

```
+---------------------------------------------------------------------------------------+
|                                     L3 APPLICATION                                    |
|             Game Rules, Assets, Content Data, Custom Shaders, UI Layouts              |
+---------------------------------------------------------------------------------------+
|                                  L2 TOOLING & AGENTS                                  |
|         Built-in MCP Server (stdio), Vitest Matchers, Replay CLI, Debug UI            |
+---------------------------------------------------------------------------------------+
|                                L1 BATTERIES & SUBSYSTEMS                              |
|   Animation State Machine | Audio Events | UI Screen Anchors | VFX Events | Net*      |
|   Presets: body, sensor, light, kccPlayer, dynamicPlayer | Asset Manifest Manager     |
+---------------------------------------------------------------------------------------+
|                                  L0 DETERMINISTIC KERNEL                              |
|   Integer Tick Clock | Seeded PRNG Streams | Dual-Buffer Transform Pipeline           |
|   Quantized Fixed-Point Canopy (Q20.12) | XXH3 Hasher | Resource Ownership Matrix     |
+---------------------------------------------------------------------------------------+
|                                    NATIVE ENGINES                                     |
|               Three.js (WebGL/WebGPU)      |      @dimforge/rapier3d-compat (WASM)    |
+---------------------------------------------------------------------------------------+
```

*`Net` (Networking) is planned for a post-1.0 release; it is not part of the current 0.9 beta public exports.

### Layer Breakdown:
- **L0 Core Kernel:** Pure, DOM-free deterministic simulation runtime. Owns fixed-step time, seeded PRNG streams, structural command queues, dual-buffer transform isolation, Rapier WASM stepping, quantized state hashing, and explicit memory ownership.
- **L1 Batteries & Subsystems:** Four currently-shipped, tree-shakable subsystems (Animation, Audio, UI, VFX) and the Asset Manifest Manager, plus a Networking subsystem planned for post-1.0. All subsystems feature automatic headless mocks that log verifiable events in tests without DOM or Web Audio dependencies.
- **L2 Tooling & Transports:** Built-in Model Context Protocol (MCP) server, JSON-RPC over `stdio`, Vitest/Jest custom matchers (`@renderoni/testing`), and command-log replay bisection tools.
- **L3 Application:** User-defined game logic, art direction, and custom presets built via public contracts.

---

## 3. Product Principles

1. **Deterministic by Design:** Same seed + same actions = identical quantized state canopy on the same runtime architecture.
2. **Presentation Decoupled from Simulation:** Simulation never reads wall-clock time, DOM state, or interpolated render transforms. Headless runs execute identically to interactive runs.
3. **Dual-Buffer Transform Safety:** Rapier physics writes strictly to a canonical simulation buffer; presentation interpolates render transforms separately to prevent ghost collision bugs.
4. **Token-Efficient Agent Projections:** Provide high-density semantic Markdown summaries (<500 bytes / ~120 tokens) and delta observations instead of massive JSON scene dumps.
5. **JIT Action Validation:** Actions are validated at registration and entry boundaries; the 60Hz internal tick loop executes zero dynamic JSON Schema parsing.
6. **Explicit Memory Ownership:** Every native Three.js / Rapier resource declares ownership (`owned`, `borrowed`, `shared`, `transferred`) to prevent GPU leaks and WASM double-frees.
7. **Tree-Shakable by Default:** Importing core or headless testing harnesses evaluates zero WebGL, DOM, or Web Audio code.

---

## 4. Distribution & Subpath Exports

Renderoni ships as a single npm package with stable subpath boundaries:

```text
renderoni           Unified factory, default presets, and common public types
renderoni/core      L0 deterministic kernel, constructor, and low-level contracts
renderoni/presets   Typed official entity and system presets
renderoni/animation Hybrid deterministic animation state machine and root motion
renderoni/audio     Event-driven audio logging with headless event mocks
renderoni/ui        Reactive state store and 3D-to-2D screen anchor projection
renderoni/vfx       Screen shake plus event-driven VFX triggers (particle rendering: planned)
renderoni/scene     Compact scene inventory mounting for prompt-to-scene workflows
renderoni/mcp       Built-in Model Context Protocol (MCP) server (stdio)
renderoni/testing   Vitest and Jest custom matchers and test harnesses
```

> `renderoni/network` (pluggable transport abstraction) is designed but **deferred to a post-1.0 release**; it is not part of the current 0.9 beta exports or `tsup` build entries.

### 4.1 Multi-Platform Distribution Targets

Renderoni is built for web-first distribution, with zero-friction exportability to native desktop and mobile platforms:
- **Web / PWA:** Direct browser execution via standard ESM bundlers (Vite, Rollup, Next.js, Webpack).
- **Desktop (Electron & Tauri):** Full support for native desktop packaging with direct local file system asset streaming.
- **Mobile (Capacitor & Cordova):** Responsive viewport auto-scaling, high-DPI clamping, and virtual touch joystick inputs.
- **Headless Server & CI (Node.js & Bun):** 100% DOM-free deterministic execution for multiplayer authority servers and CI test suites.

---

## 5. Core Kernel & Determinism Architecture (L0)

```
       +-----------------------------------------------------------------+
       |                  SIMULATION TICK (Fixed 60 Hz)                  |
       +-----------------------------------------------------------------+
       | 1. Derive tick PRNG substream                                   |
       | 2. Drain structural command queue (spawns/despawns)             |
       | 3. Read frozen action input stream                              |
       | 4. Run Pre-Physics Systems (Animation state machine / root motion)
       | 5. Step Rapier Physics World (WASM)                             |
       | 6. Bulk copy Rapier transforms -> Canonical Physics Buffer      |
       | 7. Sort & Dispatch collision/sensor events deterministically    |
       | 8. Run Post-Physics Systems (Gameplay logic / Health / Triggers)|
       | 9. Fire due timers & emit diagnostic records                    |
       | 10. (Optional) Compute Quantized State Hash (Q20.12 + XXH3)     |
       +-----------------------------------------------------------------+
                                       |
                   Interpolation Alpha = accumulator / fixedDt
                                       v
       +-----------------------------------------------------------------+
       |               PRESENTATION LOOP (e.g. 144 Hz / RAF)             |
       +-----------------------------------------------------------------+
       | 1. Slerp/Lerp Canonical Physics Buffer -> Interpolated Buffer   |
       | 2. Write Interpolated Buffer -> Three.js Mesh Transforms        |
       | 3. Advance THREE.AnimationMixer (Bone Skinning)                 |
       | 4. Update UI 3D-to-2D Screen Projections                        |
       | 5. Render Three.js Scene (WebGLRenderer / EffectComposer)       |
       +-----------------------------------------------------------------+
```

### 5.1 Dual-Buffer Transform Pipeline
To prevent transient interpolated visual transforms from polluting canonical physics calculations:
- **Canonical Physics Buffer:** Flat `Float32Array` storing authoritative simulation positions and quaternions. Read strictly by gameplay systems, raycasters, and test assertions.
- **Interpolated Render Buffer:** Computed during the presentation phase ($\text{lerp}(p_{t-1}, p_t, \alpha)$ and $\text{slerp}(q_{t-1}, q_t, \alpha)$) and written directly into Three.js `Object3D.position` and `Object3D.quaternion`.
- Simulation code is strictly forbidden from reading `Object3D.position`.

### 5.2 Quantized Fixed-Point Canopy & State Hashing
WebAssembly floating-point arithmetic can experience 1-ULP drift across CPU architectures due to SIMD/FMA compiler optimizations. To guarantee reproducible state hashing:
1. All positions, velocities, and rotation quaternions are mapped to **32-bit fixed-point integers** ($Q20.12$ format or 0.1mm integer grid).
2. The packed integer byte buffer is hashed using **XXH3 (64-bit)**.
3. Rapier contact pairs and sensor triggers are explicitly sorted by canonical `EntityID` before dispatch.

### 5.3 Resource Ownership & Memory Management
Renderoni enforces a strict 4-state ownership model to manage Three.js VRAM and Rapier WASM linear memory:

| Ownership | Behavior on Entity Despawn or `game.dispose()` |
|---|---|
| `owned` | Renderoni automatically disposes the Three.js geometry/material and frees the Rapier body/collider. |
| `borrowed` | Renderoni detaches internal bindings but leaves the native Three.js node and Rapier handle intact. |
| `shared` | GPU resources (shared materials/geometries) are tracked via a reference-counted `AssetManager`. |
| `transferred` | Application transfers full ownership of an existing native resource to Renderoni. |

---

## 6. Unified TypeScript API Design

Renderoni unifies all interactions under a single polymorphic constructor `createRenderoni()`:

```ts
import { createRenderoni } from 'renderoni';
import { kccPlayer, body, light } from 'renderoni/presets';

// 1. Unified Creation
const game = await createRenderoni({
  mode: 'interactive', // 'interactive' | 'headless'
  seed: 42,
  tickRateHz: 60,
});

// 2. Add Presets (Universal 'add' verb)
const ground = game.add(body({
  id: 'ground',
  shape: 'box',
  type: 'fixed',
  size: [50, 1, 50],
}));

const hero = game.add(kccPlayer({
  id: 'hero',
  position: [0, 2, 0],
  moveSpeed: 6.0,
  jumpSpeed: 8.5,
}));

// 3. Type-Safe Entity Retrieval
const playerHandle = game.entities.get('hero', kccPlayer);
playerHandle.actions.move({ x: 1, z: 0 }); // Autocomplete & Typed!

// 4. Stepping & Asserting
game.step(60);
game.assert.greaterThan('entities.hero.position.y', 1.0);
```

### 6.1 Type-Safe Preset Authoring (`definePreset`)
Presets are authored in a single clean call backed by `@sinclair/typebox` for zero-overhead JSON Schema generation and compile-time TypeScript type inference:

```ts
import { Type, type Static } from '@sinclair/typebox';
import { definePreset, type EntityContext } from 'renderoni/core';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const CrateOptionsSchema = Type.Object({
  id: Type.Optional(Type.String()),
  size: Type.Optional(Type.Number({ minimum: 0.1, default: 1 })),
  position: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
});
export type CrateOptions = Static<typeof CrateOptionsSchema>;

export const crate = definePreset<CrateOptions>({
  name: 'renderoni.crate',
  version: 1,
  schema: CrateOptionsSchema,
  create(ctx: EntityContext, options: CrateOptions) {
    const size = options.size ?? 1;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
    );
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(...(options.position ?? [0, 0, 0]));
    const body = ctx.native.world.createRigidBody(bodyDesc);
    const collider = ctx.native.world.createCollider(RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2), body);

    return ctx.entity({
      id: options.id,
      tags: ['crate', 'destructible'],
      state: { health: 3 },
      native: {
        three: { object: mesh, ownership: 'owned' },
        rapier: { bodyHandle: body.handle, colliderHandles: [collider.handle], ownership: 'owned' },
      },
    });
  },
});
```

---

## 7. The 5 Modular Subsystems

### 7.1 Animation Subsystem (`renderoni/animation`)
Combines a deterministic gameplay state machine with smooth presentation bone skinning:
- **Deterministic State Machine:** Tracks active state (`idle`, `walk`, `run`, `jump`, `attack`), normalized playback clock ($0.0 \to 1.0$), and cross-fade blend weights in simulation state.
- **Root Motion Integration:** Extracts motion deltas directly from GLTF animation root bones during pre-physics and injects velocity into the Rapier Kinematic Character Controller.
- **Headless Safety:** In headless mode, bone transforms and WebGL skinning are bypassed completely; state machine transitions remain 100% deterministic.

```ts
hero.animation.play('run', { crossFadeDuration: 0.2 });
```

### 7.2 Audio Subsystem (`renderoni/audio`)
An event-driven spatial sound architecture:
- **Emit-and-Sink Model:** Gameplay logic emits typed sound events (`ctx.events.emit('audio.play', { clip: 'footstep', volume: 0.7, position: [x, y, z] })`).
- **Interactive Spatial Sink:** In interactive mode, coordinates are mapped to Three.js `PositionalAudio` and Web Audio nodes.
- **Headless Verification:** In headless CI and agent runs, sound events are logged to the event ring buffer, allowing direct assertions:
  ```ts
  expect(game).toEmitEvent('audio.play', { clip: 'footstep' });
  ```

### 7.3 UI Subsystem (`renderoni/ui`)
Provides reactive state observation and 3D-to-2D screen projections:
- **Reactive State Store:** Allows any UI framework (Vanilla HTML, React, Vue, Svelte) to subscribe to granular entity state changes without triggering canvas re-renders:
  ```ts
  game.ui.subscribe('hero.state.health', (health) => {
    healthBar.style.width = `${health}%`;
  });
  ```
- **3D Screen Anchors:** Projects 3D entity positions into 2D CSS screen coordinates on every presentation frame for floating nameplates, health bars, and interaction prompts:
  ```ts
  const anchor = game.ui.createAnchor({ target: 'hero', offset: [0, 2.2, 0] });
  anchor.onChange(({ screenX, screenY, isVisible }) => { ... });
  ```

### 7.4 Rendering, Shaders & VFX Subsystem (`renderoni/vfx`)
A dual-target rendering pipeline:
- **Dual-Target Renderer:** WebGL (`WebGLRenderer`) as standard default, with first-class opt-in support for Three.js WebGPU / TSL (Three Shading Language). Post-processing passes (bloom, SSAO, FXAA via `EffectComposer`) are a **planned, post-1.0 addition** and are not implemented in the current `renderoni/vfx` build.
- **Particle Bursts (Event/Stub Surface — Rendering Planned):** `game.vfx.spawnParticles()` allocates a `THREE.InstancedMesh` and emits a deterministic `vfx.particles` event for headless/gameplay-logic consumption, but the burst does not yet write instance transforms, so no particles are visually rendered in the current build. Full GPU-instanced particle rendering is planned for a future release.
- **VFX Events:** Screen shake (fully implemented, deterministic via the seeded PRNG) and `vfx.particles`/`vfx.screenShake` events triggered via the event bus.

### 7.5 Networking Subsystem (`renderoni/network`) — Planned, Post-1.0

> Not part of the current 0.9 beta public exports or `tsup` build entries. Preserved here as the original design target for a future release.

A transport-agnostic networking layer built on top of Renderoni’s deterministic action stream:
- **Pluggable Transports:** Official adapters for WebSockets, WebRTC, Colyseus, and PartyKit.
- **Dual Architecture Support:**
  1. **Authoritative Server + Prediction:** Dedicated headless Node/Bun instance runs canonical simulation; clients predict local inputs and reconcile against server state frames.
  2. **Deterministic Rollback (GGPO-style):** Clients exchange timestamped inputs; rollback ring buffers rewind and replay simulation upon input arrival.

---

## 8. Unified Asset Management Pipeline

Asset loading is unified under a centralized, promise-cached manifest loader supporting preloading, progress tracking, multi-source resolution, and headless fallbacks:

```ts
// Preload all assets with progress tracking
game.assets.on('progress', ({ loaded, total, percent, currentAsset }) => {
  console.log(`Loading: ${percent}% - ${currentAsset}`);
});

await game.assets.loadManifest({
  baseURL: '/assets/', // Supports remote URLs, relative paths, Blobs, or FileSystemDirectoryHandles
  models: {
    hero: 'models/character.glb',
    crate: 'models/crate.glb',
  },
  textures: {
    groundDiffuse: 'textures/ground.ktx2',
  },
  audio: {
    jump: 'audio/jump.ogg',
    coin: 'audio/coin.mp3',
  },
});
```

- **Promise-Based Deduplication & Caching:** Requests for identical asset keys or URLs return the same in-flight or cached promise, preventing redundant network fetches and GPU allocations.
- **Multi-Source Ingestion:** Seamlessly resolves relative paths, absolute URLs, object Blobs, and native desktop/editor `FileSystemDirectoryHandle` sources.
- **GPU Memory Ref-Counting:** Shared textures, geometries, and materials are automatically ref-counted; resources are released from VRAM only when the final entity reference is destroyed.
- **Headless Fallback Mocks:** In headless Node.js runs, models parse lightweight bounding boxes and collision meshes without initializing WebGL texture memory.

---

## 9. Character Controllers & Input Abstraction
 
Renderoni provides production-grade character controller presets backed by a unified input abstraction layer:
 
```
           +---------------------------------------+
           |       Input Abstraction Layer         |
           | (PointerLock, Keyboard, Touch         |
           +-------------------+-------------------+
                               |
           +-------------------v-------------------+
           |       kccPlayer System (60 Hz)        |
           +---------------------------------------+
           | 1. Read input vector / action stream  |
           | 2. Apply slope sliding & max slope cap|
           | 3. Handle auto-stepping (stairs)      |
           | 4. Add root motion offset from anim   |
           | 5. Rapier KCC: computeColliderMovement|
           | 6. Commit final translated position   |
           +---------------------------------------+
```
 
- **Unified Input Abstraction:** Supports first-person `PointerLockControls` with mouse-look smoothing, keyboard WASD/arrow bindings, and mobile virtual touch joysticks without direct DOM listener coupling in gameplay code. Gamepad support is planned for a future release and is not implemented in 0.9.
- **`kccPlayer` (Kinematic Character Controller):** Built on Rapier’s native `KinematicCharacterController`. Features automatic stair stepping, slope sliding limits, ground snapping, jump buffering, coyote time, and direct integration with animation root motion.
- **`dynamicPlayer` (Rigid-Body Physics Controller):** For physics-driven games (marbles, roll-a-ball, vehicles, and ragdolls) utilizing direct torque, impulses, and contact-friction forces.

---

## 10. Agent-Native Protocol & Built-in MCP Server (`renderoni/mcp`)

Renderoni natively implements the **Model Context Protocol (MCP)** and JSON-RPC over `stdio`, allowing autonomous agents (Cursor, Claude, Devin, Antigravity) to attach to a live or headless game session with zero setup.

```
+------------------+           MCP stdio            +-------------------+
|  AI Coding Agent | <=============================> |  Renderoni Core   |
| (Claude/Cursor)  |   tools: describe, observe,     | (Headless / Live) |
+------------------+          act, step, verify      +-------------------+
```

### 10.1 Why AI Agents Excel with Renderoni vs. Raw Three.js + Rapier

| What Kills Agents in Raw Three.js + Rapier | How Renderoni Solves It |
|---|---|
| **Silent Failures:** Colliders fall through floors silently, materials don't render, animations don't play. | **Structured Diagnostics (`RND_xxxx`)** and type-safe assertions immediately inform the agent of the exact tick, entity, and error code. |
| **Token Waste:** Agent attempts to inspect scene by stringifying the Three.js scene graph (100,000+ tokens). | **Tier 0 Markdown Projections (<500 bytes)** provide instant topological awareness of positions, velocities, and events. |
| **Browser Automation Flakiness:** Agent must manage heavy Puppeteer / Playwright browser instances and capture screenshots to verify logic. | **Headless-First Stepping:** Agent verifies physics, animations, quest logic, and audio triggers in pure Node.js in **5 milliseconds**. |
| **Fragmented Interfaces:** Disconnected input handlers, animation mixers, and physics bodies across ad-hoc files. | **Direct MCP Tooling:** Agent connects via Model Context Protocol (`renderoni/mcp`) and calls `act`, `step`, `observe`, and `check` natively. |

### 10.2 Tiered Observation Economics
To protect agent context windows from token bankruptcy, observations are structured into three token-optimized tiers:

1. **Tier 0: Semantic Markdown Topology (<500 bytes / ~120 tokens):**
   ```yaml
   # Tick: 120 | Time: 2.00s | Mode: Headless | Hash: 0x8f3c2a1e
   Hero: pos[0.0, 1.0, 0.0] vel[0.0, 0.0, 0.0] grounded[true] state[idle]
   Nearby (<10m):
     - Coin#1: dist[3.2m, bearing: +45°] tag[pickup]
     - Pit#0: dist[8.0m, ahead] tag[hazard]
   RecentEvents: [TriggerEnter: Hero -> Zone#1 (tick: 112)]
   ```
2. **Tier 1: Delta Observations:** Returns only entity state changes and events that occurred since tick $T_{\text{prev}}$.
3. **Tier 2: Targeted Spatial Queries:** Allows agents to inspect specific raycasts, bounding volumes, or entity IDs on demand.

### 10.3 Keyframed Replays & Virtual Handle Table
- Replay bundles record initial seed, version fingerprints, discrete actions, and **savestate keyframes every $N$ ticks** (e.g. every 600 ticks / 10s).
- Seeking or bisecting to tick 3,605 loads Keyframe 3,600 and simulates only 5 ticks ($O(1)$ fast seeking).
- Rapier native pointers are translated through a deterministic **Virtual Slot Map** keyed by `EntityID`, preventing handle invalidation panics across snapshot restores.

---

## 11. Testing, Verification & Assertions (`renderoni/testing`)

Renderoni provides a dual-layer verification engine:

### 11.1 Machine AST Assertions (`game.check()`)
Used by MCP agents, JSON-RPC transports, and CI runners:
```ts
const result = game.check([
  { op: 'greaterThan', path: 'entities.hero.position.y', value: 0.5 },
  { op: 'isWithinDistance', entityA: 'hero', entityB: 'coin', maxDistance: 1.5 },
  { op: 'noDiagnostics', minimumSeverity: 'error' },
]);
```

### 11.2 Human-Friendly Vitest / Jest Matchers
```ts
import { expect, test } from 'vitest';
import '@renderoni/testing/matchers';

test('hero collects coin after moving right', async () => {
  const game = await createRenderoni({ mode: 'headless', seed: 42 });
  const hero = game.add(kccPlayer({ id: 'hero', position: [0, 1, 0] }));
  const coin = game.add(sensor({ id: 'coin', position: [3, 1, 0] }));

  hero.actions.move({ x: 1, z: 0 });
  game.step(60);

  expect(game).toHaveTick(60);
  expect(game).toEmitEvent('pickup.collected', { target: 'coin' });
  expect(hero).toHaveState({ coins: 1 });
  expect(game).toHavePassedDiagnostics();
});
```

---

## 12. Complete Playable Quickstart

```ts
import { createRenderoni } from 'renderoni';
import { body, kccPlayer, light, sensor } from 'renderoni/presets';
import { audio } from 'renderoni/audio';
import { animation } from 'renderoni/animation';
import { vfx } from 'renderoni/vfx';
import { ui } from 'renderoni/ui';

// 1. Initialize complete batteries-included game
const game = await createRenderoni({
  mode: 'interactive',
  seed: 42,
  subsystems: [
    audio({ volume: 0.8 }),
    animation(),
    vfx({ bloom: true }),
    ui(),
  ],
});

// 2. Load Assets
await game.assets.loadManifest({
  models: { hero: '/assets/hero.glb' },
  audio: { coin: '/assets/coin.mp3' },
});

// 3. Add Environment & Lighting
game.add(light({ type: 'directional', position: [5, 10, 5], castShadow: true }));
game.add(body({ shape: 'box', type: 'fixed', size: [100, 1, 100], color: 0x335533 }));

// 4. Add Interactive Collectible
const coin = game.add(sensor({
  id: 'coin',
  shape: 'sphere',
  radius: 0.5,
  position: [5, 1, 0],
}));

// 5. Add Animated Kinematic Player
const hero = game.add(kccPlayer({
  id: 'hero',
  position: [0, 1, 0],
  model: 'hero',
  controls: 'wasd',
  camera: 'follow',
}));

// 6. Gameplay Logic via Events
game.events.on('sensor.enter', ({ sensor, target }) => {
  if (sensor.id === 'coin' && target.id === 'hero') {
    game.audio.play('coin');
    game.vfx.spawnParticles({ type: 'burst', position: sensor.position });
    sensor.destroy();
  }
});

// 7. Start Game Loop
game.start();
```

---

## 13. Reference Game Archetypes & AI Evaluation Scenarios

These three structurally diverse archetypes serve as official benchmark evaluation scenarios for testing AI coding agents and verifying the completeness of the framework.

```
+---------------------------------------------------------------------------------------------------+
|                                THREE REFERENCE GAME ARCHETYPES                                    |
+---------------------------------+---------------------------------+-------------------------------+
|  1. Prompt-to-Scene contract    |  2. Skyward Courier Flight       |  3. PSX 1st-Person Horror     |
|  - Compact scene inventory JSON |  - Kinematic aero on fixed tick  |  - kccPlayer first-person     |
|  - img2threejs factory mount    |  - Island bodies + plane preset  |  - Manor bodies + sensors     |
|  - Token-cheap object registry  |  - Throttle / landing loop       |  - Journal / clock / gate     |
+---------------------------------+---------------------------------+-------------------------------+
```

### 13.1 Archetype A: Prompt-to-Scene Lab (img2threejs)

```ts
import { createRenderoni } from 'renderoni';
import { kccPlayer, light } from 'renderoni/presets';
import { mountSceneInventory, type SceneInventory } from 'renderoni/scene';

const inventory: SceneInventory = {
  version: 1,
  prompt: 'stone courtyard with a crate and a coin',
  elements: [
    { id: 'crate', factory: 'woodCrate', kind: 'prop', position: [0, 0.5, 0], collider: { shape: 'box', size: [1, 1, 1] } },
    { id: 'coin', factory: 'goldCoin', kind: 'pickup', position: [2, 1, 0], collider: { shape: 'sphere', radius: 0.6, sensor: true } },
  ],
};

const game = await createRenderoni({ mode: 'headless', seed: 42 });
game.add(light({ type: 'directional', position: [12, 20, 8] }));
mountSceneInventory(game, inventory, {
  woodCrate: createWoodCrateModel,
  goldCoin: createGoldCoinModel,
});
game.add(kccPlayer({ id: 'hero', position: [0, 1.5, 4] }));
```

* **Headless Agent Verification Test:**
  ```ts
  game.step(10);
  expect(game.entities.get('crate')?.tags.has('prop')).toBe(true);
  expect(game.entities.get('coin')?.tags.has('sensor')).toBe(true);
  ```

---

### 13.2 Archetype B: Infinite Voxel Terrain Sandbox (Minecraft Copy)

```ts
import { createRenderoni } from 'renderoni';
import { kccPlayer, light } from 'renderoni/presets';
import { ui } from 'renderoni/ui';
import { audio } from 'renderoni/audio';

const game = await createRenderoni({
  mode: 'interactive',
  subsystems: [ui(), audio()],
});

// 1. Procedural Voxel Chunk Meshing via definePreset
export const voxelChunk = definePreset({
  name: 'voxel.chunk',
  create(ctx, { chunkX, chunkZ, voxelData }) {
    const { geometry, colliderTrimesh } = generateGreedyMesh(voxelData);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
    mesh.position.set(chunkX * 16, 0, chunkZ * 16);

    const body = ctx.native.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(mesh.position.x, 0, mesh.position.z));
    const collider = ctx.native.world.createCollider(colliderTrimesh, body);

    return ctx.entity({
      tags: ['chunk'],
      native: { three: { object: mesh, ownership: 'owned' }, rapier: { bodyHandle: body.handle, colliderHandles: [collider.handle], ownership: 'owned' } },
    });
  },
});

// 2. First-Person Voxel Player with Auto-Stepping (1-block height)
const player = game.add(kccPlayer({
  id: 'miner',
  position: [0, 32, 0],
  controls: 'wasd',
  camera: 'firstPerson',
  autoStep: { maxStepHeight: 1.1, minStepWidth: 0.2 },
}));

// 3. Block Edit System (Raycast Break / Place)
game.actions.register({
  name: 'voxel.breakBlock',
  handle: ({ entity }) => {
    const hit = game.native.world.castRay(player.cameraRay, 5.0, true);
    if (hit) {
      modifyVoxelGrid(hit.point, 0); // Clear voxel
      game.audio.play('block_pop', { position: hit.point });
      game.events.emit('voxel.broken', { point: hit.point });
    }
  },
});
```

* **Headless Agent Verification Test:**
  ```ts
  // Agent tests block raycast break and auto-stepping headlessly
  game.act({ name: 'voxel.breakBlock' });
  player.actions.move({ x: 0, z: 1 });
  game.step(60);
  expect(player.position.z).toBeGreaterThan(0.5);
  expect(game).toEmitEvent('voxel.broken');
  ```

---

### 13.3 Archetype C: PSX-Style 1st-Person Atmospheric Horror Game

```ts
import { createRenderoni } from 'renderoni';
import { kccPlayer, sensor, light } from 'renderoni/presets';
import { vfx } from 'renderoni/vfx';
import { audio } from 'renderoni/audio';
import { ui } from 'renderoni/ui';

// 1. Initialize game with PSX Post-Processing Shader Pass
const game = await createRenderoni({
  mode: 'interactive',
  subsystems: [
    vfx({
      pixelResolution: [320, 240], // Low-res retro downsampling
      affineTextureWarp: true,     // PSX vertex wobble
      dithering: true,             // 16-bit color quantization
    }),
    audio(),
    ui(),
  ],
});

// 2. Flashlight & Horror Player Controller
const hero = game.add(kccPlayer({
  id: 'delivery_driver',
  position: [0, 1, 0],
  controls: 'wasd',
  camera: 'firstPerson',
  moveSpeed: 3.2, // Tense, slow walking pace
  state: { battery: 100, packageDelivered: false },
}));

// Attach flashlight spotlight to player camera
const flashlight = game.add(light({
  type: 'spot',
  parent: hero.id,
  angle: Math.PI / 6,
  intensity: 2.5,
  castShadow: true,
}));

// 3. Delivery Drop-off Trigger Zone
const dropoffZone = game.add(sensor({
  id: 'cabin_porch',
  shape: 'box',
  size: [3, 2, 3],
  position: [0, 1, 80], // At the end of the dark forest path
}));

// 4. Quest & Atmosphere Triggers
game.events.on('sensor.enter', ({ sensor, target }) => {
  if (sensor.id === 'cabin_porch' && target.id === 'delivery_driver') {
    hero.state.packageDelivered = true;
    game.audio.play('creepy_door_knock', { position: sensor.position });
    game.ui.showSubtitle('Delivery complete... but you feel watched.');
  }
});
```

* **Headless Agent Verification Test:**
  ```ts
  // Agent walks the full horror path and verifies quest completion headlessly
  hero.actions.walkTo([0, 1, 80]);
  game.step(1500); // 25 seconds of walking
  expect(hero.state.packageDelivered).toBe(true);
  expect(game).toEmitEvent('audio.play', { clip: 'creepy_door_knock' });
  ```

---

## 14. MVP: Vertical Implementation Slice

The MVP is a focused vertical slice proving the dual-buffer kernel, the 5 modular subsystems, and agent-native verification.

### 14.1 MVP Scope:
1. **L0 Kernel:** Deterministic fixed-step clock, seeded PRNG, command queue, dual-buffer transform isolation, Rapier WASM integration, $Q20.12$ quantized state hashing, and explicit memory ownership.
2. **Unified Factory:** `createRenderoni({ mode: 'interactive' | 'headless' })` with automatic WebGL and headless fallback configuration.
3. **Core Presets:** `body`, `sensor`, `light`, `kccPlayer`, and `definePreset`.
4. **5 Subsystem MVPs:**
   - **Animation:** Deterministic state machine (idle/walk/run) + presentation bone mixer.
   - **Audio:** Event-driven emitter with headless event logger and Web Audio sink.
   - **UI:** Reactive state store + 3D screen anchor projection.
   - **VFX:** Screen shake (implemented) + particle burst event/stub surface (rendering planned for a future release).
   - **Network:** Pluggable transport interface + local loopback / WebSocket client adapter. *(Deferred to post-1.0; not part of the 0.9 beta build.)*
5. **Asset Manager:** Manifest loader with ref-counted GPU disposal and headless mock buffers.
6. **Agent & Testing:** Built-in MCP server (`renderoni/mcp`), Tier 0 Markdown observation projection, and Vitest custom matchers (`@renderoni/testing`).

### 14.2 Validation Gates:
- **Gate 1 (Headless Parity):** The complete playable quickstart runs headlessly in Node.js (with mock audio/rendering) in <10ms without DOM shims.
- **Gate 2 (Determinism Hash Parity):** 20 fresh pinned Node processes produce 100% identical XXH3 state hashes across 1,000 simulated ticks.
- **Gate 3 (Transform Isolation):** Zero transient render interpolation state bleeds into the canonical physics state buffer.
- **Gate 4 (Agent Verification):** An AI coding agent connected via the built-in MCP server can diagnose, modify, and verify a gameplay defect headlessly using `observe`, `act`, `step`, and `check`.
- **Gate 5 (Memory Safety):** Repeated spawn/despawn cycles across 3,600 ticks demonstrate zero VRAM leaks and zero Rapier WASM heap handle panics.
- **Gate 6 (Archetype Conformance):** Section 13 evaluation tests (Prompt-to-Scene inventory mount, PSX horror quest chain) pass headlessly in CI with zero DOM dependencies.

---

## 15. Performance & Size Budgets

| Metric | Budget Target |
|---|---:|
| `renderoni/core` (minified + gzip, peers excluded) | <= 45 KiB |
| Full package with all 5 subsystems (peers excluded) | <= 95 KiB |
| Steady-State Simulation Overhead (200 entities) | <= 0.25 ms / tick p50 |
| Tier 0 Markdown Agent Observation Summary | <= 500 Bytes (~120 tokens) |
| Max Detailed Observation Payload | <= 24 KiB |
| Memory Churn in Fixed Tick Loop | 0 dynamic object allocations in steady-state |

---

## 16. Resolved Architectural Decisions

| # | Topic | Resolution | Justification |
|---|---|---|---|
| **1** | Package Distribution | **Single primary package with subpath exports** | Guarantees single-dependency install while bundlers tree-shake unused subsystems. |
| **2** | Networking Paradigm | **Pluggable Transport Abstraction** *(post-1.0)* | Supports both Authoritative Server + Prediction and Deterministic Rollback via the core action stream. |
| **3** | Animation Model | **Hybrid State Machine + Bone Interpolation** | Deterministic state machine drives Rapier physics; Three.js `AnimationMixer` interpolates bones in presentation. |
| **4** | UI / HUD Architecture | **Reactive Store + 3D Screen Anchors** | Framework-agnostic; works seamlessly with Vanilla HTML, React, Vue, and Svelte. |
| **5** | Rendering Pipeline | **Dual-Target: WebGL default + WebGPU opt-in** | Provides rock-solid stability in current browsers while future-proofing for Three.js TSL / WebGPU shaders. |
| **6** | Character Controller | **Rapier Kinematic Character Controller (KCC)** | Eliminates slope/stair sticking bugs and integrates directly with root motion deltas. |
| **7** | Asset Management | **Unified Manifest with Ref-Counted GPU Disposal** | Prevents VRAM leaks and enables automatic headless mock buffers. |
| **8** | AI Agent Integration | **Built-in Model Context Protocol (MCP) Server** | Allows instant `stdio` pairing for Cursor, Claude, Devin, and Antigravity agents. |
| **9** | State Hashing | **$Q20.12$ Fixed-Point Integer Canopy + XXH3** | Eliminates WASM SIMD/FMA float divergence across CPU architectures. |
| **10** | Testing Framework | **Dual-Engine: JSON AST (`check()`) + Vitest Matchers** | Delivers optimal ergonomics for both machine agents and human developers. |
| **11** | Package Name | **`renderoni`** (Fallback: `@renderoni/core`) | Secure primary npm namespace; configure subpath exports in `package.json`. |

---

## 17. Decision Statement

Renderoni will be developed as the standard **deterministic 3D simulation, gameplay, and AI evaluation framework for Three.js and Rapier**.

By combining a rigorous dual-buffer deterministic physics kernel with batteries-included modular subsystems (Animation, Audio, UI, VFX — with Networking planned for post-1.0), an asset management pipeline, reference game archetype benchmarks, and a built-in MCP server, Renderoni bridges the gap between high-performance 3D web games and autonomous AI-driven development.
