/**
 * Renderoni Master Showcase Controller & Live Agent Inspector
 */

import { PsxGame } from './psx-game.js';
import { FlightGame } from './flight-game.js';
import { VoxelGame } from './voxel-game.js';
import { QuickstartGame } from './quickstart-game.js';
import { ObservationEngine } from '../core/observations.js';

type GameMode = 'psx' | 'flight' | 'voxel' | 'quickstart';

class PlaygroundApp {
  private activeMode: GameMode = 'psx';
  private currentGame: PsxGame | FlightGame | VoxelGame | QuickstartGame | null = null;
  private canvas: HTMLCanvasElement;
  private isInspectorOpen = true;

  // DOM Elements
  private hudContainer!: HTMLElement;
  private inspectorContent!: HTMLElement;
  private inspectorHash!: HTMLElement;
  private inspectorTick!: HTMLElement;
  private inspectorBytes!: HTMLElement;
  private actionInput!: HTMLInputElement;
  private inspectModal!: HTMLElement;
  private inspectBodyText!: HTMLElement;
  private interactionPrompt!: HTMLElement;
  private promptText!: HTMLElement;

  constructor() {
    this.canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    this.initDOM();
    this.switchGame('psx');
    this.startHUDUpdateLoop();
  }

  private initDOM(): void {
    this.hudContainer = document.getElementById('game-hud')!;
    this.inspectorContent = document.getElementById('inspector-content')!;
    this.inspectorHash = document.getElementById('inspector-hash')!;
    this.inspectorTick = document.getElementById('inspector-tick')!;
    this.inspectorBytes = document.getElementById('inspector-bytes')!;
    this.actionInput = document.getElementById('action-input') as HTMLInputElement;
    this.inspectModal = document.getElementById('inspect-modal')!;
    this.inspectBodyText = document.getElementById('inspect-body-text')!;
    this.interactionPrompt = document.getElementById('interaction-prompt')!;
    this.promptText = document.getElementById('prompt-text')!;

    // Modal Close
    document.getElementById('btn-close-inspect')?.addEventListener('click', () => {
      this.inspectModal.style.display = 'none';
    });
    this.inspectModal?.addEventListener('click', (e) => {
      if (e.target === this.inspectModal) {
        this.inspectModal.style.display = 'none';
      }
    });

    // Canvas click blurs any input and focuses the canvas
    this.canvas.addEventListener('click', () => {
      (document.activeElement as HTMLElement)?.blur();
      this.canvas.focus();
    });

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetMode = (e.currentTarget as HTMLElement).dataset.mode as GameMode;
        if (targetMode && targetMode !== this.activeMode) {
          (document.activeElement as HTMLElement)?.blur();
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

    // Quick Action Chips in Agent Inspector
    document.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest('.chip-btn') as HTMLElement;
      if (chip && chip.dataset.action && this.currentGame) {
        const actName = chip.dataset.action;
        const payload = chip.dataset.payload !== undefined ? parseFloat(chip.dataset.payload) : undefined;
        this.currentGame.engine.act({ name: actName, payload });
        (document.activeElement as HTMLElement)?.blur();
      }
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
    this.inspectModal.style.display = 'none';
    this.interactionPrompt.style.display = 'none';

    // Update Tab UI
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
    });

    // Update Quick Action Chips for current archetype
    this.updateQuickActions(mode);

    // Mount Game
    if (mode === 'psx') {
      this.currentGame = new PsxGame(this.canvas);
      await this.currentGame.init();
      this.mountPsxHUD();
    } else if (mode === 'flight') {
      this.currentGame = new FlightGame(this.canvas);
      await this.currentGame.init();
      this.mountFlightHUD();
    } else if (mode === 'voxel') {
      this.currentGame = new VoxelGame(this.canvas);
      await this.currentGame.init();
      this.mountVoxelHUD();
    } else if (mode === 'quickstart') {
      this.currentGame = new QuickstartGame(this.canvas);
      await this.currentGame.init();
      this.mountQuickstartHUD();
    }

