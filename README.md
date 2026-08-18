# 🍝 Renderoni

> **Deterministic by design. Al dente by default.**  
> A batteries-included, agent-native 3D simulation and gameplay framework for Three.js and Rapier.

[![CI](https://github.com/elemarin/renderoni/actions/workflows/ci.yml/badge.svg)](https://github.com/elemarin/renderoni/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

---

## 🌟 What is Renderoni?

Three.js is the standard for web graphics; Rapier is the standard for fast WebAssembly physics. Connecting them into a production-grade, testable, and reproducible 3D application requires massive repetitive boilerplate: managing fixed timestep loops, transform synchronization, visual interpolation, asset lifecycles, character controllers, skeletal animations, spatial audio, UI projections, and network replication.

For autonomous AI coding agents and automated CI test runners, this architecture is historically opaque: Three.js and Rapier scenes are mutable, non-deterministic black boxes that require costly vision snapshots and fragile browser automation.

**Renderoni solves this with a unified, dual-nature architecture:**
1. **For Human Developers:** A batteries-included, ergonomic 3D game framework. A single call to `createRenderoni()` spins up physics, rendering, camera management, asset loading, animation state machines, spatial audio, UI projections, and particle effects with typed presets and zero boilerplate.
2. **For AI Agents & CI Suites:** A headless-first, deterministic simulation and verification kernel. It provides token-efficient semantic observations (<500B Markdown summaries), JIT-validated semantic actions, fixed-point state hashing, keyframed replays, and a built-in Model Context Protocol (MCP) server for instant agent pairing.

---

## 📦 Installation & Subpath Exports

```bash
npm install renderoni three @dimforge/rapier3d-compat
```

Renderoni ships as a single package with tree-shakable subpath exports:

```ts
import { createRenderoni } from 'renderoni';
import { body, kccPlayer, sensor, light } from 'renderoni/presets';
import { animation } from 'renderoni/animation';
import { audio } from 'renderoni/audio';
import { ui } from 'renderoni/ui';
import { vfx } from 'renderoni/vfx';
import { network } from 'renderoni/network';
import { createMCPServer } from 'renderoni/mcp';
import '@renderoni/testing/matchers';
```

---

## 🚀 Playable Quickstart

```ts
import { createRenderoni } from 'renderoni';
import { body, kccPlayer, sensor, light } from 'renderoni/presets';
import { audio } from 'renderoni/audio';
import { animation } from 'renderoni/animation';
import { vfx } from 'renderoni/vfx';
import { ui } from 'renderoni/ui';

// 1. Initialize complete batteries-included game
const game = await createRenderoni({
  mode: 'interactive', // 'interactive' or 'headless'
  seed: 42,
  subsystems: [
    audio({ volume: 0.8 }),
    animation(),
    vfx({ bloom: true }),
    ui(),
  ],
});

// 2. Add Environment & Lighting
game.add(light({ type: 'directional', position: [5, 10, 5], castShadow: true }));
game.add(body({ shape: 'box', type: 'fixed', size: [100, 1, 100], position: [0, 0, 0] }));

// 3. Add Interactive Collectible
const coin = game.add(sensor({
  id: 'coin',
  shape: 'sphere',
  radius: 0.5,
  position: [5, 1, 0],
}));

// 4. Add Animated Kinematic Player
const hero = game.add(kccPlayer({
  id: 'hero',
  position: [0, 1.5, 0],
  moveSpeed: 6.0,
  jumpSpeed: 8.5,
}));

// 5. Gameplay Logic via Events
game.events.on('sensor.enter', ({ sensor, target }) => {
  if (sensor.id === 'coin' && target.id === 'hero') {
    game.audio.play('coin');
    game.vfx.spawnParticles({ count: 20, position: [5, 1, 0] });
    coin.destroy();
  }
});

// 6. Step Simulation or Start Interactive Presentation Loop
game.step(60); // In headless CI / tests
```

---

## 🤖 AI Agent Integration (MCP Server)

Renderoni includes a built-in **Model Context Protocol (MCP)** server over `stdio` and `SSE`:

```json
{
  "mcpServers": {
    "renderoni": {
      "command": "npx",
      "args": ["renderoni", "mcp"]
    }
  }
}
```

### Supported MCP Tools:
- **`describe`**: Returns active entities, component schemas, and simulation metadata.
- **`observe`**: Returns token-efficient **Tier 0 Markdown summaries (<500 bytes / ~120 tokens)** or Tier 1 delta observations.
- **`act`**: Injects deterministic semantic gameplay actions (`game.act({ name, payload })`).
- **`step`**: Advances the simulation by $N$ fixed ticks and returns updated state hashes.
- **`check`**: Evaluates machine AST assertions.

---

## 🧪 Testing with Vitest

```ts
import { expect, test } from 'vitest';
import { createRenderoni } from 'renderoni';
import { kccPlayer, sensor } from 'renderoni/presets';
import 'renderoni/testing/matchers';

test('hero collects coin after moving right', async () => {
  const game = await createRenderoni({ mode: 'headless', seed: 42 });
  const hero = game.add(kccPlayer({ id: 'hero', position: [0, 1, 0] }));
  const coin = game.add(sensor({ id: 'coin', position: [3, 1, 0] }));

  hero.actions.move({ x: 1, z: 0 });
  game.step(60);

  expect(game).toHaveTick(60);
  expect(hero.position[0]).toBeGreaterThan(1.0);
  expect(game).toHavePassedDiagnostics();
});
```

---

## 🏛️ Architecture

```
+---------------------------------------------------------------------------------------+
|                                     L3 APPLICATION                                    |
|             Game Rules, Assets, Content Data, Custom Shaders, UI Layouts              |
+---------------------------------------------------------------------------------------+
|                                  L2 TOOLING & AGENTS                                  |
|         Built-in MCP Server (stdio/SSE), Vitest Matchers, Replay CLI, Debug UI         |
+---------------------------------------------------------------------------------------+
|                                L1 BATTERIES & SUBSYSTEMS                              |
|   Animation State Machine | Spatial Audio | UI Screen Anchors | VFX Emitters | Net    |
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

---

## 📜 License

MIT © [Esteban Leandro Marín](https://github.com/elemarin)
