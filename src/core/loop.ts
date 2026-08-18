/**
 * Opt-in match loop: ready → playing → won | lost, with restart.
 * Enable from createRenderoni({ loop: true }) or { loop: { title, subtitle } }.
 */

export type LoopPhase = 'ready' | 'playing' | 'won' | 'lost';

export interface GameLoopOptions {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
}

export interface LoopSnapshot {
  enabled: boolean;
  phase: LoopPhase;
  title: string;
  subtitle: string;
  outcome: string | null;
  playing: boolean;
}

export function normalizeLoopOptions(
  input?: boolean | GameLoopOptions
): GameLoopOptions & { enabled: boolean } {
  if (input === true) return { enabled: true };
  if (input === false || input === undefined) return { enabled: false };
  return { enabled: input.enabled !== false, title: input.title, subtitle: input.subtitle };
}

export class GameLoop {
  readonly enabled: boolean;
  readonly title: string;
  readonly subtitle: string;

  private _phase: LoopPhase;
  private _outcome: string | null = null;
  private resetters: Array<() => void> = [];
  private listeners: Array<(snap: LoopSnapshot) => void> = [];

  constructor(input?: boolean | GameLoopOptions) {
    const opts = normalizeLoopOptions(input);
    this.enabled = opts.enabled;
    this.title = opts.title ?? '';
    this.subtitle = opts.subtitle ?? '';
    this._phase = this.enabled ? 'ready' : 'playing';
  }

  get phase(): LoopPhase {
    return this._phase;
  }

  get outcome(): string | null {
    return this._outcome;
  }

  get playing(): boolean {
    return !this.enabled || this._phase === 'playing';
  }

  snapshot(): LoopSnapshot {
    return {
      enabled: this.enabled,
      phase: this._phase,
      title: this.title,
      subtitle: this.subtitle,
      outcome: this._outcome,
      playing: this.playing,
    };
  }

  onReset(handler: () => void): () => void {
    this.resetters.push(handler);
    return () => {
      this.resetters = this.resetters.filter((h) => h !== handler);
    };
  }

  onChange(handler: (snap: LoopSnapshot) => void): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((h) => h !== handler);
    };
  }

  start(): LoopSnapshot {
    if (!this.enabled) return this.snapshot();
    this._phase = 'playing';
    this._outcome = null;
    return this.emit();
  }

  win(reason = 'You win'): LoopSnapshot {
    if (!this.enabled || this._phase !== 'playing') return this.snapshot();
    this._phase = 'won';
    this._outcome = reason;
    return this.emit();
  }

  lose(reason = 'You lose'): LoopSnapshot {
    if (!this.enabled || this._phase !== 'playing') return this.snapshot();
    this._phase = 'lost';
    this._outcome = reason;
    return this.emit();
  }

  restart(): LoopSnapshot {
    if (!this.enabled) return this.snapshot();
    for (const reset of this.resetters) reset();
    this._phase = 'playing';
    this._outcome = null;
    return this.emit();
  }

  private emit(): LoopSnapshot {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
    return snap;
  }
}
