import type { RenderoniEngine } from '../core/engine.js';
import { PersistentStoreImpl, SceneContextImpl } from './context.js';
import type {
  GameDefinition,
  LevelDefinition,
  SceneDefinition,
  SwitchSceneOptions,
} from './types.js';

export type SceneManagerState = 'idle' | 'loading' | 'transitioning';

export class SceneManager {
  readonly engine: RenderoniEngine;
  readonly persistent = new PersistentStoreImpl();

  private gameDef: GameDefinition | null = null;
  private currentLevelDef: LevelDefinition | null = null;
  private currentSceneDef: SceneDefinition | null = null;
  private activeContext: SceneContextImpl | null = null;

  private activeLevelId: string | null = null;
  private activeSceneId: string | null = null;
  private state: SceneManagerState = 'idle';
  private loadCounters = new Map<string, number>();

  constructor(engine: RenderoniEngine) {
    this.engine = engine;
  }

  get currentState(): SceneManagerState {
    return this.state;
  }

  get levelId(): string | null {
    return this.activeLevelId;
  }

  get sceneId(): string | null {
    return this.activeSceneId;
  }

  get context(): SceneContextImpl | null {
    return this.activeContext;
  }

  get game(): GameDefinition | null {
    return this.gameDef;
  }

  get level(): LevelDefinition | null {
    return this.currentLevelDef;
  }

  get scene(): SceneDefinition | null {
    return this.currentSceneDef;
  }

  async loadGame(game: GameDefinition): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot loadGame while in state "${this.state}".`);
    }

    if (!game.id || !game.levels || game.levels.length === 0) {
      throw new Error('Invalid GameDefinition: requires id and at least one level.');
    }

    const startLevel = game.levels.find((l) => l.id === game.startLevel);
    if (!startLevel) {
      throw new Error(
        `GameDefinition startLevel "${game.startLevel}" not found in levels: [${game.levels.map((l) => l.id).join(', ')}].`
      );
    }

    this.gameDef = game;
    await this.loadLevel(game.startLevel);
  }

  async loadLevel(levelId: string, startSceneId?: string): Promise<void> {
    if (!this.gameDef) {
      throw new Error('No GameDefinition loaded. Call loadGame() first.');
    }

    const level = this.gameDef.levels.find((l) => l.id === levelId);
    if (!level) {
      throw new Error(`Level "${levelId}" not found in GameDefinition.`);
    }

    const targetSceneId = startSceneId ?? level.startScene;
    const scene = level.scenes.find((s) => s.id === targetSceneId);
    if (!scene) {
      throw new Error(
        `Scene "${targetSceneId}" not found in Level "${levelId}" scenes: [${level.scenes.map((s) => s.id).join(', ')}].`
      );
    }

    this.currentLevelDef = level;
    this.activeLevelId = levelId;

    await this.switchScene(targetSceneId);
  }

  async switchScene(sceneId: string, options: SwitchSceneOptions = {}): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'loading') {
      throw new Error(`Cannot switchScene while in state "${this.state}".`);
    }

    if (!this.currentLevelDef) {
      throw new Error('No LevelDefinition loaded. Call loadLevel() first.');
    }

    const nextSceneDef = this.currentLevelDef.scenes.find((s) => s.id === sceneId);
    if (!nextSceneDef) {
      throw new Error(
        `Scene "${sceneId}" not found in Level "${this.currentLevelDef.id}". Available: [${this.currentLevelDef.scenes.map((s) => s.id).join(', ')}].`
      );
    }

    this.state = 'transitioning';

    try {
      // 1. Exit current scene if active
      if (this.activeContext && this.currentSceneDef) {
        if (this.currentSceneDef.exit) {
          await this.currentSceneDef.exit(this.activeContext);
        }
        this.engine.events.emit('scene.exit', {
          sceneId: this.activeSceneId,
          levelId: this.activeLevelId,
          nextSceneId: sceneId,
        });
      }

      // 2. Determine persistent entities allowlist
      const persistentIds = new Set<string>([
        ...(this.gameDef?.persistentEntities ?? []),
        ...(options.persist ?? []),
      ]);

      // 3. Unload current scene and clean up scene-local resources
      if (this.activeContext) {
        if (this.currentSceneDef?.teardown) {
          await this.currentSceneDef.teardown(this.activeContext);
        }
        this.activeContext.dispose(persistentIds);
        this.activeContext = null;
      }

      // 4. Drain/clear structural commands from previous scene
      this.engine.commands.clear();

      // 5. Setup next scene context with forked PRNG
      const loadKey = `${this.currentLevelDef.id}:${sceneId}`;
      const count = (this.loadCounters.get(loadKey) ?? 0) + 1;
      this.loadCounters.set(loadKey, count);
      const scenePRNG = this.engine.prng.fork(`scene:${loadKey}:${count}`);

      const nextContext = new SceneContextImpl({
        engine: this.engine,
        sceneId,
        levelId: this.currentLevelDef.id,
        prng: scenePRNG,
        persistent: this.persistent,
      });

      this.activeContext = nextContext;
      this.currentSceneDef = nextSceneDef;
      this.activeSceneId = sceneId;

      // 6. Mount inventory if present
      if (nextSceneDef.inventory) {
        nextContext.mount(nextSceneDef.inventory, nextSceneDef.factories);
      }

      // 7. Run scene setup hook
      if (nextSceneDef.setup) {
        await nextSceneDef.setup(nextContext);
      }

      // 8. Teleport persistent actors to entry point if specified
      if (options.entryPoint && nextSceneDef.entryPoints?.[options.entryPoint]) {
        const ep = nextSceneDef.entryPoints[options.entryPoint];
        for (const actorId of persistentIds) {
          const entity = this.engine.entities.get(actorId);
          if (entity) {
            entity.position = [...ep.position];
            if (ep.rotation) entity.quaternion = [...ep.rotation];
            this.engine.physics.markDirty(actorId);
          }
        }
      }

      // 9. Run scene enter hook and emit scene.enter event
      if (nextSceneDef.enter) {
        await nextSceneDef.enter(nextContext);
      }

      this.engine.events.emit('scene.enter', {
        sceneId,
        levelId: this.currentLevelDef.id,
        entryPoint: options.entryPoint,
        transition: options.transition,
      });
    } finally {
      this.state = 'idle';
    }
  }

  dispose(): void {
    if (this.activeContext) {
      this.activeContext.dispose(new Set());
      this.activeContext = null;
    }
    this.gameDef = null;
    this.currentLevelDef = null;
    this.currentSceneDef = null;
    this.activeLevelId = null;
    this.activeSceneId = null;
    this.persistent.clear();
    this.state = 'idle';
  }
}

/**
 * Adapter helper to create a GameDefinition from a single SceneDefinition or legacy SceneInventory.
 */
export function createGameFromScene(
  sceneOrInventory: SceneDefinition | unknown,
  factories: Record<string, () => any> = {}
): GameDefinition {
  const sceneDef: SceneDefinition =
    typeof sceneOrInventory === 'object' && sceneOrInventory !== null && 'id' in sceneOrInventory
      ? (sceneOrInventory as SceneDefinition)
      : {
          id: 'main',
          inventory: sceneOrInventory,
          factories,
        };

  const levelDef: LevelDefinition = {
    id: 'level-1',
    scenes: [sceneDef],
    startScene: sceneDef.id,
  };

  return {
    id: 'game',
    levels: [levelDef],
    startLevel: levelDef.id,
  };
}
