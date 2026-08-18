/**
 * Renderoni Interactive Web Playground & Live Agent Inspector
 */

import { FlightGame } from './flight-game.js';
import { VoxelGame } from './voxel-game.js';
import { PsxGame } from './psx-game.js';
import { ObservationEngine } from '../core/observations.js';

type GameMode = 'flight' | 'voxel' | 'psx';

class PlaygroundApp {
  private activeMode: GameMode = 'flight';
  private currentGame: FlightGame | VoxelGame | PsxGame | null = null;
  private canvas: HTMLCanvasElement;
  private isInspectorOpen = true;

  // DOM Elements
  private hudContainer!: HTMLElement;
  private inspectorContent!: HTMLElement;
  private inspectorHash!: HTMLElement;
  private inspectorTick!: HTMLElement;
  private inspectorBytes!: HTMLElement;
  private actionInput!: HTMLInputElement;

  constructor() {
    this.canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    this.initDOM();
    this.switchGame('flight');
    this.startHUDUpdateLoop();
  }

  private initDOM(): void {
    this.hudContainer = document.getElementById('game-hud')!;
    this.inspectorContent = document.getElementById('inspector-content')!;
    this.inspectorHash = document.getElementById('inspector-hash')!;
    this.inspectorTick = document.getElementById('inspector-tick')!;
    this.inspectorBytes = document.getElementById('inspector-bytes')!;
    this.actionInput = document.getElementById('action-input') as HTMLInputElement;

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetMode = (e.currentTarget as HTMLElement).dataset.mode as GameMode;
        if (targetMode && targetMode !== this.activeMode) {
          this.switchGame(targetMode);
        }
      });
    });

    // Inspector Toggle
    document.getElementById('toggle-inspector')?.addEventListener('click', () => {
      this.isInspectorOpen = !this.isInspectorOpen;
      const body = document.getElementById('inspector-body')!;
      body.style.display = this.isInspectorOpen ? 'block' : 'none';
    });

    // Action Dispatcher
    document.getElementById('btn-dispatch-action')?.addEventListener('click', () => {
      this.dispatchCustomAction();
    });

    this.actionInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.dispatchCustomAction();
      }
    });

    // Global Key shortcuts
    window.addEventListener('keydown', (e) => {
      if (document.activeElement === this.actionInput) return;

      if (this.activeMode === 'flight') {
        if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
          (this.currentGame as FlightGame)?.resetPlane();
        } else if (e.code === 'KeyG' || e.key.toLowerCase() === 'g') {
          (this.currentGame as FlightGame)?.toggleLandingGear();
        } else if (e.code === 'KeyC' || e.key.toLowerCase() === 'c') {
          (this.currentGame as FlightGame)?.toggleCameraView();
        }
      }
    });

    // Window Resize
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();
  }

  private handleResize(): void {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (this.currentGame?.engine.native.renderer) {
      this.currentGame.engine.native.renderer.setSize(window.innerWidth, window.innerHeight);
      this.currentGame.engine.native.camera.aspect = window.innerWidth / window.innerHeight;
      this.currentGame.engine.native.camera.updateProjectionMatrix();
    }
  }

  async switchGame(mode: GameMode): Promise<void> {
    if (this.currentGame) {
      this.currentGame.dispose();
      this.currentGame = null;
    }

    this.activeMode = mode;

    // Update Tab UI
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
    });

    // Mount Game
    if (mode === 'flight') {
      this.currentGame = new FlightGame(this.canvas);
      await this.currentGame.init();
      this.mountFlightHUD();
    } else if (mode === 'voxel') {
      this.currentGame = new VoxelGame(this.canvas);
      await this.currentGame.init();
      this.mountVoxelHUD();
    } else if (mode === 'psx') {
      this.currentGame = new PsxGame(this.canvas);
      await this.currentGame.init();
      this.mountPsxHUD();
    }

    this.handleResize();
  }

  private mountFlightHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card flight-card">
        <div class="hud-title">✈️ Aeroplane Flight Simulator</div>
        <div class="instructions-text">
          <strong>Shift / Ctrl</strong>: Throttle up / down (100% to takeoff)<br/>
          <strong>W / S</strong>: Pitch &bull; <strong>A / D</strong>: Roll &bull; <strong>Q / E</strong>: Yaw<br/>
          <strong>G</strong>: Toggle Landing Gear &bull; <strong>C</strong>: Cockpit / Outside View &bull; <strong>R</strong>: Reset Runway
        </div>
        <div class="telemetry-grid">
          <div class="metric"><span class="label">Airspeed:</span> <span id="flight-speed" class="val">0 km/h</span></div>
          <div class="metric"><span class="label">Altitude:</span> <span id="flight-alt" class="val">0 m</span></div>
          <div class="metric"><span class="label">Gear:</span> <span id="flight-gear" class="val tag">DOWN</span></div>
          <div class="metric"><span class="label">View:</span> <span id="flight-view" class="val">Outside</span></div>
        </div>
        <div class="controls-row">
          <button id="btn-toggle-view" class="btn btn-secondary">🎥 View: Cockpit/Outside (C)</button>
          <button id="btn-toggle-gear" class="btn btn-primary">🛞 Gear Up/Down (G)</button>
          <button id="btn-reset-plane" class="btn" style="background:#475569; color:white;">🔄 Reset (R)</button>
        </div>
        <div class="throttle-row">
          <label for="flight-throttle">Throttle:</label>
          <input id="flight-throttle" type="range" min="0" max="100" value="0" />
          <span id="flight-throttle-val" class="val">0%</span>
        </div>
      </div>
    `;

    const throttleInput = document.getElementById('flight-throttle') as HTMLInputElement;
    throttleInput?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value) / 100;
      (this.currentGame as FlightGame)?.setThrottle(val);
      const label = document.getElementById('flight-throttle-val');
      if (label) label.textContent = `${Math.round(val * 100)}%`;
    });

    document.getElementById('btn-toggle-view')?.addEventListener('click', () => {
      (this.currentGame as FlightGame)?.toggleCameraView();
    });

    document.getElementById('btn-toggle-gear')?.addEventListener('click', () => {
      (this.currentGame as FlightGame)?.toggleLandingGear();
    });

    document.getElementById('btn-reset-plane')?.addEventListener('click', () => {
      (this.currentGame as FlightGame)?.resetPlane();
    });
  }

  private mountVoxelHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card">
        <div class="hud-title">🧱 Vast Voxel Sandbox</div>
        <div class="instructions-text">
          Click screen to <strong>Lock Pointer</strong><br/>
          <strong>WASD</strong>: Walk &bull; <strong>Shift</strong>: Sprint &bull; <strong>Space</strong>: Jump<br/>
          <strong>Left Click</strong>: Break Block &bull; <strong>Right Click</strong>: Place Block<br/>
          Keys <strong>1-6</strong>: Select Block (Grass, Stone, Wood, Leaves, Sand, Lantern)
        </div>
        <div class="telemetry-grid">
          <div class="metric"><span class="label">Position:</span> <span id="vox-pos" class="val">0, 0, 0</span></div>
          <div class="metric"><span class="label">Loaded Blocks:</span> <span id="vox-blocks" class="val">0</span></div>
        </div>
        <div class="hotbar">
          <span class="hotbar-item active" data-type="grass">1: Grass</span>
          <span class="hotbar-item" data-type="stone">2: Stone</span>
          <span class="hotbar-item" data-type="wood">3: Wood</span>
          <span class="hotbar-item" data-type="leaves">4: Leaves</span>
          <span class="hotbar-item" data-type="sand">5: Sand</span>
          <span class="hotbar-item" data-type="lantern">6: Lantern</span>
        </div>
      </div>
      <div class="crosshair">+</div>
    `;
  }

  private mountPsxHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card psx-card">
        <div class="hud-title">🔦 PSX 3rd-Person Horror</div>
        <div class="instructions-text">
          Click screen to <strong>Lock Pointer</strong> &bull; Move mouse to Orbit Camera<br/>
          <strong>WASD</strong>: Walk Detective &bull; <strong>E</strong>: Interact<br/>
          Find the <strong>Rusty Key</strong> on the table to unlock the <strong>Sealed Iron Gate</strong>!
        </div>
        <div class="quest-box">
          <div class="label">Current Objective:</div>
          <div id="psx-quest" class="quest-status">Find the Rusty Key</div>
        </div>
      </div>
    `;
  }

  private dispatchCustomAction(): void {
    const raw = this.actionInput.value.trim();
    if (!raw || !this.currentGame) return;

    try {
      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        this.currentGame.engine.act(parsed);
      } else {
        this.currentGame.engine.act({ name: raw });
      }
      this.actionInput.value = '';
    } catch (_) {
      this.currentGame.engine.act({ name: raw });
      this.actionInput.value = '';
    }
  }

  private startHUDUpdateLoop(): void {
    const updateHUD = () => {
      if (this.currentGame) {
        if (this.activeMode === 'flight') {
          const t = (this.currentGame as FlightGame).getTelemetry();
          const spdEl = document.getElementById('flight-speed');
          const altEl = document.getElementById('flight-alt');
          const gearEl = document.getElementById('flight-gear');
          const viewEl = document.getElementById('flight-view');
          const throttleSlider = document.getElementById('flight-throttle') as HTMLInputElement;
          const throttleVal = document.getElementById('flight-throttle-val');

          if (spdEl) spdEl.textContent = `${t.speed} km/h`;
          if (altEl) altEl.textContent = `${t.altitude} m`;
          if (gearEl) {
            gearEl.textContent = t.gearDown ? 'DOWN' : 'RETRACTED';
            gearEl.className = `val tag ${t.gearDown ? 'tag-green' : 'tag-orange'}`;
          }
          if (viewEl) viewEl.textContent = t.viewMode === 'cockpit' ? 'Cockpit' : 'Outside';
          if (throttleSlider && document.activeElement !== throttleSlider) {
            throttleSlider.value = Math.round(t.throttle * 100).toString();
          }
          if (throttleVal) throttleVal.textContent = `${Math.round(t.throttle * 100)}%`;
        } else if (this.activeMode === 'voxel') {
          const t = (this.currentGame as VoxelGame).getTelemetry();
          const posEl = document.getElementById('vox-pos');
          const blocksEl = document.getElementById('vox-blocks');
          if (posEl) posEl.textContent = `${t.playerPos[0]}, ${t.playerPos[1]}, ${t.playerPos[2]}`;
          if (blocksEl) blocksEl.textContent = `${t.blockCount}`;

          document.querySelectorAll('.hotbar-item').forEach((item) => {
            const el = item as HTMLElement;
            el.classList.toggle('active', el.dataset.type === t.selectedBlockType);
          });
        } else if (this.activeMode === 'psx') {
          const t = (this.currentGame as PsxGame).getTelemetry();
          const questEl = document.getElementById('psx-quest');
          if (questEl) questEl.textContent = t.questStatus;
        }

        // Live Agent Inspector Update
        if (this.isInspectorOpen) {
          const obs = ObservationEngine.generateTier0(this.currentGame.engine);
          this.inspectorContent.textContent = obs.markdown;
          this.inspectorHash.textContent = this.currentGame.engine.getStateHash().slice(0, 16);
          this.inspectorTick.textContent = `Tick: ${this.currentGame.engine.tick}`;
          this.inspectorBytes.textContent = `${obs.bytes}B / 500B`;
        }
      }

      requestAnimationFrame(updateHUD);
    };

    requestAnimationFrame(updateHUD);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  new PlaygroundApp();
});
