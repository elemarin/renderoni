/**
 * Renderoni Structural Command Queue
 *
 * Defers structural mutations (spawns, despawns, tag changes) to prevent
 * mid-tick iterator invalidation and race conditions. Drained at Step 2 of simulation tick.
 */

export type StructuralCommandType =
  | 'spawn_entity'
  | 'destroy_entity'
  | 'add_tag'
  | 'remove_tag'
  | 'set_state'
  | 'custom';

export interface BaseStructuralCommand {
  type: StructuralCommandType;
  entityId: string;
}

export interface SpawnEntityCommand extends BaseStructuralCommand {
  type: 'spawn_entity';
  tags?: string[];
  initialState?: Record<string, unknown>;
  onExecuted?: (entityId: string) => void;
}

export interface DestroyEntityCommand extends BaseStructuralCommand {
  type: 'destroy_entity';
  onExecuted?: (entityId: string) => void;
}

export interface AddTagCommand extends BaseStructuralCommand {
  type: 'add_tag';
  tag: string;
}

export interface RemoveTagCommand extends BaseStructuralCommand {
  type: 'remove_tag';
  tag: string;
}

export interface SetStateCommand extends BaseStructuralCommand {
  type: 'set_state';
  path: string;
  value: unknown;
}

export interface CustomCommand extends BaseStructuralCommand {
  type: 'custom';
  execute: () => void;
}

export type StructuralCommand =
  | SpawnEntityCommand
  | DestroyEntityCommand
  | AddTagCommand
  | RemoveTagCommand
  | SetStateCommand
  | CustomCommand;

export interface CommandQueueHandler {
  onSpawnEntity(cmd: SpawnEntityCommand): void;
  onDestroyEntity(cmd: DestroyEntityCommand): void;
  onAddTag(cmd: AddTagCommand): void;
  onRemoveTag(cmd: RemoveTagCommand): void;
  onSetState(cmd: SetStateCommand): void;
}

export class StructuralCommandQueue {
  private queue: StructuralCommand[] = [];

  /**
   * Number of pending commands in queue.
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Enqueues a structural command to be executed during the next tick drain phase.
   */
  enqueue(command: StructuralCommand): void {
    this.queue.push(command);
  }

  /**
   * Enqueues an entity spawn.
   */
  spawn(entityId: string, tags?: string[], initialState?: Record<string, unknown>): void {
    this.enqueue({
      type: 'spawn_entity',
      entityId,
      tags,
      initialState,
    });
  }

  /**
   * Enqueues an entity destruction.
   */
  destroy(entityId: string): void {
    this.enqueue({
      type: 'destroy_entity',
      entityId,
    });
  }

  /**
   * Enqueues a tag addition.
   */
  addTag(entityId: string, tag: string): void {
    this.enqueue({
      type: 'add_tag',
      entityId,
      tag,
    });
  }

  /**
   * Enqueues a tag removal.
   */
  removeTag(entityId: string, tag: string): void {
    this.enqueue({
      type: 'remove_tag',
      entityId,
      tag,
    });
  }

  /**
   * Enqueues a custom command callback.
   */
  custom(entityId: string, execute: () => void): void {
    this.enqueue({
      type: 'custom',
      entityId,
      execute,
    });
  }

  /**
   * Drains and executes all pending commands in the queue deterministically.
   */
  drain(handler: CommandQueueHandler): number {
    if (this.queue.length === 0) {
      return 0;
    }

    const commandsToProcess = this.queue;
    this.queue = [];

    for (let i = 0; i < commandsToProcess.length; i++) {
      const cmd = commandsToProcess[i];
      switch (cmd.type) {
        case 'spawn_entity':
          handler.onSpawnEntity(cmd);
          cmd.onExecuted?.(cmd.entityId);
          break;
        case 'destroy_entity':
          handler.onDestroyEntity(cmd);
          cmd.onExecuted?.(cmd.entityId);
          break;
        case 'add_tag':
          handler.onAddTag(cmd);
          break;
        case 'remove_tag':
          handler.onRemoveTag(cmd);
          break;
        case 'set_state':
          handler.onSetState(cmd);
          break;
        case 'custom':
          cmd.execute();
          break;
      }
    }

    return commandsToProcess.length;
  }

  /**
   * Clears all pending commands without executing them.
   */
  clear(): void {
    this.queue = [];
  }
}
