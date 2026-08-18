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
   * Continuous aircraft flight engine sound (propeller / jet turbine).
   */
  createFlightEngine(): { start: () => void; setThrottle: (val: number) => void; stop: () => void } {
    let osc1: OscillatorNode | null = null;
    let osc2: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;
    let filterNode: BiquadFilterNode | null = null;

    return {
      start: () => {
        try {
          const ctx = this.getContext();
          osc1 = ctx.createOscillator();
          osc2 = ctx.createOscillator();
          gainNode = ctx.createGain();
          filterNode = ctx.createBiquadFilter();

          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(60, ctx.currentTime);

          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(120, ctx.currentTime);

          filterNode.type = 'lowpass';
          filterNode.frequency.setValueAtTime(300, ctx.currentTime);

          gainNode.gain.setValueAtTime(0.08, ctx.currentTime);

          osc1.connect(filterNode);
          osc2.connect(filterNode);
          filterNode.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc1.start();
          osc2.start();
        } catch (_) {}
      },
      setThrottle: (val: number) => {
        if (!gainNode || !filterNode || !osc1 || !osc2 || !this.ctx) return;
        const targetGain = Math.min(0.2, Math.max(0.02, val * 0.18));
        gainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
        osc1.frequency.setTargetAtTime(50 + val * 160, this.ctx.currentTime, 0.1);
        osc2.frequency.setTargetAtTime(100 + val * 320, this.ctx.currentTime, 0.1);
        filterNode.frequency.setTargetAtTime(200 + val * 800, this.ctx.currentTime, 0.1);
      },
      stop: () => {
        try {
          if (gainNode && this.ctx) {
            gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
            setTimeout(() => {
              osc1?.stop();
              osc2?.stop();
              osc1?.disconnect();
              osc2?.disconnect();
              gainNode?.disconnect();
              filterNode?.disconnect();
            }, 150);
          }
        } catch (_) {}
      },
    };
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
   * Flight Ring Checkpoint Collection chime.
   */
  playRingCollect(): void {
    try {
      const ctx = this.getContext();
      const notes = [587.33, 880.0, 1174.66];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.05 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.05);
        osc.stop(ctx.currentTime + idx * 0.05 + 0.35);
      });
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
      osc.frequency.setValueAtTime(340, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.1);
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

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.07);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch (_) {}
  }

  /**
   * Key pickup chime.
   */
  playKeyPickup(): void {
    try {
      const ctx = this.getContext();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.3);
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
      osc.frequency.setValueAtTime(95, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(65, ctx.currentTime + 0.4);
      osc.frequency.linearRampToValueAtTime(115, ctx.currentTime + 0.9);
      osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 1.4);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1.4);
    } catch (_) {}
  }
}

export const sfx = new SoundSynthesizer();
