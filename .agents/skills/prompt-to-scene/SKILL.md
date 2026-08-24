---
name: prompt-to-scene
description: >-
  Turn a game prompt into a Renderoni scene with a compact inventory JSON,
  optional reference image, and img2threejs object factories. Use when the user
  wants prompt-to-game, image-to-scene, or token-efficient 3D content.
---

# Prompt → image → img2threejs → Renderoni

Do **not** one-shot a whole game as a giant TypeScript file. Keep the agent
context small: one prompt, one scene image, one inventory JSON, then reconstruct
**unique objects** independently.

Upstream reconstruction skill: [img2threejs](https://github.com/img2threejs/img2threejs).
Renderoni only mounts the resulting `() => THREE.Group` factories.

## Token budget (hard rules)

1. Keep the **inventory JSON** in context. Target < 800 tokens.
2. Never paste img2threejs `SKILL.md`, forge scripts, or generated factory source
   into the main game conversation after the factory is written to disk.
3. Reconstruct **one unique `factory` key per isolated pass**. Reuse the same
   factory for repeated props (10 trees = 1 factory).
4. Gameplay stays in Renderoni presets (`kccPlayer`, `sensor`, `body`, `light`).
   Factories are visuals + collider hints only.

## Pipeline

```
prompt
  → one scene image (optional but preferred)
  → compact SceneInventory JSON
  → unique factory list
  → img2threejs per factory (or fallback primitive)
  → mountSceneInventory(engine, inventory, factories)
  → add player / win-lose with presets
```

### 1. Inventory first

Write `scene-inventory.json` using `SceneInventory` from `renderoni/scene`:

```json
{
  "version": 1,
  "prompt": "stone courtyard with crate, lantern, tree, well, coin",
  "image": "refs/courtyard.png",
  "seed": 42,
  "elements": [
    {
      "id": "crate",
      "factory": "woodCrate",
      "kind": "prop",
      "position": [-3, 0.55, -2],
      "collider": { "shape": "box", "size": [1.1, 1.1, 1.1] }
    }
  ]
}
```

`kind`: `terrain` | `prop` | `actor` | `pickup` | `decor`.
`factory` is a registry key, not source code.

### 2. Scene image (optional)

If the user has no image, generate **one** wide establishing shot of the whole
scene. Then list visible objects. Use `imageRegion` (normalized 0–1) only when
cropping helps reconstruction. Do not generate a separate image per blade of
grass.

### 3. Reconstruct unique objects

For each key from `uniqueFactories(inventory)`:

1. Crop or isolate that object from the scene image when possible.
2. Invoke the **img2threejs** skill on that crop.
3. Save `createXxxModel()` to `src/demo/games/<game>/models/<Factory>.ts`.
   That folder is the img2threejs drop zone — one object per file, next to
   `state.ts` / `game.ts` so reconstruction stays out of the tick loop.
4. Register `{ [factory]: createXxxModel }` or `engine.add(model({ object: createXxxModel() }))`.

If img2threejs is unavailable, `mountSceneInventory` already falls back to
colored primitives from the collider hint so gameplay can be tested first.

### 4. Mount in Renderoni

```ts
import { createRenderoni } from 'renderoni';
import { kccPlayer, light } from 'renderoni/presets';
import { mountSceneInventory } from 'renderoni/scene';
import { createWoodCrateModel } from './generated/woodCrate.js';

const game = await createRenderoni({ mode: 'headless', seed: 42 });
game.add(light({ type: 'directional', position: [12, 20, 8] }));
mountSceneInventory(game, inventory, { woodCrate: createWoodCrateModel });
game.add(kccPlayer({ id: 'hero', position: [0, 1.5, 6] }));
```

### 5. Verify cheaply

Use MCP `observe` / `step` / `check` or Vitest. Do not screenshot-loop the
whole scene to author gameplay.

## What not to do

- Do not vendor img2threejs into this repo.
- Do not rebuild a whole diorama as one factory unless the user asked for a
  single hero prop.
- Do not call `Math.random()` / `Date.now()` in simulation updates.
- Do not write generated meshes directly into `THREE.Scene` — use
  `proceduralModel` / `mountSceneInventory` so Rapier + the transform pipeline
  own the object.

## Factory contract (binding — CLI agent and in-app editor both follow this)

This is the exact contract every generated model/terrain factory MUST satisfy,
whether it's produced by a coding-agent session or by the `renderoni editor`'s
Copilot SDK turn. Both surfaces read this section as their source of truth —
do not fork or duplicate these rules elsewhere.

1. **Self-contained, zero imports beyond `three`.** `import * as THREE from
   'three'` only. Never import another project file, sibling module, or
   relative path (no `createPortraitTexture is not defined` style errors).
   If a texture is needed, define a small local canvas/DataTexture helper
   function in the same file.
2. **Exact exported signature, zero required arguments:**
   ```ts
   export function create<PascalCaseName>Model(): THREE.Object3D
   export function create<PascalCaseName>Terrain(): THREE.Object3D
   ```
   Never require `(engine, x, y, z)` or any other parameters — every factory
   must be independently callable and previewable with no arguments.
3. **Must return a real `THREE.Object3D`** (a `THREE.Group`, `THREE.Mesh`, or
   subclass) directly — never a texture, material, plain object, or
   `undefined`. Multiple meshes go into one `THREE.Group` that gets returned.
4. **Models vs. terrain are conceptually distinct** (see
   `docs/architecture/levels.md`):
   - **Model** = a single placeable prop/item a player interacts with
     individually (key, clock, chair, door). Never a whole room or building.
   - **Terrain** = the static environment shell (floor, ceiling, walls,
     ground) a room or area sits inside. Prefer one room/hallway
     segment/ground patch per factory so pieces can be mixed and re-tiled,
     rather than one giant multi-room structure.
5. **No `Math.random()` / `Date.now()` / `performance.now()` /
   `requestAnimationFrame()`.** Use a small deterministic local hash/seed
   function baked in at construction time if pseudo-randomness is needed.
6. Keep model factories under ~120 lines, terrain factories under ~150 lines.
   Respond with exactly one fenced code block, no prose outside the fence.

### Example: correct, fully self-contained model with an inline texture

```ts
import * as THREE from 'three';

function createInlineWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5c3a21';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#3e2612';
  for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 64, 1);
  return new THREE.CanvasTexture(canvas);
}

export function createSimpleCrateModel(): THREE.Object3D {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: createInlineWoodTexture() });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  group.add(box);
  return group;
}
```
