# Renderoni Editor

`renderoni editor` starts a standalone local web tool for generating and
iterating on the 3D assets (models, terrain, structure, levels) of a
Renderoni game project, backed directly by the real GitHub Copilot SDK
(`@github/copilot-sdk`) — not a canned/mocked API.

This is the human-in-the-loop counterpart to the file-based
`.agents/skills/prompt-to-scene` coding-agent workflow: use the skill when an
agent is authoring a whole game end-to-end in one session; use the editor
when a human wants to iterate on one asset at a time with live visual
feedback.

## Starting it

```
cd path/to/your/game/project   # e.g. src/demo/games/echoes-of-blackwood
npx renderoni editor --port=4750
```

It serves a small static UI + a local HTTP API on the given port, and spawns
a `copilot` CLI subprocess (via the Copilot SDK) to service generation
requests. `/api/status` reports whether Copilot connected/authenticated.

## Layout: 3 tabs, folder-driven

The workspace has 4 tabs: **Models**, **Structure**, **Terrain**, **Levels**.
Which of the first three a given TypeScript file appears under is decided
purely by **which subfolder of `models/` it lives in** — see
[`docs/architecture/levels.md`](../architecture/levels.md) for the full
convention:

- `models/terrain/*.ts` → Terrain tab
- `models/structure/*.ts` → Structure tab
- everything else under `models/` → Models tab

This is implemented in `src/editor/project-assets.ts`'s
`classifyModelKind()`. It's deliberately **not** a regex over filenames or
factory names — that approach was tried first and misclassified files (e.g.
a hallway file with "hallway" in the name landing in the wrong bucket
depending on wording). Folder location is unambiguous and fully
author-controlled: you decide a file's kind by where you put it.

Levels (`scene-inventory.json` files, per the `SceneInventory` schema) get
their own tab with a 2D plot + element table view instead of a 3D preview.

## Live preview pipeline

Every model/structure/terrain card, when clicked, tries to render a live
Three.js/Renderoni canvas preview — not just show code. Two different
rendering strategies are used depending on the factory's signature:

### 1. Zero-arg / all-defaulted factories → standalone preview

If every parameter has a default value (e.g.
`createCobwebGroup(): THREE.Group`), the editor:

1. Transpiles the file's TypeScript to JS in-browser (`ts.transpileModule`).
2. Recursively resolves relative sibling-module imports (e.g. `import {
   createWoodTexture } from '../../../materials.js'`) into a graph of Blob
   URLs, so multi-file factories work without a build step.
3. Loads the resulting module, calls the factory with no arguments, and
   renders the returned `THREE.Object3D` in a bare Three.js scene with an
   orbiting camera. No Renderoni engine instance involved.

### 2. `engine`-first factories → real-engine preview

Most in-game factories have the shape `build*(engine: RenderoniEngine, ...)`
— they need a live engine to call `engine.add(...)` against. Rather than
declining to preview these (the earlier, rejected approach — "requires
arguments, no live preview available"), the editor:

1. Resolves the module graph as above, **except** imports that reach into
   Renderoni's own subsystems (bare `renderoni`/`renderoni/x` specifiers, or
   relative imports climbing above the project root into `core/`,
   `presets/`, etc.) are redirected to the engine's own pre-built `dist/`
   bundle, served statically at `/vendor/dist/*` by the editor server. This
   avoids trying to re-transpile Renderoni's internal TypeScript source
   (which pulls in Rapier/typebox and other npm-only dependencies a
   blob-URL module can't resolve on its own).
2. A document-wide `<script type="importmap">` in `index.html` maps the
   handful of bare npm specifiers the engine's `dist/` bundle still imports
   (`three`, `@dimforge/rapier3d-compat`, `@sinclair/typebox`,
   `xxhash-wasm`, `zustand`, `nipplejs`) to pinned CDN URLs, so the whole
   module graph — vendor bundle and blob-URL preview modules alike — loads
   uniformly in the browser.
3. A type-aware value synthesizer inspects the factory's remaining
   parameter list (after `engine`) and generates plausible stand-in
   arguments: numbers → `0`, strings → `"preview-<name>"`, tuples → arrays
   of synthesized items, inline object-literal parameter types → recursively
   synthesized objects.
4. `createRenderoni({ mode: 'interactive', canvas, gravity: [0, -9.81, 0]
   })` constructs a **real** engine instance (Rapier WASM physics included —
   `createRenderoni` self-initializes it), the factory is called against it
   with the synthesized args, lights are added, and a camera orbits the
   bounding box of `engine.native.scene`. The engine is disposed on cleanup.

This means every factory that's actually usable in the shipped game —
including ones requiring an `engine` and extra positional/object args — is
previewable, matching the real in-game visual, not a placeholder.

### Important gotcha: blob URLs need absolute vendor paths

Blob-URL modules (`blob:http://localhost:.../<uuid>`) cannot resolve
root-relative import specifiers like `/vendor/dist/index.js` against their
own base URL — browsers require either a relative path or a fully-qualified
absolute URL in that case. The vendor-redirect logic must build
`new URL('/vendor/dist/...', location.origin).href`, not a bare
root-relative string.

## Preview / Code toggle

Each panel has a `Preview`/`Code` toggle above the output pane (defaulting
to Preview) — the 3D result is what matters day-to-day; the generated
TypeScript source is available but de-emphasized.

## Editing existing assets vs. generating new ones

Clicking any sidebar card loads its file into the matching tab in "iterating
on `<path>`" mode — the next Generate call sends the existing source as
context to Copilot for a targeted edit, and Save writes back to the same
path. "start new instead" clears this and reverts to blank-slate generation.

## Known limitations

- The vendor bundle served at `/vendor/dist` is always the `renderoni`
  package's own build output — correct for this monorepo's demo games, but
  could mismatch an external consumer project's installed `renderoni`
  version if it differs from the one running the editor binary.
- The engine-preview path repeatedly constructs/disposes a full
  `RenderoniEngine` (with a fresh Rapier world) per preview click; this is
  simple but not optimized for rapid repeated clicking.
- Levels currently only understand the `SceneInventory` JSON schema, not
  the hand-authored assembler-factory pattern described in
  [`docs/architecture/levels.md`](../architecture/levels.md) — a project
  using pure TypeScript assemblers (like `echoes-of-blackwood`) won't show a
  meaningful level graph unless it also happens to have a (possibly stale)
  `scene-inventory.json` lying around. Reconciling these two paths is a
  likely next step.
