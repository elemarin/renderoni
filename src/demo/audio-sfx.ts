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
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  private initCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
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

      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
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

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

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

  playEngineStartup(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    // Cranking starter coughs
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(45 + i * 15, t + i * 0.14);
      osc.frequency.exponentialRampToValueAtTime(20, t + i * 0.14 + 0.08);

      gain.gain.setValueAtTime(0.12, t + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.14 + 0.09);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.14);
      osc.stop(t + i * 0.14 + 0.1);
    }
  }

  playTireScreech(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400 + Math.random() * 200, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.22);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.Q.setValueAtTime(4.0, t);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.28);
  }

  playLandingThump(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.18);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  playRocketIgnition(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.linearRampToValueAtTime(140, t + 0.5);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, t);
    filter.frequency.exponentialRampToValueAtTime(1200, t + 0.6);

    gain.gain.setValueAtTime(0.02, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.75);
  }

  playSonicBoom(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.45);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.52);
  }

  playChuteDeploy(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.12);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  playDecouple(): void {
    this.playFootstep('wood');
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
  }

  playMenuMove(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.035);

    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.045);
  }

  playMenuSelect(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(523.25, t); // C5
    osc1.frequency.setValueAtTime(783.99, t + 0.05); // G5

    osc2.frequency.setValueAtTime(659.25, t); // E5
    osc2.frequency.setValueAtTime(1046.50, t + 0.05); // C6

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.22);
    osc2.stop(t + 0.22);
  }

  playGameLaunch(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, t);
    filter.frequency.exponentialRampToValueAtTime(3500, t + 0.3);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.48);
  }

  startManorAmbience(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.rainSource) return;

    const rainBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const rainData = rainBuf.getChannelData(0);
    for (let i = 0; i < rainData.length; i++) rainData[i] = Math.random() * 2 - 1;
    this.rainSource = ctx.createBufferSource();
    this.rainSource.buffer = rainBuf;
    this.rainSource.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1800;
    rainFilter.Q.value = 0.55;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = this.isMuted ? 0 : 0.035;
    this.rainSource.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    this.rainSource.start();

    this.droneOsc = ctx.createOscillator();
    this.droneGain = ctx.createGain();
    this.droneOsc.type = 'sine';
    this.droneOsc.frequency.value = 46;
    this.droneGain.gain.value = this.isMuted ? 0 : 0.028;
    this.droneOsc.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);
    this.droneOsc.start();

    const windBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const windData = windBuf.getChannelData(0);
    for (let i = 0; i < windData.length; i++) windData[i] = Math.random() * 2 - 1;
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = windBuf;
    this.windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 280;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = this.isMuted ? 0 : 0.04;
    this.windSource.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    this.windSource.start();
  }

  stopManorAmbience(): void {
    try { this.rainSource?.stop(); this.rainSource?.disconnect(); } catch (_) {}
    try { this.droneOsc?.stop(); this.droneOsc?.disconnect(); } catch (_) {}
    try { this.windSource?.stop(); this.windSource?.disconnect(); } catch (_) {}
    this.rainSource = null;
    this.droneOsc = null;
    this.windSource = null;
    this.rainGain = null;
    this.droneGain = null;
    this.windGain = null;
  }

  playDegauss(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;

    // 1. Low frequency resonant coil "BWOMMM"
    const coilOsc = ctx.createOscillator();
    const coilGain = ctx.createGain();
    coilOsc.type = 'sawtooth';
    coilOsc.frequency.setValueAtTime(120, t);
    coilOsc.frequency.exponentialRampToValueAtTime(35, t + 0.65);

    const coilFilter = ctx.createBiquadFilter();
    coilFilter.type = 'lowpass';
    coilFilter.frequency.setValueAtTime(320, t);
    coilFilter.frequency.linearRampToValueAtTime(80, t + 0.65);

    coilGain.gain.setValueAtTime(0.35, t);
    coilGain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

    coilOsc.connect(coilFilter);
    coilFilter.connect(coilGain);
    coilGain.connect(this.masterGain);

    coilOsc.start(t);
    coilOsc.stop(t + 0.8);

    // 2. High voltage capacitor decay discharge
    const zapOsc = ctx.createOscillator();
    const zapGain = ctx.createGain();
    zapOsc.type = 'sine';
    zapOsc.frequency.setValueAtTime(4200, t);
    zapOsc.frequency.exponentialRampToValueAtTime(300, t + 0.4);

    zapGain.gain.setValueAtTime(0.08, t);
    zapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    zapOsc.connect(zapGain);
    zapGain.connect(this.masterGain);
    zapOsc.start(t);
    zapOsc.stop(t + 0.5);
  }

  playCrtPower(): void {
    const ctx = this.initCtx();
    if (!ctx || !this.masterGain || this.isMuted) return;

    const t = ctx.currentTime;

    // Heavy tactile push-button switch clunk
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(320, t);
    clickOsc.frequency.exponentialRampToValueAtTime(50, t + 0.05);

    clickGain.gain.setValueAtTime(0.3, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(t);
    clickOsc.stop(t + 0.07);

    // High flyback 15.75 kHz CRT whine rise
    const whineOsc = ctx.createOscillator();
    const whineGain = ctx.createGain();
    whineOsc.type = 'sine';
    whineOsc.frequency.setValueAtTime(8000, t + 0.05);
    whineOsc.frequency.exponentialRampToValueAtTime(15750, t + 0.4);

    whineGain.gain.setValueAtTime(0.0001, t);
    whineGain.gain.setValueAtTime(0.03, t + 0.05);
    whineGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    whineOsc.connect(whineGain);
    whineGain.connect(this.masterGain);
    whineOsc.start(t + 0.05);
    whineOsc.stop(t + 0.85);
  }
}

export const sfx = new SoundSynthesizer();
