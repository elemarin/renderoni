# 🍝 Renderoni

> **Three.js and Rapier, already wired up.**

Renderoni is an open-source 3D web game engine. It wires Three.js and Rapier into a fixed game loop with player controls, headless tests, and tools for coding agents.

[![CI](https://github.com/elemarin/renderoni/actions/workflows/ci.yml/badge.svg)](https://github.com/elemarin/renderoni/actions)
[![Deploy Pages](https://github.com/elemarin/renderoni/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/elemarin/renderoni/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Beta-0.9.0-blue.svg)](#)

[🕹️ Play the console OS](#-live-console-games) • [🚀 Quickstart](#-install--quickstart) • [🤖 MCP Agent Tools](#-mcp-agent-tools)

---

## 📦 Install & Quickstart

Install the beta release. (Note: npm package is not yet published in this repo worktree, so consider these commands the beta release contract).

```bash
npm install renderoni@beta three @dimforge/rapier3d-compat
```

When a stable 1.0 release is published, the future stable install command will be `npm install renderoni three @dimforge/rapier3d-compat`.

Here's how you spawn a player, a floor, and a coin in a real browser:

```ts
import { createRenderoni } from 'renderoni';
import { body, kccPlayer, light, sensor } from 'renderoni/presets';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Expected <canvas id="game">');

const game = await createRenderoni({
  mode: 'interactive',
  canvas,
  seed: 42,
});

game.add(light({ type: 'directional', position: [20, 40, 20] }));
game.add(body({ shape: 'box', type: 'fixed', size: [100, 1, 100], position: [0, -0.5, 0] }));
const player = game.add(kccPlayer({ id: 'hero', position: [0, 1, 0], moveSpeed: 6.5 }));
game.add(sensor({ id: 'coin', position: [3, 1, 0] }));

const resize = () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (game.native.renderer) {
    game.native.renderer.setSize(width, height, false);
  }
  game.native.camera.aspect = width / height;
  game.native.camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(canvas);
resize();
game.start();
```

---

## 🧪 Headless Testing

You can run that exact same game headlessly in Vitest. No browser, no visual regression screenshots, just deterministic physics and game logic running in Node.js.

```ts
import { expect, test } from 'vitest';
import { createRenderoni } from 'renderoni';
import { body, kccPlayer, sensor } from 'renderoni/presets';
import 'renderoni/testing/matchers';

test('player collects coin', async () => {
  const game = await createRenderoni({ mode: 'headless', seed: 42 });
  game.add(body({ shape: 'box', type: 'fixed', size: [100, 1, 100], position: [0, -0.5, 0] }));
  const hero = game.add(kccPlayer({ id: 'hero', position: [0, 1, 0] }));
  game.add(sensor({ id: 'coin', position: [3, 1, 0] }));

  hero.actions.move({ x: 1, z: 0 });
  game.step(60);

  expect(game).toHaveTick(60);
  expect(hero.position[0]).toBeGreaterThan(1.5);
  expect(game).toHavePassedDiagnostics();
});
```

---

## 🤔 Why use Renderoni?

If you've ever built a game in Three.js, you know rendering is just the first step. Renderoni solves the boilerplate:

- **Three.js + Rapier Sync**: Visuals and physics transforms interpolate perfectly.
- **Deterministic Scope**: Fixed ticks, seeded PRNG, and quantized state hashing. Run it twice, get the same result.
- **Useful Presets**: Players, rigid bodies, sensors, lights.
- **Headless Node.js Testing**: Run full physics and game logic in Vitest.
- **AI-Agent Ready**: Built-in stdio MCP server for agent tooling.
- **Native Escape Hatches**: Direct access to `game.native.scene`, `.camera`, and `.world` when you need standard Three/Rapier features.

---

## 🚦 Feature Status

Renderoni is currently in `0.9.0-beta.1`. Here is exactly what works today and what is coming post-1.0.

| Feature | Status | Notes |
|---|---|---|
| Engine Core (Ticks, PRNG) | 🟢 Stable Beta | Exact run-to-run hashes on the pinned matrix. |
| Physics Sync | 🟢 Stable Beta | Dual-buffer interpolation. |
| Audio Events | 🟡 Preview | Records and emits sound events. Connect your own playback. |
| VFX Triggers | 🟡 Preview | Screen shake and VFX event hooks. Rendered particles are planned. |
| Model Studio | 🟡 Preview | Local notes/screenshots/JSON export only. No project persistence. |
| Networking / SSE | 🔴 Post-1.0 | Removed until stable release. |
| Gamepads | 🔴 Post-1.0 | Keyboards, mice, and touch only right now. |
| Bloom / GPU Particles | 🔴 Post-1.0 | Not available yet. |

---

## 🤖 MCP Agent Tools

Connect Claude Desktop, Antigravity, Cursor, or any MCP client directly to your game. Renderoni uses a `stdio` MCP server (no network required).

To start the MCP server:

```bash
npx renderoni@beta mcp
```

The server exposes five tools for coding agents:

- **`describe`**: Inspect engine configuration, active entities, and registered actions.
- **`observe`**: Get a Tier 0 Markdown summary (at most 500 bytes) of positions, tags, state, and recent events.
- **`act`**: Dispatch typed gameplay actions (`{ name, payload }`).
- **`step`**: Advance the simulation by $N$ fixed ticks.
- **`check`**: Run AST assertions against the engine state.

---

## 🧑‍🎨 In-App Editor

Generate models, terrain, and levels without leaving the browser. `renderoni editor`
starts a local tool backed by the GitHub Copilot SDK for live, in-editor
generation, grounded in the same rules your coding agent already follows
(see `.agents/skills/prompt-to-scene`), so the CLI and the editor stay in sync.

```bash
npx renderoni@beta editor
```

- **Models / Terrain tabs** — prompt (plus an optional reference image) into a
  previewed `() => THREE.Object3D` factory, compared side-by-side against the
  current on-disk version before you save.
- **Levels tab** — prompt into a compact `SceneInventory` JSON, mountable with
  `mountSceneInventory` (`renderoni/scene`).
- Reconstruction under the hood follows [img2threejs](https://github.com/img2threejs/img2threejs)
  conventions.

---

## 🕹️ Live Console Games

We built a fun Console OS web app to showcase the engine. Play it to see the physics, inputs, and graphics in action.

| Game | Description | Controls |
|---|---|---|
| **🪙 Quickstart Demo** | The README hero character, coin sensor, audio chime, and particle burst VFX. | `WASD` / Arrows (Move), `Space` (Jump) |
| **✈️ Flight Simulator** | Aerodynamic physics, runway takeoff, landing gear, and ring course. | `W`/`S` (Pitch), `A`/`D` (Roll), `Q`/`E` (Yaw), `Shift`/`Ctrl` (Throttle), `Z`/`X` (Max/Cut), `G` (Gear), `C` (Camera), `R` (Reset) |
| **🔦 Echoes of Blackwood** | Retro PSX 1st-person manor mystery: flashlight, clock puzzle, and escape. | `WASD` (Walk), Mouse (Look), `F` (Flashlight), `E` (Interact) |

*Mobile support: Dual virtual sticks. Mid/high-end current phones target 45 FPS.*

---

## 🧩 Public Subpaths

Renderoni uses tree-shakable subpath exports. Network exports have been removed for the beta.

| Subpath | Purpose |
|---|---|
| `renderoni` | Core `createRenderoni` entrypoint. |
| `renderoni/core` | Internal engine types (`RenderoniEngine`). |
| `renderoni/presets` | `body`, `sensor`, `light`, `kccPlayer`, `proceduralModel`. |
| `renderoni/animation` | Skeletal animation helpers. |
| `renderoni/audio` | Audio event records and hooks. |
| `renderoni/ui` | UI overlay components. |
| `renderoni/vfx` | Screen shake and VFX event hooks. |
| `renderoni/scene` | `mountSceneInventory` and scene parsing. |
| `renderoni/mcp` | Node.js MCP server entrypoint. |
| `renderoni/testing` | Framework-free assertion checks for headless tests. |
| `renderoni/testing/matchers` | Custom Vitest matchers (requires `vitest` peer dependency). |
| `renderoni/input` | Player input management. |

---

## 🔒 Determinism & Beta Contract

Renderoni targets **consistent gameplay and run-to-run determinism** across devices.

However, **exact state hashes** (bit-for-bit identical state) are currently only guaranteed on our pinned `Node 22 Linux x64` CI matrix. Floating-point math variations in different browsers or architectures may cause minor hash divergences over long sessions.

---

## 🛠️ Development & Support

To work on Renderoni itself:

- `npm install` (Install dependencies)
- `npm run dev` (Start Vite dev server)
- `npm run typecheck` (Check types)
- `npm test` (Run unit and integration tests)
- `npm run gate:beta` (Run the beta validation suite)

### Links

- **Support & Issues**: [GitHub Issues](https://github.com/elemarin/renderoni/issues)
- **Security**: [Security Policy](https://github.com/elemarin/renderoni/security/policy)
- **License**: [MIT License](https://opensource.org/licenses/MIT)
