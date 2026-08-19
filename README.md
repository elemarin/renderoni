# 🍝 Renderoni

> **3D web games, served al dente.**  
> A batteries-included, agent-native 3D engine for Three.js and Rapier.  
> *Deterministic WebAssembly physics, declarative presets, and built-in Model Context Protocol (MCP) for AI pair programming.*

[![CI](https://github.com/elemarin/renderoni/actions/workflows/ci.yml/badge.svg)](https://github.com/elemarin/renderoni/actions)
[![Deploy Pages](https://github.com/elemarin/renderoni/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/elemarin/renderoni/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)

<p align="center">
  <a href="https://elemarin.github.io/renderoni/"><strong>🎮 Play Live Web Demos &rarr;</strong></a>
</p>

---

## ⚡ The Problem & The Solution

Building 3D games with **Three.js** and **Rapier WebAssembly** usually means writing thousands of lines of boilerplate: fixed timestep loops, transform interpolation, character controllers, spatial audio, particle systems, and UI projections.

At the same time, **AI coding agents** (Claude, Gemini, Cursor) struggle with 3D engines because game loops are non-deterministic black boxes that require expensive vision screenshots.

**Renderoni gives you both:**
- **For Humans:** A declarative, batteries-included 3D engine. A single `createRenderoni()` call spins up physics, rendering, camera controls, spatial audio, animation state machines, and particle systems with typed presets.
- **For AI Agents & Headless CI:** A deterministic simulation kernel with a built-in **Model Context Protocol (MCP)** server. Agents inspect scenes via lightweight semantic Markdown (<500 bytes / ~120 tokens), dispatch typed actions, and verify game state headlessly in Node.js in under 10ms.

---

## 🎮 Live Demos

Try the interactive playground live in your browser: **[elemarin.github.io/renderoni](https://elemarin.github.io/renderoni/)** (or run `npm run dev` locally).

| Demo | What It Does | Controls |
| :--- | :--- | :--- |
| **🪙 Quickstart Demo** | Live interactive browser implementation of the README quickstart: hero character, spinning gold coin sensor, audio chime, and particle burst VFX. | `WASD` / Arrows (Move Hero), `Space` (Jump), `🪙 Respawn Coin` Button |
| **✈️ Flight Simulator** | Aerodynamic flight physics with lift, drag, runway takeoff & landing, retractable landing gear, and ring course. | `W`/`S` (Pitch), `A`/`D` (Yaw), `Q`/`E` (Roll), `Shift`/`Ctrl` (Throttle), `Z`/`X` (Max/Cut), `G` (Gear), `C` (Cockpit/Chase View), `R` (Reset) |
| **🔦 Echoes of Blackwood** | Retro PSX 1st-person manor mystery: flashlight, journal clue, clock puzzle, crest, and gate escape. | `WASD` (Walk), Mouse (Look), `F` (Flashlight), `E` (Interact) |

---

## 📦 Installation

```bash
npm install renderoni three @dimforge/rapier3d-compat
```

Tree-shakable subpath exports:

```ts
import { createRenderoni } from 'renderoni';
import { body, kccPlayer, sensor, light, proceduralModel } from 'renderoni/presets';
import { mountSceneInventory } from 'renderoni/scene';
import { audio } from 'renderoni/audio';
import { animation } from 'renderoni/animation';
import { vfx } from 'renderoni/vfx';
import { ui } from 'renderoni/ui';
import { createMCPServer } from 'renderoni/mcp';
import 'renderoni/testing/matchers';
```

---

## 🚀 Quickstart

```ts
import { createRenderoni } from 'renderoni';
import { body, kccPlayer, sensor, light } from 'renderoni/presets';
import { audio } from 'renderoni/audio';
import { vfx } from 'renderoni/vfx';

// 1. Initialize engine (runs headlessly in CI or interactively in browser)
const game = await createRenderoni({
  mode: 'interactive', // or 'headless'
  seed: 42,
  loop: { enabled: true, title: 'My Game', subtitle: 'Press Play' },
  subsystems: [
    audio({ volume: 0.8 }),
    vfx({ particles: true }),
  ],
});

// 2. Add Environment & Lighting
game.add(light({ type: 'directional', position: [20, 40, 20] }));
game.add(body({ shape: 'box', type: 'fixed', size: [100, 1, 100], position: [0, 0, 0] }));

// 3. Add Collectible Item
const coin = game.add(sensor({
  id: 'golden_coin',
  shape: 'sphere',
  radius: 0.6,
  position: [4, 1.2, 0],
}));

// 4. Add Player Character
const player = game.add(kccPlayer({
  id: 'hero',
  position: [0, 1.5, 0],
  moveSpeed: 6.5,
}));

// 5. Handle Gameplay Events
game.events.on('sensor.enter', ({ sensor, target }) => {
  if (sensor.id === 'golden_coin' && target.id === 'hero') {
    game.audio.play('coin_pickup');
    game.vfx.spawnParticles({ count: 16, position: [4, 1.2, 0] });
    coin.destroy();
  }
});

// 6. Run headlessly (CI/Tests) or start interactive render loop (Browser)
game.step(60);   // Step 60 fixed ticks in ~1ms (Headless CI)
// game.start(); // Start 60fps presentation loop (Browser)
```

---

## 🤖 AI Agent Integration (MCP Server)

Connect Claude Desktop, Antigravity, Cursor, or any MCP client directly to your simulation:

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

### Built-in MCP Tools:
- **`describe`**: Returns active entities, colliders, tags, and engine schemas.
- **`observe`**: Returns ultra-dense **Tier 0 Markdown summaries (<500B / ~120 tokens)** with positions, velocities, and game state.
- **`act`**: Injects deterministic semantic gameplay actions (`game.act({ name, payload })`).
- **`step`**: Advances the simulation by $N$ fixed ticks and returns state hashes.
- **`check`**: Evaluates machine AST assertions.

---

## 🖼️ Prompt → scene (img2threejs)

Agents should not dump a whole game into one prompt. Keep a **compact inventory JSON** in context, reconstruct each unique object with [img2threejs](https://github.com/img2threejs/img2threejs), then mount:

```ts
import { createRenderoni } from 'renderoni';
import { kccPlayer, light } from 'renderoni/presets';
import { mountSceneInventory, type SceneInventory } from 'renderoni/scene';
import { createWoodCrateModel } from './generated/woodCrate.js';

const inventory: SceneInventory = {
  version: 1,
  prompt: 'stone courtyard with a crate and a coin',
  elements: [
    { id: 'crate', factory: 'woodCrate', kind: 'prop', position: [0, 0.5, 0], collider: { shape: 'box', size: [1, 1, 1] } },
  ],
};

const game = await createRenderoni({ mode: 'headless', seed: 42 });
game.add(light({ type: 'directional', position: [12, 20, 8] }));
mountSceneInventory(game, inventory, { woodCrate: createWoodCrateModel });
game.add(kccPlayer({ id: 'hero', position: [0, 1.5, 6] }));
```

Skill: `.agents/skills/prompt-to-scene/SKILL.md`.

---

## 🧪 Headless Testing with Vitest

Run complete game integration tests headlessly in Node.js in under 10ms with custom Vitest matchers:

```ts
import { expect, test } from 'vitest';
import { createRenderoni } from 'renderoni';
import { kccPlayer, sensor } from 'renderoni/presets';
import 'renderoni/testing/matchers';

test('player collects coin and verifies state hash', async () => {
  const game = await createRenderoni({ mode: 'headless', seed: 42 });
  const hero = game.add(kccPlayer({ id: 'hero', position: [0, 1, 0] }));
  const coin = game.add(sensor({ id: 'coin', position: [3, 1, 0] }));

  hero.actions.move({ x: 1, z: 0 });
  game.step(60);

  expect(game).toHaveTick(60);
  expect(hero.position[0]).toBeGreaterThan(1.5);
  expect(game).toHavePassedDiagnostics();
});
```

---

## 🏛️ Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              L3 APPLICATION                            │
│           Game Rules, Custom Assets, Levels, Shaders, UI Layouts       │
├────────────────────────────────────────────────────────────────────────┤
│                           L2 TOOLING & AGENTS                          │
│     Built-in MCP Server (stdio/SSE), Vitest Matchers, Live Inspector   │
├────────────────────────────────────────────────────────────────────────┤
│                         L1 BATTERIES & SUBSYSTEMS                      │
│   Spatial Audio • Skeletal Animation • UI Projections • VFX Emitters   │
│   Declarative Presets: body, sensor, light, kccPlayer, dynamicPlayer   │
├────────────────────────────────────────────────────────────────────────┤
│                          L0 DETERMINISTIC KERNEL                       │
│   Integer Tick Clock • Seeded PRNG • Dual-Buffer Transform Pipeline    │
│   Quantized State Hashing (XXH3) • Resource Ownership Tracking         │
├────────────────────────────────────────────────────────────────────────┤
│                             NATIVE ENGINES                             │
│       Three.js (WebGL / WebGPU)   │   @dimforge/rapier3d-compat (WASM) │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📜 License

MIT © [Esteban Leandro Marín](https://github.com/elemarin)
