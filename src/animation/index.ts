/**
 * Renderoni Animation Subsystem (renderoni/animation)
 *
 * Hybrid animation architecture combining a deterministic gameplay state machine
 * with presentation bone skinning and root motion extraction.
 */

export interface AnimationClipState {
  name: string;
  duration: number;
  loop?: boolean;
  speed?: number;
}

export interface AnimationStateMachineOptions {
  clips?: Record<string, AnimationClipState>;
  defaultState?: string;
}

export interface ActiveAnimationState {
  clipName: string;
  normalizedTime: number; // 0.0 -> 1.0
  elapsedSeconds: number;
  weight: number;
}

export class AnimationStateMachine {
  private clips: Map<string, AnimationClipState> = new Map();
  private currentState: ActiveAnimationState | null = null;
  private previousState: ActiveAnimationState | null = null;
  private crossFadeDuration: number = 0;
  private crossFadeElapsed: number = 0;

  constructor(options: AnimationStateMachineOptions = {}) {
    if (options.clips) {
      for (const [name, clip] of Object.entries(options.clips)) {
        this.clips.set(name, clip);
      }
    }
    if (options.defaultState) {
      this.play(options.defaultState);
    }
  }

  registerClip(name: string, clip: AnimationClipState): void {
    this.clips.set(name, clip);
  }

  get activeStateName(): string | undefined {
    return this.currentState?.clipName;
  }

  get normalizedTime(): number {
    return this.currentState?.normalizedTime ?? 0;
  }

  play(name: string, options: { crossFadeDuration?: number; speed?: number } = {}): void {
    if (this.currentState?.clipName === name) return;

    if (this.currentState && options.crossFadeDuration && options.crossFadeDuration > 0) {
      this.previousState = { ...this.currentState };
      this.crossFadeDuration = options.crossFadeDuration;
      this.crossFadeElapsed = 0;
    } else {
      this.previousState = null;
      this.crossFadeDuration = 0;
      this.crossFadeElapsed = 0;
    }

    this.currentState = {
      clipName: name,
      normalizedTime: 0,
      elapsedSeconds: 0,
      weight: 1.0,
    };
  }

  /**
   * Advances state machine deterministically by simulation dt.
   */
  update(dt: number): { rootMotionDelta: [number, number, number] } {
    if (!this.currentState) {
      return { rootMotionDelta: [0, 0, 0] };
    }

    const clip = this.clips.get(this.currentState.clipName) ?? { duration: 1.0, speed: 1.0, loop: true, name: '' };
    const speed = clip.speed ?? 1.0;
    const duration = Math.max(0.001, clip.duration);

    this.currentState.elapsedSeconds += dt * speed;
    if (clip.loop !== false) {
      this.currentState.normalizedTime = (this.currentState.elapsedSeconds % duration) / duration;
    } else {
      this.currentState.normalizedTime = Math.min(1.0, this.currentState.elapsedSeconds / duration);
    }

    // Handle cross-fade blend weights
    if (this.previousState && this.crossFadeDuration > 0) {
      this.crossFadeElapsed += dt;
      const t = Math.min(1.0, this.crossFadeElapsed / this.crossFadeDuration);
      this.currentState.weight = t;
      this.previousState.weight = 1.0 - t;

      if (t >= 1.0) {
        this.previousState = null;
        this.crossFadeDuration = 0;
      }
    }

    return { rootMotionDelta: [0, 0, 0] };
  }
}

export function animation(options: AnimationStateMachineOptions = {}) {
  return (game: any) => {
    game.animation = {
      createStateMachine: (opts?: AnimationStateMachineOptions) => new AnimationStateMachine(opts ?? options),
    };
  };
}
