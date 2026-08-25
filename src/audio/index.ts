import type { RenderoniEngine } from '../core/engine.js';

export type ProceduralSynth = (
  ctx: AudioContext,
  dest: AudioNode,
  options: PlaySoundOptions
) => { stop: () => void; setVolume: (v: number) => void };

export type SoundSource = AudioBuffer | ProceduralSynth;

export interface PlaySoundOptions {
  clip?: string;
  volume?: number;
  pitch?: number;
  position?: [number, number, number];
  loop?: boolean;
}

export interface SoundHandle {
  id: number;
  clip: string;
  stop: () => void;
  setVolume: (v: number) => void;
  isPlaying: boolean;
}

export interface SoundEventRecord {
  clip: string;
  volume: number;
  position?: [number, number, number];
  loop?: boolean;
  tick: number;
}

export class AudioManager {
  private engine: RenderoniEngine | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume: number = 1.0;
  private soundLogs: SoundEventRecord[] = [];
  private registry: Map<string, SoundSource> = new Map();
  private activeHandles: Map<number, SoundHandle> = new Map();
  private nextHandleId = 1;
  private unbindGesture: Array<() => void> = [];

  constructor(options: { masterVolume?: number } = {}) {
    this.masterVolume = options.masterVolume ?? 1.0;
  }

  attachEngine(engine: RenderoniEngine): void {
    this.engine = engine;
    if (this.engine.mode === 'interactive') {
      this.bindAutoplayResume();
    }
  }

  registerClip(name: string, source: SoundSource): void {
    this.registry.set(name, source);
  }

  hasClip(name: string): boolean {
    return this.registry.has(name);
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      } catch {
        // ignore
      }
    }
  }

  play(clipOrOptions: string | PlaySoundOptions, options?: PlaySoundOptions): SoundHandle {
    const opt: PlaySoundOptions =
      typeof clipOrOptions === 'string'
        ? { ...(options ?? {}), clip: clipOrOptions }
        : clipOrOptions;

    const clipName = opt.clip ?? 'default';
    const volume = (opt.volume ?? 1.0) * this.masterVolume;
    const tick = this.engine?.clock.tick ?? 0;

    const record: SoundEventRecord = {
      clip: clipName,
      volume,
      position: opt.position,
      loop: opt.loop,
      tick,
    };
    this.soundLogs.push(record);
    if (this.soundLogs.length > 256) this.soundLogs.shift();

    const handleId = this.nextHandleId++;
    let handle: SoundHandle = {
      id: handleId,
      clip: clipName,
      stop: () => {},
      setVolume: () => {},
      isPlaying: false,
    };

    if (this.registry.size > 0 && !this.registry.has(clipName)) {
      const err = `RND_0301: Audio clip "${clipName}" is not registered in AudioManager.`;
      this.engine?.diagnostics.emit('RND_0301', err, {
        severity: 'error',
        tick,
        remediation: 'Register the clip using engine.audio.registerClip(name, source) before playing.',
      });
      if (this.engine?.mode === 'interactive') {
        console.warn(err);
      }
    }

    if (this.engine?.mode === 'interactive' && typeof window !== 'undefined') {
      handle = this.playBrowserSound(handleId, clipName, opt, volume);
    } else {
      handle.isPlaying = true;
      handle.stop = () => {
        handle.isPlaying = false;
      };
    }

    this.activeHandles.set(handleId, handle);
    return handle;
  }

  private playBrowserSound(
    handleId: number,
    clipName: string,
    opt: PlaySoundOptions,
    volume: number
  ): SoundHandle {
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) {
      return { id: handleId, clip: clipName, stop: () => {}, setVolume: () => {}, isPlaying: false };
    }

    const source = this.registry.get(clipName);
    const sourceGain = ctx.createGain();
    sourceGain.gain.setValueAtTime(volume, ctx.currentTime);

    let destinationNode: AudioNode = sourceGain;
    let panner: PannerNode | null = null;

    if (opt.position) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1.0;
      panner.maxDistance = 60.0;
      panner.rolloffFactor = 1.2;
      panner.positionX.setValueAtTime(opt.position[0], ctx.currentTime);
      panner.positionY.setValueAtTime(opt.position[1], ctx.currentTime);
      panner.positionZ.setValueAtTime(opt.position[2], ctx.currentTime);
      sourceGain.connect(panner);
      destinationNode = panner;
    }

    destinationNode.connect(this.masterGain);

    let stopInternal = () => {};
    let setVolInternal = (v: number) => {
      try {
        sourceGain.gain.setValueAtTime(v * this.masterVolume, ctx.currentTime);
      } catch {
        // ignore
      }
    };

    if (typeof source === 'function') {
      const synthControls = source(ctx, sourceGain, opt);
      stopInternal = () => {
        try {
          synthControls.stop();
          destinationNode.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (source instanceof AudioBuffer) {
      const bufferSource = ctx.createBufferSource();
      bufferSource.buffer = source;
      bufferSource.loop = opt.loop ?? false;
      if (opt.pitch) bufferSource.playbackRate.setValueAtTime(opt.pitch, ctx.currentTime);
      bufferSource.connect(sourceGain);
      try {
        bufferSource.start();
      } catch {
        // ignore
      }

      bufferSource.onended = () => {
        this.activeHandles.delete(handleId);
        try {
          destinationNode.disconnect();
        } catch {
          // ignore
        }
      };
      stopInternal = () => {
        try {
          bufferSource.stop();
          destinationNode.disconnect();
        } catch {
          // ignore
        }
      };
    }

    return {
      id: handleId,
      clip: clipName,
      isPlaying: true,
      stop: () => {
        stopInternal();
        this.activeHandles.delete(handleId);
      },
      setVolume: setVolInternal,
    };
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.setupMasterNodes();
      }
    }
    return this.ctx;
  }

  private setupMasterNodes(): void {
    if (!this.ctx) return;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  private bindAutoplayResume(): void {
    if (typeof window === 'undefined') return;
    const resume = () => {
      const ctx = this.getContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
    this.unbindGesture.push(() => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('touchstart', resume);
    });
  }

  getSoundLogs(): SoundEventRecord[] {
    return [...this.soundLogs];
  }

  clearLogs(): void {
    this.soundLogs = [];
  }

  dispose(): void {
    for (const unbind of this.unbindGesture) unbind();
    this.unbindGesture = [];
    for (const handle of this.activeHandles.values()) {
      handle.stop();
    }
    this.activeHandles.clear();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.soundLogs = [];
  }
}

export function audio(options: { volume?: number } = {}) {
  return (engine: RenderoniEngine) => {
    const manager = new AudioManager({ masterVolume: options.volume ?? 1.0 });
    manager.attachEngine(engine);

    (engine as any).audio = {
      registerClip: (name: string, source: SoundSource) => manager.registerClip(name, source),
      hasClip: (name: string) => manager.hasClip(name),
      play: (clip: string | PlaySoundOptions, opts?: PlaySoundOptions) => {
        const handle = manager.play(clip, opts);
        const clipName = typeof clip === 'string' ? clip : clip.clip ?? 'default';
        const position = typeof clip === 'object' ? clip.position : opts?.position;
        const vol = typeof clip === 'object' ? clip.volume : opts?.volume;
        engine.events.emit('audio.play', { clip: clipName, volume: vol ?? 1.0, position }, engine.clock.tick);
        return handle;
      },
      setMasterVolume: (v: number) => manager.setMasterVolume(v),
      getLogs: () => manager.getSoundLogs(),
      clearLogs: () => manager.clearLogs(),
      dispose: () => manager.dispose(),
    };
  };
}
