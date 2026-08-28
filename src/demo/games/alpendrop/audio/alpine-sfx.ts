/**
 * Procedural Web Audio Sound Effects & Alpine Soundscape
 * Real-time synthesis for multi-rotor whine, prop hum, wind rush, cowbells, impacts, and jingles.
 */

export class AlpineAudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;

  // Continuous Motor Sound Nodes
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;

  private planeOsc: OscillatorNode | null = null;
  private planeGain: GainNode | null = null;

  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  private cowbellTimer: number = 0;

  init(): void {
    if (typeof window === 'undefined') return;

    const resumeAudio = () => {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
          this.setupMasterBus();
          this.setupContinuousEngines();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', resumeAudio, { once: true });
    window.addEventListener('keydown', resumeAudio, { once: true });
  }

  private setupMasterBus(): void {
    if (!this.ctx) return;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  private setupContinuousEngines(): void {
    if (!this.ctx || !this.masterGain) return;

    // 1. Dual-Oscillator Drone Motor Drone
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc2 = this.ctx.createOscillator();
    this.droneGain = this.ctx.createGain();

    this.droneOsc1.type = 'sawtooth';
    this.droneOsc2.type = 'triangle';
    this.droneOsc1.frequency.setValueAtTime(140, this.ctx.currentTime);
    this.droneOsc2.frequency.setValueAtTime(143, this.ctx.currentTime); // Slight detune for phasing

    this.droneGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.droneOsc1.connect(this.droneGain);
    this.droneOsc2.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    this.droneOsc1.start();
    this.droneOsc2.start();

    // 2. RC Airplane Propeller
    this.planeOsc = this.ctx.createOscillator();
    this.planeGain = this.ctx.createGain();
    this.planeOsc.type = 'sawtooth';
    this.planeOsc.frequency.setValueAtTime(90, this.ctx.currentTime);
    this.planeGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.planeOsc.connect(this.planeGain);
    this.planeGain.connect(this.masterGain);
    this.planeOsc.start();

    // 3. Wind Rush Noise Generator
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = noiseBuffer;
    this.windSource.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.setValueAtTime(300, this.ctx.currentTime);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    this.windSource.start();
  }

  updateFlightAudio(isPlane: boolean, throttle: number, speedKmh: number, dt: number): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (isPlane) {
      if (this.droneGain) this.droneGain.gain.setTargetAtTime(0.0, now, 0.05);
      if (this.planeGain && this.planeOsc) {
        const targetVol = 0.04 + throttle * 0.18;
        const targetPitch = 70 + throttle * 160 + speedKmh * 0.8;
        this.planeGain.gain.setTargetAtTime(targetVol, now, 0.05);
        this.planeOsc.frequency.setTargetAtTime(targetPitch, now, 0.05);
      }
    } else {
      if (this.planeGain) this.planeGain.gain.setTargetAtTime(0.0, now, 0.05);
      if (this.droneGain && this.droneOsc1 && this.droneOsc2) {
        const targetVol = 0.03 + throttle * 0.16;
        const targetPitch = 120 + throttle * 280;
        this.droneGain.gain.setTargetAtTime(targetVol, now, 0.05);
        this.droneOsc1.frequency.setTargetAtTime(targetPitch, now, 0.05);
        this.droneOsc2.frequency.setTargetAtTime(targetPitch * 1.025, now, 0.05);
      }
    }

    // Wind rush scaling with speed
    if (this.windGain && this.windFilter) {
      const windVol = Math.min(0.22, (speedKmh / 120) * 0.22);
      const windFreq = 200 + speedKmh * 18;
      this.windGain.gain.setTargetAtTime(windVol, now, 0.1);
      this.windFilter.frequency.setTargetAtTime(windFreq, now, 0.1);
    }

    // Periodic ambient cowbell chimes in the distance
    this.cowbellTimer += dt;
    if (this.cowbellTimer > 5.5 + Math.random() * 4.0) {
      this.cowbellTimer = 0;
      this.playCowbell();
    }
  }

  playCowbell(): void {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const baseFreq = 780 + Math.random() * 80;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.9);
  }

  playMagnetSnap(): void {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.12);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playDrop(): void {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.18);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playImpact(intensity: number): void {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

    const vol = Math.min(0.4, 0.1 + intensity * 0.05);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  playSuccessJingle(): void {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (Alpine fanfare)

    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.11;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.22, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

export const alpineSFX = new AlpineAudioSystem();
