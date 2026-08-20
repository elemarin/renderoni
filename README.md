# 🍝 Renderoni — Three.js Game Engine for TypeScript

> ## **Three.js renders. Rapier simulates. Renderoni makes it a game.**
>
> An open-source, batteries-included **3D web game engine** built with **Three.js** and **Rapier physics**. Create browser games in TypeScript with player controllers, deterministic simulation, audio, animation, VFX, headless testing, and AI-agent tooling already wired together.

[![CI](https://github.com/elemarin/renderoni/actions/workflows/ci.yml/badge.svg)](https://github.com/elemarin/renderoni/actions)
[![Deploy Pages](https://github.com/elemarin/renderoni/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/elemarin/renderoni/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-Game_Engine-black.svg)](https://threejs.org/)
[![Rapier](https://img.shields.io/badge/Rapier-WASM_Physics-d97706.svg)](https://rapier.rs/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)

<p align="center">
  <a href="https://elemarin.github.io/renderoni/"><strong>🎮 Play the live games</strong></a>
  &nbsp;&nbsp;•&nbsp;&nbsp;
  <a href="#-quickstart"><strong>🚀 Build in minutes</strong></a>
  &nbsp;&nbsp;•&nbsp;&nbsp;
  <a href="#-ai-agent-integration-mcp-server"><strong>🤖 Connect an AI agent</strong></a>
</p>

---

## Why Renderoni?

**Three.js is an excellent renderer, but it is not a game engine.** Adding Rapier gives you physics, but you still need to build the game loop, transform synchronization, character controllers, lifecycle management, audio, VFX, UI, testing, and developer tooling.

Renderoni is the missing game-engine layer:

| What you get | Why it matters |
|---|---|
| **Three.js + Rapier, integrated** | Rendering, WASM physics, colliders, and interpolated transforms work as one system. |
| **TypeScript game presets** | Add players, rigid bodies, sensors, lights, audio, animation, UI, and VFX without engine boilerplate. |
| **Deterministic simulation** | Fixed ticks, seeded randomness, state hashing, and reproducible gameplay bugs. |
| **Headless game testing** | Run complete physics and gameplay scenarios in Node.js with Vitest—no browser screenshots required. |
| **Agent-native MCP tools** | AI coding agents can observe scenes, dispatch typed actions, advance ticks, and verify outcomes semantically. |
| **No walled garden** | Use native Three.js objects, shaders, loaders, and Rapier APIs whenever you need them. |

Renderoni is designed for **3D browser games, WebGL/WebGPU games, interactive simulations, AI-generated games, and testable Three.js applications**.

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