    this.handleResize();
  }

  private updateQuickActions(mode: GameMode): void {
    const container = document.getElementById('quick-actions');
    if (!container) return;

    if (mode === 'psx') {
      container.innerHTML = `
        <button class="chip-btn" data-action="quest.readJournal">📖 Read Journal</button>
        <button class="chip-btn" data-action="quest.pickupKey">🗝️ Pickup Key</button>
        <button class="chip-btn" data-action="quest.solveClock">🕰️ Solve Clock (11:45)</button>
        <button class="chip-btn" data-action="quest.pickupCrest">🛡️ Pickup Crest</button>
        <button class="chip-btn" data-action="quest.unlockGate">🚪 Escape Gate</button>
        <button class="chip-btn" data-action="player.toggleFlashlight">🔦 Flashlight (F)</button>
      `;
    } else if (mode === 'flight') {
      container.innerHTML = `
        <button class="chip-btn" data-action="flight.throttle" data-payload="1.0">⚡ Max Throttle (Z)</button>
        <button class="chip-btn" data-action="flight.throttle" data-payload="0.0">🛑 Cut Throttle (X)</button>
        <button class="chip-btn" data-action="flight.toggleCamera">🎥 View (C)</button>
        <button class="chip-btn" data-action="flight.reset">🔄 Reset (R)</button>
      `;
    } else if (mode === 'voxel') {
      container.innerHTML = `
        <button class="chip-btn" data-action="voxel.place" data-payload="lantern">💡 Place Lantern</button>
        <button class="chip-btn" data-action="voxel.place" data-payload="stone">🧱 Place Stone</button>
        <button class="chip-btn" data-action="voxel.place" data-payload="crystal">🔮 Place Crystal</button>
      `;
    } else if (mode === 'quickstart') {
      container.innerHTML = `
        <button class="chip-btn" data-action="quickstart.respawnCoin">🪙 Respawn Coin</button>
      `;
    }
  }

  private mountPsxHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card">
        <div class="hud-title">🔦 Echoes of Blackwood (PSX 1st-Person)</div>
        <div class="instructions-text">
          Click canvas to <strong>Lock Pointer</strong> &bull; Move mouse to Look<br/>
          <strong>WASD</strong>: Walk &bull; <strong>Shift</strong>: Sprint &bull; <strong>F</strong>: Flashlight &bull; <strong>E</strong>: Inspect / Interact<br/>
          Investigate the manor, find the journal clue, wind the grandfather clock, and escape!
        </div>
        <div class="quest-box">
          <div class="label">Current Objective:</div>
          <div id="psx-quest" class="quest-status">Search the Library for the Clockmaker's Journal</div>
        </div>
        <div class="telemetry-grid">
          <div class="metric"><span class="label">Flashlight:</span> <span id="psx-flash" class="val tag tag-green">ON (F)</span></div>
          <div class="metric"><span class="label">Clock Key:</span> <span id="psx-key" class="val tag tag-red">Missing</span></div>
          <div class="metric"><span class="label">Family Crest:</span> <span id="psx-crest" class="val tag tag-red">Missing</span></div>
          <div class="metric"><span class="label">Manor Gate:</span> <span id="psx-gate" class="val tag tag-orange">Sealed</span></div>
        </div>
        <div class="controls-row">
          <button id="btn-toggle-flash" class="btn btn-secondary">🔦 Flashlight (F)</button>
          <button id="btn-read-note" class="btn btn-primary">📖 Read Note (E)</button>
        </div>
      </div>
    `;

    document.getElementById('btn-toggle-flash')?.addEventListener('click', (e) => {
      (this.currentGame as PsxGame)?.toggleFlashlight();
      (e.currentTarget as HTMLElement)?.blur();
    });

    document.getElementById('btn-read-note')?.addEventListener('click', (e) => {
      (this.currentGame as PsxGame)?.readJournal();
      (e.currentTarget as HTMLElement)?.blur();
    });
  }

  private mountFlightHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card">
        <div class="hud-title">✈️ Skyward Courier: Isle of Aeolus</div>
        <div class="instructions-text">
          <strong>Shift / Ctrl</strong>: Throttle Up / Down &bull; <strong>Z</strong>: Max Throttle &bull; <strong>X</strong>: Cut Throttle<br/>
          <strong>W / S</strong>: Pitch Down / Up &bull; <strong>A / D</strong>: Yaw / Turn Left / Right<br/>
          <strong>Q / E</strong>: Roll Left / Right &bull; <strong>C</strong>: View Mode &bull; <strong>R</strong>: Reset
        </div>
        <div class="quest-box">
          <div class="label">Mission Route:</div>
          <div id="flight-quest" class="quest-status">Take off from Haven Island runway</div>
        </div>
        <div class="telemetry-grid">
          <div class="metric"><span class="label">Airspeed:</span> <span id="flight-speed" class="val">0 km/h</span></div>
          <div class="metric"><span class="label">Altitude:</span> <span id="flight-alt" class="val">0 m</span></div>
          <div class="metric"><span class="label">Flight State:</span> <span id="flight-state" class="val tag tag-green">Parked</span></div>
          <div class="metric"><span class="label">Deliveries:</span> <span id="flight-parcels" class="val">0 / 3</span></div>
        </div>
        <div class="controls-row">
          <button id="btn-toggle-view" class="btn btn-secondary">🎥 View (C)</button>
          <button id="btn-throttle-max" class="btn" style="background:#2563eb; color:white;">⚡ Max (Z)</button>
          <button id="btn-throttle-cut" class="btn" style="background:#dc2626; color:white;">🛑 Cut (X)</button>
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
      (document.activeElement as HTMLElement)?.blur();
    });

    document.getElementById('btn-toggle-view')?.addEventListener('click', (e) => {
      (this.currentGame as FlightGame)?.toggleCameraView();
      (e.currentTarget as HTMLElement)?.blur();
    });

    document.getElementById('btn-throttle-max')?.addEventListener('click', (e) => {
      (this.currentGame as FlightGame)?.setThrottle(1.0);
      (e.currentTarget as HTMLElement)?.blur();
    });

    document.getElementById('btn-throttle-cut')?.addEventListener('click', (e) => {
      (this.currentGame as FlightGame)?.setThrottle(0.0);
      (e.currentTarget as HTMLElement)?.blur();
    });

    document.getElementById('btn-reset-plane')?.addEventListener('click', (e) => {
      (this.currentGame as FlightGame)?.resetPlane();
      (e.currentTarget as HTMLElement)?.blur();
    });
  }

  private mountVoxelHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card">
        <div class="hud-title">🧱 Monolith: Ancient Voxel Ruins</div>
        <div class="instructions-text">
          Click canvas to <strong>Lock Pointer</strong> &bull; Move mouse to Look<br/>
          <strong>WASD</strong>: Walk &bull; <strong>Shift</strong>: Sprint &bull; <strong>Space</strong>: Jump &bull; Auto-steps over blocks<br/>
          <strong>Left Click</strong>: Break Block &bull; <strong>Right Click</strong>: Place Block &bull; <strong>1-6</strong>: Select Block
        </div>
        <div class="quest-box">
          <div class="label">Restoration Objective:</div>
          <div id="vox-quest" class="quest-status">Find the 3 Hidden Aether Crystals (0/3)</div>
        </div>
        <div class="telemetry-grid">
          <div class="metric"><span class="label">Position:</span> <span id="vox-pos" class="val">0, 0, 0</span></div>
          <div class="metric"><span class="label">Loaded Blocks:</span> <span id="vox-blocks" class="val">0</span></div>
        </div>
        <div class="hotbar">
          <span class="hotbar-item" data-type="grass">1: Grass</span>
          <span class="hotbar-item" data-type="stone">2: Stone</span>
          <span class="hotbar-item" data-type="wood">3: Wood</span>
          <span class="hotbar-item" data-type="leaves">4: Leaves</span>
          <span class="hotbar-item" data-type="crystal">5: Crystal</span>
          <span class="hotbar-item active" data-type="lantern">6: Lantern</span>
        </div>
      </div>
    `;
  }

  private mountQuickstartHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="hud-card">
        <div class="hud-title">🪙 README Quickstart Demo</div>
        <div class="instructions-text">
          <strong>WASD / Arrow Keys</strong>: Move Hero Player &bull; <strong>Space</strong>: Jump<br/>
          Walk to the <strong>Golden Coin</strong> at (5, 1.4, 0) to trigger the sensor, play audio, spawn VFX particles, and destroy the coin!
        </div>
        <div class="telemetry-grid">
          <div class="metric"><span class="label">Hero Position:</span> <span id="qs-pos" class="val">0.0, 1.5, 0.0</span></div>
          <div class="metric"><span class="label">Coins Collected:</span> <span id="qs-coins" class="val tag">0</span></div>
        </div>
        <div class="controls-row">
          <button id="btn-respawn-coin" class="btn btn-primary">🪙 Respawn Coin</button>
        </div>
      </div>
    `;

    document.getElementById('btn-respawn-coin')?.addEventListener('click', (e) => {
      (this.currentGame as QuickstartGame)?.respawnCoin();
      (e.currentTarget as HTMLElement)?.blur();
    });
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
    this.actionInput.blur();
  }

  private startHUDUpdateLoop(): void {
    const updateHUD = () => {
      if (this.currentGame) {
        if (this.activeMode === 'psx') {
          const t = (this.currentGame as PsxGame).getTelemetry();
          const questEl = document.getElementById('psx-quest');
          const flashEl = document.getElementById('psx-flash');
          const keyEl = document.getElementById('psx-key');
          const crestEl = document.getElementById('psx-crest');
          const gateEl = document.getElementById('psx-gate');

          if (questEl) questEl.textContent = t.questStatus;
          if (flashEl) {
            flashEl.textContent = t.flashlightOn ? 'ON (F)' : 'OFF (F)';
            flashEl.className = `val tag ${t.flashlightOn ? 'tag-green' : 'tag-red'}`;
          }
          if (keyEl) {
            keyEl.textContent = t.hasKey ? 'Collected' : 'Missing';
            keyEl.className = `val tag ${t.hasKey ? 'tag-green' : 'tag-red'}`;
          }
          if (crestEl) {
            crestEl.textContent = t.hasCrest ? 'Acquired' : 'Missing';
            crestEl.className = `val tag ${t.hasCrest ? 'tag-green' : 'tag-red'}`;
          }
          if (gateEl) {
            gateEl.textContent = t.gateUnlocked ? 'Unlocked!' : 'Sealed';
            gateEl.className = `val tag ${t.gateUnlocked ? 'tag-green' : 'tag-orange'}`;
          }

          // Hover Interaction Prompt
          const prompt = (this.currentGame as PsxGame).getHoverPrompt();
          if (prompt && !t.inspectingText) {
            this.interactionPrompt.style.display = 'block';
            this.promptText.textContent = prompt;
          } else {
            this.interactionPrompt.style.display = 'none';
          }

          // Note Inspection Modal
          if (t.inspectingText) {
            this.inspectModal.style.display = 'flex';
            this.inspectBodyText.textContent = t.inspectingText;
          } else {
            this.inspectModal.style.display = 'none';
          }
        } else if (this.activeMode === 'flight') {
          const t = (this.currentGame as FlightGame).getTelemetry();
          const spdEl = document.getElementById('flight-speed');
          const altEl = document.getElementById('flight-alt');
          const stateEl = document.getElementById('flight-state');
          const parcelsEl = document.getElementById('flight-parcels');
          const questEl = document.getElementById('flight-quest');
          const throttleSlider = document.getElementById('flight-throttle') as HTMLInputElement;
          const throttleVal = document.getElementById('flight-throttle-val');

          if (spdEl) spdEl.textContent = `${t.speed} km/h`;
          if (altEl) altEl.textContent = `${t.altitude} m`;
          if (questEl) questEl.textContent = t.activeObjective;
          if (parcelsEl) parcelsEl.textContent = `${t.parcelsDelivered} / ${t.totalParcels}`;
          if (stateEl) {
            stateEl.textContent = t.flightState;
            stateEl.className = `val tag ${t.flightState === 'Airborne' ? 'tag-green' : t.flightState === 'Stall Warning' ? 'tag-red' : 'tag-orange'}`;
          }
          if (throttleSlider && document.activeElement !== throttleSlider) {
            throttleSlider.value = Math.round(t.throttle * 100).toString();
          }
          if (throttleVal) throttleVal.textContent = `${Math.round(t.throttle * 100)}%`;
        } else if (this.activeMode === 'voxel') {
          const t = (this.currentGame as VoxelGame).getTelemetry();
          const posEl = document.getElementById('vox-pos');
          const blocksEl = document.getElementById('vox-blocks');
          const questEl = document.getElementById('vox-quest');

          if (posEl) posEl.textContent = `${t.playerPos[0]}, ${t.playerPos[1]}, ${t.playerPos[2]}`;
          if (blocksEl) blocksEl.textContent = `${t.blockCount}`;
          if (questEl) questEl.textContent = t.questStatus;

          document.querySelectorAll('.hotbar-item').forEach((item) => {
            const el = item as HTMLElement;
            el.classList.toggle('active', el.dataset.type === t.selectedBlockType);
          });
        } else if (this.activeMode === 'quickstart') {
          const t = (this.currentGame as QuickstartGame).getTelemetry();
          const posEl = document.getElementById('qs-pos');
          const coinsEl = document.getElementById('qs-coins');
          if (posEl) posEl.textContent = `${t.playerPos[0]}, ${t.playerPos[1]}, ${t.playerPos[2]}`;
          if (coinsEl) coinsEl.textContent = `${t.coinsCollected}`;
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
