import { describe, it, expect } from 'vitest';
import { createDungeonCompositionGame } from '../examples/scene-composition/game.js';

describe('Scene Composition Example Verification', () => {
  it('loads game, mounts first scene, and switches to second scene with persistence', async () => {
    const { engine, manager } = await createDungeonCompositionGame({ mode: 'headless' });

    expect(manager.levelId).toBe('dungeon-depths');
    expect(manager.sceneId).toBe('dungeon_entrance');

    // Verify entities from entrance scene inventory
    expect(engine.entities.has('entrance_floor')).toBe(true);
    expect(engine.entities.has('rusty_key')).toBe(true);
    expect(engine.entities.has('door_to_sanctum')).toBe(true);
    expect(engine.entities.has('hero_player')).toBe(true);

    // Pick up key and record in persistent store
    manager.persistent.set('hasKey', true);

    // Switch to inner sanctum
    await manager.switchScene('inner_sanctum', { entryPoint: 'from_entrance' });

    expect(manager.sceneId).toBe('inner_sanctum');

    // Entrance entities removed, sanctum entities spawned
    expect(engine.entities.has('rusty_key')).toBe(false);
    expect(engine.entities.has('door_to_sanctum')).toBe(false);
    expect(engine.entities.has('sanctum_floor')).toBe(true);
    expect(engine.entities.has('crystal_altar')).toBe(true);

    // Persistent hero preserved and teleported to entry point [0, 1, 5]
    expect(engine.entities.has('hero_player')).toBe(true);
    const hero = engine.entities.get('hero_player')!;
    expect(hero.position[2]).toBeCloseTo(5, 1);

    // Persistent key confirmed
    expect(manager.persistent.get('hasKey')).toBe(true);

    manager.dispose();
    engine.dispose();
  });
});
