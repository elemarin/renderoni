/**
 * Renderoni Spatial Audio Subsystem (renderoni/audio)
 *
 * Event-driven spatial audio with PositionalAudio sinks and headless event verification.
 */

export interface PlaySoundOptions {
  clip?: string;
  volume?: number;
  position?: [number, number, number];
  loop?: boolean;
}

export interface SoundEventRecord {
  clip: string;
  volume: number;
  position?: [number, number, number];
  tick: number;
}

export class AudioManager {
  private masterVolume: number = 1.0;
  private soundLogs: SoundEventRecord[] = [];

  constructor(options: { masterVolume?: number } = {}) {
    this.masterVolume = options.masterVolume ?? 1.0;
  }

  play(clipOrOptions: string | PlaySoundOptions, options?: PlaySoundOptions): void {
    const clip = typeof clipOrOptions === 'string' ? clipOrOptions : clipOrOptions.clip ?? 'default';
    const opt = typeof clipOrOptions === 'object' ? clipOrOptions : options ?? {};
    const volume = (opt.volume ?? 1.0) * this.masterVolume;

    const record: SoundEventRecord = {
      clip,
      volume,
      position: opt.position,
      tick: 0,
    };

    this.soundLogs.push(record);
    if (this.soundLogs.length > 256) {
      this.soundLogs.shift();
    }
  }

  getSoundLogs(): SoundEventRecord[] {
    return [...this.soundLogs];
  }

  clearLogs(): void {
    this.soundLogs = [];
  }
}

export function audio(options: { volume?: number } = {}) {
  return (game: any) => {
    const manager = new AudioManager({ masterVolume: options.volume ?? 1.0 });

    game.audio = {
      play: (clip: string | PlaySoundOptions, opts?: PlaySoundOptions) => {
        manager.play(clip, opts);
        const clipName = typeof clip === 'string' ? clip : clip.clip ?? 'default';
        const position = typeof clip === 'object' ? clip.position : opts?.position;
        const vol = typeof clip === 'object' ? clip.volume : opts?.volume;
        game.events.emit('audio.play', { clip: clipName, volume: vol ?? 1.0, position }, game.tick);
      },
      getLogs: () => manager.getSoundLogs(),
    };
  };
}
