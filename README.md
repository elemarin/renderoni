# 🍝 Renderoni

> **Three.js and Rapier, already wired up.**

Renderoni is an open-source 3D web game engine for TypeScript. It wires Three.js and Rapier WASM into a deterministic fixed-tick simulation loop with runtime scene hierarchy, character controllers, dual-mode Web Audio, pooled instanced particle VFX, headless CI testing, and agent-native CLI / MCP tooling.

[![CI](https://github.com/elemarin/renderoni/actions/workflows/ci.yml/badge.svg)](https://github.com/elemarin/renderoni/actions)
[![Deploy Pages](https://github.com/elemarin/renderoni/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/elemarin/renderoni/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Release-1.0.0-blue.svg)](#)

[🚀 Quickstart](#-install--quickstart) • [⚡ CLI Tooling](#-cli--asset-generation) • [🏛️ Scene Composition](#-runtime-scene-composition-game---level---scene) • [🔊 Audio & VFX](#-audio--vfx-subsystems) • [🤖 MCP Agent Tools](#-mcp-agent-tools) • [🚦 Feature Status](#-feature-status)

---

## 📦 Install & Quickstart

Install Renderoni alongside Three.js and Rapier:

```bash
npm install renderoni three @dimforge/rapier3d-compat
```

Here is how you spawn a player, a floor, and a coin in a real browser:

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

## ⚡ CLI & Asset Generation

Renderoni provides a built-in CLI (`renderoni`) for AI-assisted asset authoring, offline template scaffolding, and live in-browser previewing:

### 1. `renderoni generate <kind> "<prompt>"`
Generates a self-contained Three.js factory or scene manifest using GitHub Copilot:

```bash
# Generate a 3D model factory from prompt
npx renderoni generate model "weathered brass lantern with flickering flame" -o models/Lantern.ts

# Generate terrain shell
npx renderoni generate terrain "mossy cobblestone dungeon floor" -o models/terrain/DungeonFloor.ts

# Generate scene inventory with reference image
npx renderoni generate scene "grand library with book stacks" -i refs/library.png -o scenes/library.json

# Dry run with machine-readable JSON output
npx renderoni generate model "crystal altar" --dry-run --json
```

**Flags:**
- `-o, --output <path>`: Destination file path.
- `-i, --image <path>`: Reference image (`.png`, `.jpg`, `.webp`).
- `-r, --revise <path>`: Existing file to revise with Copilot.
- `--project <path>`: Target project directory (default: `cwd`).
- `-f, --force`: Overwrite existing files.
- `--dry-run`: Validate and print output without writing to disk.
- `--json`: Output structured JSON for automation scripts.
- `--no-context`: Skip scanning project for existing factory names.

### 2. `renderoni add <kind> <name>`
100% offline, zero-turn boilerplate scaffolding (no API keys or credentials needed):

```bash
npx renderoni add model TreasureChest -o models/TreasureChest.ts
npx renderoni add terrain StoneFloor -o models/terrain/StoneFloor.ts
npx renderoni add scene Courtyard -o scenes/courtyard.json
npx renderoni add level Chapter1 -o levels/chapter1.json
```

### 3. `renderoni editor`
Starts the local visual authoring studio on `http://localhost:4747`:

```bash
npx renderoni editor --port=4747
```

### 4. `renderoni mcp`
Starts the Model Context Protocol stdio server for AI coding agents.

---

## 🏛️ Runtime Scene Composition (`Game -> Level -> Scene`)

Renderoni 1.0 supports structured multi-scene progression with deterministic lifecycle management and persistent cross-scene state:

```ts
import { createRenderoni } from 'renderoni';
import { SceneManager, type SceneDefinition } from 'renderoni/scene';

const game = await createRenderoni({ mode: 'headless', seed: 42 });
const manager = new SceneManager(game);

const courtyardScene: SceneDefinition = {
  id: 'courtyard',
  setup: (ctx) => {
    // Entities spawned here are tracked for automatic RAII cleanup on unload
  },
};

const hallwayScene: SceneDefinition = {
  id: 'hallway',
  entryPoints: {
    from_courtyard: { id: 'from_courtyard', position: [0, 1, 0] },
  },
};

await manager.loadGame({
  id: 'manor_adventure',
  startLevel: 'chapter_1',
  persistentEntities: ['hero_player'], // Preserved across scene transitions
  levels: [
    {
      id: 'chapter_1',
      startScene: 'courtyard',
      scenes: [courtyardScene, hallwayScene],
    },
  ],
});

// Teleports persistent actors to entry point and updates Rapier physics buffers
await manager.switchScene('hallway', { entryPoint: 'from_courtyard' });

// Access cross-scene persistent state
manager.persistent.set('hasKey', true);
```

---

## 🧪 Headless Testing

Run full gameplay loops and physics headlessly in Vitest with $<10\text{ms}$ execution time:

```ts
import { expect, test } from 'vitest';
import { createRenderoni } from 'renderoni';
import { body, kccPlayer, sensor } from 'renderoni/presets';
import 'renderoni/testing/matchers';

test('player collects coin deterministically', async () => {
  const game = await createRenderoni({ mode: 'headless', seed: 42 });
  game.add(body({ shape: 'box', type: 'fixed', size: [100, 1, 100], position: [0, -0.5, 0] }));
  const hero = game.add(kccPlayer({ id: 'hero', position: [0, 1, 0] }));
  game.add(sensor({ id: 'coin', position: [3, 1, 0] }));

  hero.actions.move({ x: 1, z: 0 });
  game.step(60);

  expect(game).toHaveTick(60);
  expect(hero.position[0]).toBeGreaterThan(1.5);
  expect(game).toHavePassedDiagnostics();
  game.dispose();
});
```

---

## 🔊 Audio & VFX Subsystems

- **Audio (`renderoni/audio`)**: Dual-mode Web Audio in interactive mode with one-shot user gesture autoplay resume (`pointerdown`/`keydown`), HRTF 3D spatial panning, master volume scaling, and zero-DOM deterministic event logging in headless mode.
- **VFX (`renderoni/vfx`)**: Preallocated Structure-of-Arrays (SoA) particle pools with zero heap allocation churn during gameplay, billboard `THREE.InstancedMesh` rendering, and deterministic PRNG-driven screen shake.

---

## 🤖 MCP Agent Tools

When connected to AI coding assistants (Antigravity, Claude Code, Cursor), use Renderoni's built-in MCP server:

```bash
npx renderoni mcp
```

- **`describe`**: Inspect active entities, colliders, tags, and schema.
- **`observe`**: Get compact Markdown telemetry (<500 bytes / ~120 tokens).
- **`act`**: Dispatch typed gameplay actions (`{ name: string, payload?: any }`).
- **`step`**: Advance simulation by $N$ fixed ticks.
- **`check`**: Run AST assertions headlessly.

---

## 🚦 Feature Status

| Feature | Status | Notes |
|---|---|---|
| Deterministic Kernel (Clock, PRNG, Hasher) | 🟢 Production (1.0) | Exact run-to-run XXH3 state hashes across runs. |
| Physics Sync & Dual-Buffer Pipeline | 🟢 Production (1.0) | Zero render interpolation bleeds into physics buffer. |
| Scene Hierarchy (`Game -> Level -> Scene`) | 🟢 Production (1.0) | `SceneManager`, `SceneContext`, persistent state store, RAII disposal. |
| CLI Generation & Offline Scaffolding | 🟢 Production (1.0) | `renderoni generate`, `renderoni add`, safe path traversal guards. |
| Audio Subsystem (`renderoni/audio`) | 🟢 Production (1.0) | Browser Web Audio + HRTF spatial sound & headless event verification. |
| VFX Subsystem (`renderoni/vfx`) | 🟢 Production (1.0) | Structure-of-Arrays particle pool & procedural screen shake. |
| MCP Agent Protocol | 🟢 Production (1.0) | Native stdio transport with Tier 0 telemetry. |
| Headless CI Testing | 🟢 Production (1.0) | Node.js execution with custom Vitest matchers. |

---

## 📦 Subpath Exports

```ts
import { createRenderoni, RenderoniEngine } from 'renderoni';
import { body, kccPlayer, sensor, light, definePreset } from 'renderoni/presets';
import { SceneManager, mountSceneInventory, parseSceneInventory } from 'renderoni/scene';
import { audio, AudioManager } from 'renderoni/audio';
import { vfx, ParticleEmitter, ScreenShake } from 'renderoni/vfx';
import { ui } from 'renderoni/ui';
import { animation } from 'renderoni/animation';
import { startEditorServer, generateAsset, scaffoldAsset } from 'renderoni/editor';
import { createMCPServer } from 'renderoni/mcp';
import 'renderoni/testing/matchers';
```

---

## 📄 License

MIT © [Esteban Leandro](https://github.com/elemarin)
