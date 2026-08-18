/**
 * Renderoni Web Audio Procedural Sound Synthesizer
 *
 * Generates zero-dependency real-time audio effects for the interactive web playground.
 */

class SoundSynthesizer {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Continuous rocket engine rumble sound.
   */
  createRocketRumble(): { start: () => void; setIntensity: (val: number) => void; stop: () => void } {
    let oscNode: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;
    let filterNode: BiquadFilterNode | null = null;

    return {
      start: () => {
        try {
          const ctx = this.getContext();
          oscNode = ctx.createOscillator();
          gainNode = ctx.createGain();
          filterNode = ctx.createBiquadFilter();

          oscNode.type = 'sawtooth';
          oscNode.frequency.setValueAtTime(45, ctx.currentTime);

          filterNode.type = 'lowpass';
          filterNode.frequency.setValueAtTime(120, ctx.currentTime);

          gainNode.gain.setValueAtTime(0.05, ctx.currentTime);

          oscNode.connect(filterNode);
          filterNode.connect(gainNode);
          gainNode.connect(ctx.destination);

          oscNode.start();
        } catch (_) {}
      },
      setIntensity: (val: number) => {
        if (!gainNode || !filterNode || !this.ctx) return;
        const targetGain = Math.min(0.25, Math.max(0, val * 0.2));
        gainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
        filterNode.frequency.setTargetAtTime(80 + val * 180, this.ctx.currentTime, 0.1);
      },
      stop: () => {
        try {
          if (gainNode && this.ctx) {
            gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
            setTimeout(() => {
              oscNode?.stop();
              oscNode?.disconnect();
              gainNode?.disconnect();
              filterNode?.disconnect();
            }, 150);
          }
        } catch (_) {}
      },
    };
  }

  /**
   * Stage decoupling burst sound.
   */
  playDecouple(): void {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (_) {}
  }

  /**
   * Voxel block break pop.
   */
  playBlockBreak(): void {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (_) {}
  }

  /**
   * Voxel block place click.
   */
  playBlockPlace(): void {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (_) {}
  }

  /**
   * Key pickup chime.
   */
  playKeyPickup(): void {
    try {
      const ctx = this.getContext();
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.25);
      });
    } catch (_) {}
  }

  /**
   * Spooky iron gate creak sound.
   */
  playDoorUnlock(): void {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(60, ctx.currentTime + 0.4);
      osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.9);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 1.4);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1.4);
    } catch (_) {}
  }
}

export const sfx = new SoundSynthesizer();
