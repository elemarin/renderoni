# 🏰 Multi-Scene Composition Example

Demonstrates Renderoni 1.0's deterministic `Game -> Level -> Scene` hierarchy, persistent player state, entry point teleportation, and procedural Three.js factories with audio & VFX integration.

## Structure
- `scenes/`: Declarative `SceneInventory` JSON definitions (`dungeon-entrance.json`, `inner-sanctum.json`).
- `models/`: Procedural Three.js model factories (`EntranceTorch.ts`, `SanctumAltar.ts`).
- `game.ts`: `GameDefinition` orchestration and `SceneManager` lifecycle setup.

## Usage
```ts
import { createDungeonCompositionGame } from './game.js';

const { engine, manager } = await createDungeonCompositionGame();

// Switch to Inner Sanctum with hero teleported to entry point
await manager.switchScene('inner_sanctum', { entryPoint: 'from_entrance' });

// Verify persistent state
manager.persistent.set('hasDungeonKey', true);
```
