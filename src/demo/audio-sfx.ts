/**
 * Procedural Web Audio Sound Synthesizer
 *
 * Generates zero-latency procedural sound effects:
 * - Dynamic surface footsteps (wood, stone, carpet, grass)
 * - Atmospheric rain & thunder rumbles
 * - Grandfather clock pendulum tick-tocks
 * - Flashlight switch clicks & journal paper rustling
 * - Stone sliding & bookcase door grinding
 * - Airplane radial engine drone & wind whistle
 * - Musical chimes & discovery jingles
 */

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted = false;

  // Continuous sound nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  private initCtx(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // --- Footsteps ---
  playFootstep(surface: 'wood' | 'stone' | 'carpet' | 'grass' = 'wood'): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    if (surface === 'wood') {
      // Deep hollow wood knock
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140 + Math.random() * 20, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    } else if (surface === 'stone') {
      // Crisp stone click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280 + Math.random() * 40, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.05);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    } else if (surface === 'carpet') {
      // Soft muffled thump
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90 + Math.random() * 10, t);
      osc.frequency.exponentialRampToValueAtTime(20, t + 0.06);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, t);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    } else {
      // Grass rustle
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180 + Math.random() * 30, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.07);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    }

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  // --- Flashlight Switch ---
  playFlashlightClick(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.setValueAtTime(900, t + 0.015);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.035);
  }

  // --- Grandfather Clock Pendulum Tick ---
  playClockTick(isTock = false): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    const baseFreq = isTock ? 320 : 380;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.06);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isTock ? 600 : 800, t);
    filter.Q.setValueAtTime(3.0, t);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.07);
  }

  // --- Paper / Journal Rustle ---
  playPaperRustle(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2500, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  // --- Distant Thunder ---
  playThunder(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const duration = 2.5;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  // --- Heavy Stone / Secret Door Slide ---
  playStoneDoorSlide(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const duration = 1.2;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  // --- Discovery Jingle / Chime ---
  playSecretJingle(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const master = this.masterGain;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const t = ctx.currentTime + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.48);
    });
  }

  // --- Flight Engine Drone ---
  startEngineDrone(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.engineOsc1) return;

    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc2 = ctx.createOscillator();
    this.engineGain = ctx.createGain();

    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2.type = 'triangle';

    this.engineOsc1.frequency.setValueAtTime(55, ctx.currentTime);
    this.engineOsc2.frequency.setValueAtTime(110, ctx.currentTime);

    this.engineGain.gain.setValueAtTime(0.05, ctx.currentTime);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, ctx.currentTime);

    this.engineOsc1.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  updateEngineDrone(throttle: number, speedKmh: number): void {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineGain) return;

    const baseFreq = 45 + throttle * 75 + Math.min(speedKmh * 0.25, 40);
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 2, this.ctx.currentTime, 0.1);

    const vol = 0.04 + throttle * 0.18;
    this.engineGain.gain.setTargetAtTime(this.isMuted ? 0 : vol, this.ctx.currentTime, 0.1);
  }

  stopEngineDrone(): void {
    if (this.engineOsc1) {
      try { this.engineOsc1.stop(); this.engineOsc1.disconnect(); } catch (_) {}
      this.engineOsc1 = null;
    }
    if (this.engineOsc2) {
      try { this.engineOsc2.stop(); this.engineOsc2.disconnect(); } catch (_) {}
      this.engineOsc2 = null;
    }
  }

  // --- Ring & Item Chimes ---
  playKeyPickup(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1760, t + 0.15);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  playRingChime(): void {
    this.playKeyPickup();
  }

  playBlockBreak(): void {
    this.playFootstep('stone');
  }

  playBlockPlace(): void {
    this.playFootstep('wood');
  }

  playGateOpen(): void {
    this.playStoneDoorSlide();
  }

  // Compatibility helpers
  createRocketRumble(): { start: () => void; setIntensity: (v: number) => void; update: (t: number) => void; stop: () => void } {
    return {
      start: () => {},
      setIntensity: () => {},
      update: () => {},
      stop: () => {},
    };
  }

  playDecouple(): void {
    this.playFootstep('wood');
  }
}

export const sfx = new SoundSynthesizer();
