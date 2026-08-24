# Level Architecture: Terrain, Structure, Decor & Items

This document explains how a Renderoni game's playable space is organized on
disk and why, using `src/demo/games/echoes-of-blackwood` as the reference
example. It's the convention the Renderoni Editor (see
[`docs/editor/overview.md`](../editor/overview.md)) relies on to classify and
browse a project's assets.

## Why this convention exists

Renderoni does not (yet) have a visual scene editor that serializes level
layout as data the way Unity/Unreal/Godot scenes do. Levels here are
authored as TypeScript factory functions that call `engine.add(...)`
directly. Without a convention, it's tempting to write one giant function
that builds an entire building — walls, floors, doors, and set-dressing all
at once. That's hard to preview, hard to iterate on piece-by-piece, and
conflates several genuinely different concerns. This convention splits those
concerns into small, independently-testable/-previewable factories.

## The four kinds

| Kind | Folder | What it means | Example |
|---|---|---|---|
| **terrain** | `models/terrain/` | The ground/ceiling shape a level sits inside — floors, ceilings, heightmap-like volumes. | `ManorFloor.ts` → `buildManorFloor(engine)` |
| **structure** | `models/structure/` | Architectural framing — walls, doorframes, room shells, hinged doors. | `ManorWalls.ts` → `buildHallwayWalls`, `buildManorRoom`; `ManorDoor.ts` → `buildInteractiveManorDoor` |
| **decor** | `models/decor/` | Non-interactive set dressing — portraits, cobwebs, wall sconces. | `AncestorPortrait.ts`, `Cobweb.ts`, `WallSconce.ts` |
| **items** (model, gameplay) | `models/items/` | Interactive/quest props — pickups, pedestals, puzzle objects, exits. | `Journal.ts`, `WindingKeyPickup.ts`, `BlackwoodCrest.ts`, `EscapeGate.ts` |

This maps onto (and is a superset of) the `SceneInventory` `kind` enum used
by the prompt-to-scene JSON pipeline (`terrain | prop | actor | pickup |
decor`, see `renderoni/scene`). The folder convention above is specifically
for **hand-authored/generated TypeScript factories** browsed by the editor;
`SceneInventory` JSON files remain a separate, optional data-driven path
(see "Two paths to build a level" below).

## One factory per concern, not one factory per building

Rule of thumb: **a factory function should build one identifiable thing**,
not "the whole level." Concretely:

- ✅ `buildManorFloor(engine)` — floor + ceiling + carpet, nothing else.
- ✅ `buildManorRoom(engine, id, cx, cz, w, d, floorMat, ceilingMat, wallMat)` —
  one room shell, parameterized, called once per room.
- ✅ `buildJournal(engine)`, `buildBlackwoodCrest(engine)`,
  `buildEscapeGate(engine)` — one quest item each, each returning its own
  `EntityInstance` handle.
- ❌ `buildManorArchitecture(engine)` containing 200+ lines of inline
  `BoxGeometry` calls for every wall, room, door, portrait, cobweb, and
  sconce in the entire building.
- ❌ `buildQuestItems(engine)` building the desk, journal, key, pedestal,
  crest, altar, *and* gate all in one function, returning one flat object.

## The level assembler pattern

Even with small factories, `game.ts` needs *something* to call at startup.
That's the **assembler**: a thin, deliberately boring function that composes
the small factories in the right order and positions, and returns whatever
handles the game's action-wiring code needs. It contains no geometry of its
own.

```ts
// models/ManorHallway.ts — the assembler, not "the model"
export function buildManorArchitecture(engine: RenderoniEngine): ManorArchitectureResult {
  const { floorMat, ceilingMat } = buildManorFloor(engine);      // terrain
  const { wallMat } = buildHallwayWalls(engine);                  // structure
  buildManorRoom(engine, 'room_study', -8, 2, 8, 8, floorMat, ceilingMat, wallMat);
  // ...
  const doorStudy = buildInteractiveManorDoor(engine, { id: 'door_study', /* ... */ }); // structure
  portraitConfigs.forEach((p) => buildAncestorPortrait(engine, p.id, p.pos, p.rotY, p.variant)); // decor
  sconcePositions.forEach((pos, idx) => buildWallSconce(engine, `sconce_${idx}`, pos)); // decor
  return { doorStudy, doorKey, doorClock, doorCrest };
}
```

```ts
// models/items/QuestItems.ts — same pattern for interactive props
export function buildQuestItems(engine: RenderoniEngine): QuestItemsResult {
  buildStudyDesk(engine);
  const journalEntity = buildJournal(engine);
  buildKeyPedestal(engine);
  const keyEntity = buildWindingKeyPickup(engine);
  buildCrestAltar(engine);
  const crestEntity = buildBlackwoodCrest(engine);
  const gateEntity = buildEscapeGate(engine);
  return { journalEntity, keyEntity, crestEntity, gateEntity };
}
```

`game.ts` itself barely changes — it still just calls
`buildManorArchitecture(engine)` and `buildQuestItems(engine)` once each at
`init()` time and wires the returned handles into gameplay actions.

## Two paths to build a level

1. **Hand-authored/generated TypeScript factories** (this document's focus).
   `game.ts` calls factory functions directly; placement is hardcoded in the
   TS source; the editor browses/classifies these files by folder location.
   This is what `echoes-of-blackwood` actually uses.
2. **Data-driven `SceneInventory` JSON + `mountSceneInventory`** (see the
   `prompt-to-scene` skill and `renderoni/scene`). A `scene-inventory.json`
   lists `{ id, factory, kind, position, collider }` elements; a registry
   maps `factory` names to factory functions; `mountSceneInventory(engine,
   inventory, factories)` does the placement at runtime.

**These two paths are not automatically connected.** A project can have a
`scene-inventory.json` sitting in its folder without `game.ts` ever calling
`mountSceneInventory` on it — in which case the JSON is inert data, not part
of the running game, and the editor's Levels tab will show stale/misleading
information (this happened in `echoes-of-blackwood`: a leftover
`scene-inventory.json` referenced `manorFloor`/`hall_floor` from an earlier
prompt-to-scene pass, while the shipped game actually builds the hallway via
hand-written `buildManorArchitecture`/`buildManorFloor` calls in `game.ts`).
When working on a project, always check whether `mountSceneInventory` is
actually called before treating `scene-inventory.json` as ground truth.

## How the editor classifies files

See [`docs/editor/overview.md`](../editor/overview.md) for the full editor
design. In short: `src/editor/project-assets.ts`'s `classifyModelKind()`
looks at which subfolder under `models/` a file lives in
(`terrain/` → terrain tab, `structure/` → structure tab, anything else →
models tab) — a deterministic, author-controlled signal, not a regex guess
over filenames or function names.
