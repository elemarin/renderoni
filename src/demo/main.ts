/**
 * Renderoni Interactive Web Playground & Live Agent Inspector
 */

import { KspGame } from './ksp-game.js';
import { VoxelGame } from './voxel-game.js';
import { PsxGame } from './psx-game.js';
import { ObservationEngine } from '../core/observations.js';

type GameMode = 'ksp' | 'voxel' | 'psx';

class PlaygroundApp {
  private activeMode: GameMode = 'ksp';
  private currentGame: KspGame | VoxelGame | PsxGame | null = null;
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
    this.switchGame('ksp');
    this.startRenderLoop();
  }

  private initDOM(): void {
    this.hudContainer = document.getElementById('game-hud')!;
    this.inspectorContent = document.getElementById('inspector-content')!;
    this.inspectorHash = document.getElementById('inspector-hash')!;
    this.inspectorTick = document.getElementById('inspector-tick')!;
    this.inspectorBytes = document.getElementById('inspector-bytes')!;
    this.actionInput = document.getElementById('action-input') as HTMLInputElement;

    // Tabs
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

    // Resize
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
    if (mode === 'ksp') {
      this.currentGame = new KspGame(this.canvas);
      await this.currentGame.init();
      this.mountKspHUD();
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

  private mountKspHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card scifi-card">
        <div class="hud-title">🚀 KSP Rocket Telemetry (Archetype A)</div>
        <div class="telemetry-grid">
          <div class="metric"><span class="label">Altitude:</span> <span id="ksp-alt" class="val">0.0 m</span></div>
          <div class="metric"><span class="label">Speed:</span> <span id="ksp-vel" class="val">0.0 m/s</span></div>
          <div class="metric"><span class="label">Stage:</span> <span id="ksp-stage" class="val">Stage 1</span></div>
          <div class="metric"><span class="label">Status:</span> <span id="ksp-status" class="val tag">On Pad</span></div>
        </div>
        <div class="controls-row">
          <button id="btn-ksp-launch" class="btn btn-primary">🔥 Launch (Space)</button>
          <button id="btn-ksp-stage" class="btn btn-secondary">💥 Separate Stage (X)</button>
        </div>
        <div class="throttle-row">
          <label for="ksp-throttle">Throttle:</label>
          <input id="ksp-throttle" type="range" min="0" max="100" value="100" />
          <span id="ksp-throttle-val" class="val">100%</span>
        </div>
      </div>
    `;

    document.getElementById('btn-ksp-launch')?.addEventListener('click', () => {
      (this.currentGame as KspGame)?.launch();
    });

    document.getElementById('btn-ksp-stage')?.addEventListener('click', () => {
      (this.currentGame as KspGame)?.stage();
    });

    const throttleInput = document.getElementById('ksp-throttle') as HTMLInputElement;
    throttleInput?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value) / 100;
      (this.currentGame as KspGame)?.setThrottle(val);
      document.getElementById('ksp-throttle-val')!.textContent = `${Math.round(val * 100)}%`;
    });

    window.addEventListener('keydown', (e) => {
      if (this.activeMode !== 'ksp') return;
      if (e.code === 'Space') {
        (this.currentGame as KspGame)?.launch();
      } else if (e.code === 'KeyX') {
        (this.currentGame as KspGame)?.stage();
      }
    });
  }

  private mountVoxelHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card">
        <div class="hud-title">🧱 Infinite Voxel Sandbox (Archetype B)</div>
        <div class="instructions-text">
          Click screen to <strong>Lock Pointer</strong><br/>
          <strong>WASD</strong>: Walk & Auto-step &bull; <strong>Space</strong>: Jump<br/>
          <strong>Left Click</strong>: Break Voxel &bull; <strong>Right Click</strong>: Place Voxel
        </div>
        <div class="telemetry-grid">
          <div class="metric"><span class="label">Position:</span> <span id="vox-pos" class="val">0, 0, 0</span></div>
          <div class="metric"><span class="label">Loaded Blocks:</span> <span id="vox-blocks" class="val">0</span></div>
        </div>
      </div>
      <div class="crosshair">+</div>
    `;
  }

  private mountPsxHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card psx-card">
        <div class="hud-title">🔦 PSX Retro Horror (Archetype C)</div>
        <div class="instructions-text">
          Click screen to <strong>Lock Pointer</strong> &bull; <strong>WASD</strong>: Walk<br/>
          Walk to the table to grab the <strong>Rusty Key</strong>, then unlock the <strong>Sealed Iron Gate</strong>.
        </div>
        <div class="quest-box">
          <div class="label">Active Quest:</div>
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

  private startRenderLoop(): void {
    let lastTime = performance.now();

    const frame = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      if (this.currentGame) {
        if (this.activeMode === 'ksp') {
          (this.currentGame as KspGame).update(dt);
          const t = (this.currentGame as KspGame).getTelemetry();
          const altEl = document.getElementById('ksp-alt');
          const velEl = document.getElementById('ksp-vel');
          const stageEl = document.getElementById('ksp-stage');
          const statusEl = document.getElementById('ksp-status');
          if (altEl) altEl.textContent = `${t.altitude} m`;
          if (velEl) velEl.textContent = `${t.velocity} m/s`;
          if (stageEl) stageEl.textContent = `Stage ${t.stage}`;
          if (statusEl) {
            statusEl.textContent = t.isStaged ? 'Stage 2 In Flight' : t.isLaunched ? 'Ascending' : 'On Pad';
          }
        } else if (this.activeMode === 'voxel') {
          (this.currentGame as VoxelGame).update();
          const t = (this.currentGame as VoxelGame).getTelemetry();
          const posEl = document.getElementById('vox-pos');
          const blocksEl = document.getElementById('vox-blocks');
          if (posEl) posEl.textContent = `${t.playerPos[0]}, ${t.playerPos[1]}, ${t.playerPos[2]}`;
          if (blocksEl) blocksEl.textContent = `${t.blockCount}`;
        } else if (this.activeMode === 'psx') {
          (this.currentGame as PsxGame).update();
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

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  new PlaygroundApp();
});
