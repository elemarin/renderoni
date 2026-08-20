/**
 * Renderoni Action Registry & Stream
 *
 * Implements JIT action registration and deterministic action execution.
 */

export interface ActionDefinition<TPayload = any> {
  name: string;
  handle: (payload: TPayload, ctx: any) => void;
  schema?: unknown;
}

export interface ActionRecord {
  name: string;
  payload?: unknown;
  tick?: number;
}

export interface ActionDescriptor {
  name: string;
  schema?: unknown;
}

export class ActionRegistry {
  private actions: Map<string, ActionDefinition> = new Map();
  private pendingActions: ActionRecord[] = [];

  register<TPayload = any>(action: ActionDefinition<TPayload>): void {
    this.actions.set(action.name, action);
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  /**
   * Lists registered actions for inspection by tools and agent clients.
   */
  list(): ActionDescriptor[] {
    return Array.from(this.actions.values(), ({ name, schema }) => ({ name, schema })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    );
  }

  /**
   * Enqueues an action to be executed in the current or next simulation tick.
   */
  dispatch(name: string, payload?: unknown): void {
    if (!this.actions.has(name)) {
      throw new Error(`Unknown action: ${name}`);
    }
    this.pendingActions.push({ name, payload });
  }

  /**
   * Executes and drains all pending actions in deterministic order.
   */
  drain(ctx: any): number {
    if (this.pendingActions.length === 0) return 0;

    const list = this.pendingActions;
    this.pendingActions = [];

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const def = this.actions.get(item.name);
      if (def) {
        def.handle(item.payload, ctx);
      }
    }

    return list.length;
  }

  clear(): void {
    this.pendingActions = [];
  }
}
