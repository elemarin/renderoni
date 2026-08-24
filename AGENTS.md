# 🍝 Renderoni Agent Guidelines (`AGENTS.md`)

> Universal instructions for AI coding agents (Antigravity, Claude Code, Cursor, Windsurf, Copilot) working in the Renderoni codebase.

---

## 🏛️ Architecture & Kernel Rules

Renderoni is structured in 4 strict hierarchical layers:
- **L0: Deterministic Kernel (`src/core/`)**: Integer tick clock (`clock.ts`), seeded PRNG streams (`prng.ts`), dual-buffer transform pipeline (`transform-buffer.ts`), XXH3 state hashing (`hashing.ts`), resource ownership matrix (`ownership.ts`), and diagnostics (`diagnostics.ts`).
  - **Rule 1**: NEVER call `Math.random()`, `Date.now()`, `performance.now()`, or `requestAnimationFrame()` inside simulation logic or entity updates. Always use `engine.prng` and `engine.clock.tick`.
  - **Rule 2**: NEVER bypass the dual-buffer transform pipeline. Write physics transforms into canonical buffer slots, never directly into render scene graphs.
- **L1: Batteries & Subsystems (`src/presets/`, `src/animation/`, `src/audio/`, `src/vfx/`, `src/ui/`, `src/scene/`)**: High-level declarative presets (`body`, `sensor`, `light`, `kccPlayer`, `dynamicPlayer`, `proceduralModel`) and compact scene inventories for prompt → img2threejs factories.
- **L2: Agent Tooling & MCP (`src/mcp/`, `src/testing/`)**: Stdio Model Context Protocol server, custom Vitest matchers, and headless CLI verification.
- **L3: Web Application & Demos (`src/demo/`, `index.html`)**: Interactive playground and multi-archetype web showcases.

---

## 📦 Subpath Exports & Import Conventions

Always use subpath imports rather than deep file path hacks:

```ts
import { createRenderoni, RenderoniEngine } from 'renderoni';
import { body, kccPlayer, sensor, light, definePreset, proceduralModel } from 'renderoni/presets';
import { mountSceneInventory, parseSceneInventory } from 'renderoni/scene';
import { audio } from 'renderoni/audio';
import { animation } from 'renderoni/animation';
import { vfx } from 'renderoni/vfx';
import { ui } from 'renderoni/ui';
import { createMCPServer } from 'renderoni/mcp';
import 'renderoni/testing/matchers';
```

---

## 🧪 Verification & Build Commands

Always run the full test suite when making changes:

- **Type Check**: `npm run typecheck` (`tsc --noEmit`)
- **Unit & Integration Tests**: `npm test` (`vitest run`)
- **Package Build**: `npm run build` (`tsup`)
- **Web Demo Build**: `npm run build:web` (`vite build`)
- **Live Local Dev Server**: `npm run dev` (Vite on `http://localhost:5173`)

---

## 🤖 MCP Agent Tools

When connected over MCP (`bin/renderoni.js mcp`), use:
- **`describe`**: Inspect active entities, colliders, tags, and schema.
- **`observe`**: Get Tier 0 Markdown telemetry (<500 bytes / ~120 tokens).
- **`act`**: Dispatch typed gameplay actions (`{ name: string, payload?: any }`).
- **`step`**: Advance simulation by $N$ fixed ticks.
- **`check`**: Run AST assertions.

---

## 🧑‍🎨 Renderoni Editor (`src/editor/`)

`renderoni editor` starts a standalone local server + tabbed web UI (Models /
Terrain / Levels) that drives the **GitHub Copilot SDK** (`@github/copilot-sdk`,
an `optionalDependency`) for live, in-browser content generation:

- Each tab sends one prompt (+ optional reference image) through a single
  Copilot turn with a tab-specific system prompt (`src/editor/prompts.ts`),
  and expects exactly one fenced code/JSON block back.
- Models/Terrain tabs return a `() => THREE.Object3D` factory, live-previewed
  in the browser via a dynamic `Function` sandboxed to a `THREE` binding.
- The Levels tab returns a `SceneInventory` JSON compatible with
  `parseSceneInventory` / `mountSceneInventory` (`renderoni/scene`).
- Generated output can be saved into the caller's project via `/api/save`,
  which only writes under the directory `renderoni editor` was started from.
- The Copilot SDK spawns/talks to the local `copilot` CLI over JSON-RPC, so it
  only runs in Node (`src/editor/copilot-session.ts`), never in the browser.

This is a live, in-app alternative to the file-based `.agents/skills/prompt-to-scene`
agent workflow — use whichever fits: the skill for a coding-agent session
authoring a whole game, the editor for a human iterating on one asset at a time.
