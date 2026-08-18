# 🍝 Renderoni Agent Guidelines (`AGENTS.md`)

> Universal instructions for AI coding agents (Antigravity, Claude Code, Cursor, Windsurf, Copilot) working in the Renderoni codebase.

---

## 🏛️ Architecture & Kernel Rules

Renderoni is structured in 4 strict hierarchical layers:
- **L0: Deterministic Kernel (`src/core/`)**: Integer tick clock (`clock.ts`), seeded PRNG streams (`prng.ts`), dual-buffer transform pipeline (`transform-buffer.ts`), XXH3 state hashing (`hashing.ts`), resource ownership matrix (`ownership.ts`), and diagnostics (`diagnostics.ts`).
  - **Rule 1**: NEVER call `Math.random()`, `Date.now()`, `performance.now()`, or `requestAnimationFrame()` inside simulation logic or entity updates. Always use `engine.prng` and `engine.clock.tick`.
  - **Rule 2**: NEVER bypass the dual-buffer transform pipeline. Write physics transforms into canonical buffer slots, never directly into render scene graphs.
- **L1: Batteries & Subsystems (`src/presets/`, `src/animation/`, `src/audio/`, `src/vfx/`, `src/ui/`)**: High-level declarative presets (`body`, `sensor`, `light`, `kccPlayer`, `dynamicPlayer`).
- **L2: Agent Tooling & MCP (`src/mcp/`, `src/testing/`)**: Stdio/SSE Model Context Protocol server, custom Vitest matchers, and headless CLI verification.
- **L3: Web Application & Demos (`src/demo/`, `index.html`)**: Interactive playground and multi-archetype web showcases.

---

## 📦 Subpath Exports & Import Conventions

Always use subpath imports rather than deep file path hacks:

```ts
import { createRenderoni, RenderoniEngine } from 'renderoni';
import { body, kccPlayer, sensor, light, definePreset } from 'renderoni/presets';
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
