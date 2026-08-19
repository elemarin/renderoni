/**
 * Skyward Courier — Modular Flight Audio Synthesizer
 */

export class FlightSoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted && this.engineGain) {
      this.engineGain.gain.value = 0;
    }
  }

  updateEngineAudio(running: boolean, throttle: number, speedKmh: number): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    if (!running) {
      if (this.engineGain) this.engineGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      return;
    }

    if (!this.engineOsc || !this.engineGain) {
      this.engineOsc = ctx.createOscillator();
      this.engineGain = ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(ctx.destination);
      this.engineGain.gain.value = 0;
      this.engineOsc.start();
    }

    const freq = 45 + throttle * 120 + (speedKmh / 200) * 40;
    const vol = Math.min(0.18, 0.04 + throttle * 0.12);

    this.engineOsc.frequency.linearRampToValueAtTime(freq, ctx.currentTime + 0.05);
    this.engineGain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.05);
  }

  stop(): void {
    try {
      this.engineOsc?.stop();
    } catch {
      /* already stopped */
    }
    this.engineOsc = null;
    this.engineGain = null;
  }

  playRingChime(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [1046.5, 1318.51, 1567.98].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.15, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.45);
    });
  }

  playTireScreech(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1400, now);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.35);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }
}

export const flightSfx = new FlightSoundSynthesizer();
