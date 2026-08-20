/**
 * Renderoni Master Showcase Controller & Live Agent Inspector
 * Features:
 * - Console Home Dashboard with 3D Cover Album carousel & Spotlight
 * - Multi-archetype game mounting (PSX Horror, Flight Sim, Voxel Sandbox, Orbital Arcade, Physics Lab)
 * - Seamless return-to-home and keyboard navigation (Left/Right/Enter/Esc)
 * - Live Agent Inspector with AST telemetry & action dispatch
 */

import { EchoesOfBlackwoodGame as PsxGame } from './games/echoes-of-blackwood/game.js';
import { SkywardCourierGame as FlightGame } from './games/skyward-courier/game.js';
import { QuickstartGame } from './quickstart-game.js';
import { ModelStudioScene } from './model-studio.js';
import { HomeScene } from './home-scene.js';
import { ObservationEngine } from '../core/observations.js';
import { sfx } from './audio-sfx.js';

export type GameMode = 'home' | 'studio' | 'psx' | 'flight' | 'quickstart';

export interface GameMetadata {
  id: GameMode;
  title: string;
  subtitle: string;
  genre: string;
  badge: string;
  accentColor: string;
  themeColorHex: number;
  description: string;
  features: string[];
  controls: Array<{ key: string; desc: string }>;
  quickActions: Array<{ label: string; action: string; payload?: any }>;
}

export const GAMES_METADATA: Record<string, GameMetadata> = {
  studio: {
    id: 'studio',
    title: 'Model Studio & Forge',
    subtitle: 'Pre-Game 3D Reconstruction & Approval Gate',
    genre: 'PROMPT-TO-SCENE LAB',
    badge: '🎨 3D MODEL STUDIO',
    accentColor: '#38bdf8',
    themeColorHex: 0x0284c7,
    description: 'Inspect, rotate, view colliders, and approve reconstructed 3D models before adding them to games.',
    features: [
      '🔄 360-degree Turntable with OrbitControls (Drag/Scroll)',
      '📐 Wireframe & Rapier Physics Collider Boundary Visualizer',
      '✅ Interactive Model Approval Gate for Level Inception',
      '📜 Declarative SceneInventory JSON Topology Viewer',
    ],
    controls: [
      { key: 'Mouse Drag', desc: 'Orbit & Rotate Model' },
      { key: 'Scroll Wheel', desc: 'Zoom In / Out' },
      { key: 'Click Item', desc: 'Load Reconstructed Model' },
    ],
    quickActions: [],
  },
  psx: {
    id: 'psx',
    title: 'Echoes of Blackwood',
    subtitle: 'Victorian Manor Investigation & Clock Puzzle',
    genre: 'PSX SURVIVAL HORROR',
    badge: '🔦 PSX 1ST-PERSON',
    accentColor: '#ef4444',
    themeColorHex: 0x881337,
    description: 'Investigate a haunted 90s PSX-style Victorian manor. Search for the clockmaker\'s secret journal, wind the ornate wall clock to unlock the hidden bookcase, retrieve the Blackwood Crest, and escape the sealed iron gate.',
    features: [
      '🎮 Kinematic Character Controller with Head Bob & Footstep Audio',
      '🔦 Handheld 3D Flashlight with Volumetric Beam & Battery Toggle',
      '⚡ Atmospheric Thunderstorm with Lightning & Flickering Sconces',
      '📜 Narrative Puzzle Quest Engine with AST Verification',
    ],
    controls: [
      { key: 'WASD', desc: 'Walk & Strafe' },
      { key: 'Shift', desc: 'Sprint' },
      { key: 'Mouse', desc: 'Look Around (Lock Pointer)' },
      { key: 'F', desc: 'Toggle Flashlight' },
      { key: 'E', desc: 'Inspect / Read Note' },
    ],
    quickActions: [
      { label: '📖 Read Journal', action: 'quest.readJournal' },
      { label: '🗝️ Pickup Key', action: 'quest.pickupKey' },
      { label: '🕰️ Solve Clock (11:45)', action: 'quest.solveClock' },
      { label: '🛡️ Pickup Crest', action: 'quest.pickupCrest' },
      { label: '🚪 Escape Gate', action: 'quest.unlockGate' },
      { label: '🔦 Flashlight (F)', action: 'player.toggleFlashlight' },
    ],
  },
  flight: {
    id: 'flight',
    title: 'Skyward Courier',
    subtitle: 'Island Airport Takeoff & Runway Landing',
    genre: 'AUTHENTIC FLIGHT SIM',
    badge: '✈️ 6-DOF AERODYNAMICS',
    accentColor: '#38bdf8',
    themeColorHex: 0x0284c7,
    description: 'Experience the thrill of a complete flight lifecycle! Start your engine (I), taxi down the 400m asphalt runway, rotate at 80 km/h for takeoff, navigate through aerial checkpoint rings, and flare for a smooth runway touchdown with tire smoke & brakes.',
    features: [
      '🛫 Realistic Runway Takeoff Roll & Engine Start Ignition (I)',
      '🛬 Smooth Runway Landing, Tire Screech SFX & Wheel Brakes (B)',
      '🏆 6 Aerial Checkpoint Rings across Tropical Island Valleys',
      '💨 Wingtip Vapor Trails & Dual Cockpit/Chase Camera Views (C)',
    ],
    controls: [
      { key: 'I', desc: 'Start Engine (Ignition)' },
      { key: 'Shift / Ctrl', desc: 'Throttle Up / Down' },
      { key: 'W / S', desc: 'Pitch Down / Stick Pull (Rotate)' },
      { key: 'A / D', desc: 'Steer on Ground / Bank in Air' },
      { key: 'B', desc: 'Hold Wheel Brakes (Ground)' },
      { key: 'Space', desc: 'Afterburner Turbo Boost' },
      { key: 'C', desc: 'Toggle Cockpit / Chase View' },
      { key: 'R', desc: 'Reset to Runway Threshold' },
    ],
    quickActions: [
      { label: '🔑 Start Engine (I)', action: 'flight.startEngine' },
      { label: '⚡ Max Throttle (Z)', action: 'flight.throttle', payload: 1.0 },
      { label: '🛑 Idle Throttle (X)', action: 'flight.throttle', payload: 0.0 },
      { label: '🛑 Wheel Brakes (B)', action: 'flight.brakes', payload: true },
      { label: '🎥 View (C)', action: 'flight.toggleCamera' },
      { label: '🔄 Reset to Runway (R)', action: 'flight.reset' },
    ],
  },
  quickstart: {
    id: 'quickstart',
    title: 'Golden Quickstart',
    subtitle: 'Dynamic Physics Obstacle Playground',
    genre: 'PHYSICS SANDBOX LAB',
    badge: '🪙 DYNAMIC PHYSICS',
    accentColor: '#f59e0b',
    themeColorHex: 0x78350f,
    description: 'An interactive dynamic physics arena! Push stacks of wooden crates, scatter bouncy bowling spheres, leap from super jump trampolines, ride elevating platforms, and trigger radial explosion blasts.',
    features: [
      '📦 Interactive Dynamic Rigid Body Crates & Bouncy Spheres',
      '🚀 Super Jump Trampolines & Kinematic Moving Elevators',
      '💥 Radial Physics Explosions with Area Impulses',
      '🪙 8 Collectible Golden Coins with Sparkling Particle VFX',
    ],
    controls: [
      { key: 'WASD / Arrows', desc: 'Move Hero Character' },
      { key: 'Space', desc: 'Jump' },
      { key: 'Shift', desc: 'Sprint' },
      { key: 'E', desc: 'Trigger Radial Explosion Blast' },
      { key: 'B', desc: 'Spawn 5 Wooden Crates' },
      { key: 'N', desc: 'Spawn 5 Bouncy Spheres' },
    ],
    quickActions: [
      { label: '💥 Radial Blast (E)', action: 'physics.explode' },
      { label: '📦 Spawn Crates (B)', action: 'physics.spawnBoxes' },
      { label: '🎲 Spawn Spheres (N)', action: 'physics.spawnSpheres' },
      { label: '🪙 Respawn Coins', action: 'physics.respawnCoins' },
    ],
  },
};

const GAME_ORDER: GameMode[] = ['psx', 'flight', 'quickstart'];

class PlaygroundApp {
  private activeMode: GameMode = 'home';
  private selectedAlbumIndex = 0;
  private currentGame: PsxGame | FlightGame | QuickstartGame | ModelStudioScene | null = null;
  private homeScene: HomeScene | null = null;
  private canvas: HTMLCanvasElement;
  private isInspectorOpen = false;
  private activeInspectorTab: 'telemetry' | 'models' | 'entities' | 'actions' | 'state' = 'telemetry';
  private actionHistory: Array<{ text: string; time: string; success: boolean }> = [];
  private lastFpsTime = performance.now();
  private frameCount = 0;
  private currentFps = 60;
  private paused = false;
  private focusedLoopPhase: string | null = null;

  // DOM Elements
  private consoleHome!: HTMLElement;
  private hudContainer!: HTMLElement;
  private albumCards!: NodeListOf<HTMLElement>;
  private albumDots!: NodeListOf<HTMLElement>;
  private spotlightBadge!: HTMLElement;
  private spotlightGenre!: HTMLElement;
  private spotlightTitle!: HTMLElement;
  private spotlightSubtitle!: HTMLElement;
  private spotlightDesc!: HTMLElement;
  private spotlightFeatures!: HTMLElement;
  private spotlightControlsGrid!: HTMLElement;
  private btnLaunchGame!: HTMLElement;
  private systemClock!: HTMLElement;
  private btnAudioToggle!: HTMLElement;

  // Inspector Elements
  private actionInput!: HTMLInputElement;
  private entitySearchInput!: HTMLInputElement;
  private entitiesTreeContainer!: HTMLElement;
  private entityCountBadge!: HTMLElement;
  private stateJsonView!: HTMLElement;
  private actionHistoryList!: HTMLElement;

  // In-Game Overlays
  private inspectModal!: HTMLElement;
  private inspectBodyText!: HTMLElement;
  private loopOverlay!: HTMLElement;
  private loopKicker!: HTMLElement;
  private loopTitle!: HTMLElement;
  private loopBody!: HTMLElement;
  private loopAction!: HTMLButtonElement;

  constructor() {
    this.canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    this.initDOM();
    this.initClock();
    this.initKeyboardNavigation();
    this.switchGame('home');
    this.startHUDUpdateLoop();
  }

  private initDOM(): void {
    this.consoleHome = document.getElementById('console-home')!;
    this.hudContainer = document.getElementById('game-hud')!;
    this.albumCards = document.querySelectorAll('.album-card');
    this.albumDots = document.querySelectorAll('.album-dot');
    this.spotlightBadge = document.getElementById('spotlight-badge')!;
    this.spotlightGenre = document.getElementById('spotlight-genre')!;
    this.spotlightTitle = document.getElementById('spotlight-title')!;
    this.spotlightSubtitle = document.getElementById('spotlight-subtitle')!;
    this.spotlightDesc = document.getElementById('spotlight-desc')!;
    this.spotlightFeatures = document.getElementById('spotlight-features')!;
    this.spotlightControlsGrid = document.getElementById('spotlight-controls-grid')!;
    this.btnLaunchGame = document.getElementById('btn-launch-game')!;
    this.systemClock = document.getElementById('system-clock')!;
    this.btnAudioToggle = document.getElementById('btn-audio-toggle')!;
    this.actionInput = document.getElementById('action-input') as HTMLInputElement;
    this.entitySearchInput = document.getElementById('entity-search-input') as HTMLInputElement;
    this.entitiesTreeContainer = document.getElementById('entities-tree-container')!;
    this.entityCountBadge = document.getElementById('entity-count-badge')!;
    this.stateJsonView = document.getElementById('state-json-view')!;
    this.actionHistoryList = document.getElementById('action-history-list')!;
    this.inspectModal = document.getElementById('inspect-modal')!;
    this.inspectBodyText = document.getElementById('inspect-body-text')!;
    this.loopOverlay = document.getElementById('loop-overlay')!;
    this.loopKicker = document.getElementById('loop-kicker')!;
    this.loopTitle = document.getElementById('loop-title')!;
    this.loopBody = document.getElementById('loop-body')!;
    this.loopAction = document.getElementById('loop-action') as HTMLButtonElement;

    // Inspector Floating Dock Pill & Close Button
    document.getElementById('inspector-dock-pill')?.addEventListener('click', () => {
      this.toggleInspector(true);
    });

    document.getElementById('btn-close-inspector')?.addEventListener('click', () => {
      this.toggleInspector(false);
    });

    // Inspector Tab Switching
    document.querySelectorAll('.insp-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab as any;
        if (tab) this.switchInspectorTab(tab);
      });
    });

    // Tab 1 Actions: Copy MCP Observation, Step Ticks
    document.getElementById('btn-copy-mcp')?.addEventListener('click', (e) => {
      const text = document.getElementById('inspector-content')?.textContent || '';
      this.copyToClipboard(text, e.currentTarget as HTMLElement);
    });

    document.getElementById('btn-step-tick-1')?.addEventListener('click', () => {
      if (this.currentGame) {
        this.currentGame.engine.step(1);
        sfx.playMenuMove();
      }
    });

    document.getElementById('btn-step-tick-10')?.addEventListener('click', () => {
      if (this.currentGame) {
        this.currentGame.engine.step(10);
        sfx.playMenuMove();
      }
    });

    // Tab 2: Entity Search Filter
    this.entitySearchInput?.addEventListener('input', () => {
      this.renderEntityTree();
    });

    // Tab 4 Actions: Copy State JSON, Download Snapshot, Copy Share Link
    document.getElementById('btn-copy-state-json')?.addEventListener('click', (e) => {
      const stateObj = this.getEngineStateSnapshot();
      this.copyToClipboard(JSON.stringify(stateObj, null, 2), e.currentTarget as HTMLElement);
    });

    document.getElementById('btn-download-state')?.addEventListener('click', () => {
      this.downloadStateSnapshot();
    });

    document.getElementById('btn-copy-share-url')?.addEventListener('click', (e) => {
      const url = window.location.href;
      this.copyToClipboard(url, e.currentTarget as HTMLElement);
    });

    // Action Dispatch
    document.getElementById('btn-dispatch-action')?.addEventListener('click', () => {
      this.dispatchCustomAction();
    });

    this.actionInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.dispatchCustomAction();
      }
    });

    // Album card clicks
    this.albumCards.forEach((card, index) => {
      card.addEventListener('click', () => this.selectAlbumCard(index));
    });

    // Album dots
    this.albumDots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        this.selectAlbumCard(index);
      });
    });

    // Launch Game CTA
    this.btnLaunchGame?.addEventListener('click', () => {
      this.launchSelectedGame();
    });

    // Close Note Modal
    const handleCloseInspect = () => {
      if (this.activeMode === 'psx' && this.currentGame) {
        (this.currentGame as PsxGame).dismissInspect();
      }
    };
    document.getElementById('btn-close-inspect')?.addEventListener('click', handleCloseInspect);
    document.getElementById('btn-close-note')?.addEventListener('click', handleCloseInspect);

    document.getElementById('pause-resume')?.addEventListener('click', () => this.setPaused(false));
    document.getElementById('pause-restart')?.addEventListener('click', () => {
      void this.restartCurrentGame();
    });
    document.getElementById('pause-home')?.addEventListener('click', () => {
      this.setPaused(false);
      this.switchGame('home');
    });
    document.getElementById('loop-home')?.addEventListener('click', () => {
      this.switchGame('home');
    });
    document.getElementById('btn-nav-studio')?.addEventListener('click', () => {
      this.launchSelectedGame('studio');
    });
    document.querySelectorAll('.shelf-item').forEach((el) => {
      el.addEventListener('click', () => {
        const mode = (el as HTMLElement).dataset.mode as GameMode | undefined;
        if (mode === 'studio') {
          this.launchSelectedGame('studio');
          return;
        }
        const index = Number((el as HTMLElement).dataset.index);
        if (Number.isFinite(index)) this.selectAlbumCard(index);
      });
    });
    this.albumCards.forEach((card, i) => {
      const art = card.querySelector('.card-artwork');
      const shelfArt = document.querySelectorAll('.shelf-art')[i];
      if (art && shelfArt) {
        shelfArt.innerHTML = '';
        shelfArt.appendChild(art.cloneNode(true));
      }
    });

    this.selectAlbumCard(0);
    this.updateSpotlightContent();
  }

  private toggleInspector(open?: boolean): void {
    this.isInspectorOpen = open !== undefined ? open : !this.isInspectorOpen;
    sfx.playMenuSelect();
    const drawer = document.getElementById('inspector-drawer');
    const dockPill = document.getElementById('inspector-dock-pill');
    if (this.isInspectorOpen) {
      if (drawer) drawer.style.display = 'flex';
      if (dockPill) dockPill.style.display = 'none';
      this.switchInspectorTab(this.activeInspectorTab);
    } else {
      if (drawer) drawer.style.display = 'none';
      if (dockPill) dockPill.style.display = 'flex';
    }
  }

  private switchInspectorTab(tabId: 'telemetry' | 'models' | 'entities' | 'actions' | 'state'): void {
    this.activeInspectorTab = tabId;

    document.querySelectorAll('.insp-tab').forEach((btn) => {
      const el = btn as HTMLElement;
      el.classList.toggle('active', el.dataset.tab === tabId);
    });

    document.querySelectorAll('.insp-tab-content').forEach((panel) => {
      const el = panel as HTMLElement;
      el.classList.toggle('active', el.id === `tab-${tabId}`);
    });

    if (tabId === 'models') {
      this.renderModelsList();
    } else if (tabId === 'entities') {
      this.renderEntityTree();
    } else if (tabId === 'state') {
      const snapshot = this.getEngineStateSnapshot();
      if (this.stateJsonView) {
        this.stateJsonView.textContent = JSON.stringify(snapshot, null, 2);
      }
    }
  }

  private renderModelsList(): void {
    const container = document.getElementById('models-preview-list');
    if (!container) return;

    const reconstructedModels = [
      {
        id: 'ancestor_portrait',
        factory: 'createAncestorPortraitGroup',
        file: 'models/AncestorPortrait.ts',
        desc: 'Ornate walnut & gold frame with sepia ancestor portrait canvas (variant 0/1/2)',
        tags: ['decor', 'portrait', 'prompt-to-scene'],
        collider: 'none',
      },
      {
        id: 'manor_door',
        factory: 'createManorDoorModel',
        file: 'models/ManorDoor.ts',
        desc: 'Victorian 4-panel wooden door with frame, brass knobs & animated side-hinge',
        tags: ['interactive', 'door', 'prompt-to-scene'],
        collider: 'box [2.0, 3.5, 0.35]',
      },
      {
        id: 'grandfather_clock',
        factory: 'buildGrandfatherClockModel',
        file: 'models/GrandfatherClock.ts',
        desc: 'Mahogany clock case, pendulum housing, puzzle hands (3:00 -> 11:45), and secret bookcase door',
        tags: ['interactive', 'clock', 'puzzle'],
        collider: 'box [1.3, 3.8, 0.9]',
      },
      {
        id: 'study_desk_journal',
        factory: 'buildQuestItems -> studyDesk',
        file: 'models/Items.ts',
        desc: 'Antique pedestal desk with brass drawer pulls, open leather journal & candle',
        tags: ['furniture', 'desk', 'clue'],
        collider: 'box [2.4, 0.9, 1.3]',
      },
      {
        id: 'winding_key',
        factory: 'buildQuestItems -> prop_key',
        file: 'models/Items.ts',
        desc: 'Ornate brass clock winding key with spinning idle animation & stone pedestal',
        tags: ['pickup', 'key', 'item'],
        collider: 'pedestal: box [0.9, 1.0, 0.9]',
      },
      {
        id: 'blackwood_crest',
        factory: 'buildQuestItems -> prop_crest',
        file: 'models/Items.ts',
        desc: 'Gold heraldic shield with ruby octahedron gem on gothic stone altar',
        tags: ['pickup', 'crest', 'item'],
        collider: 'altar: box [1.2, 1.0, 1.2]',
      },
      {
        id: 'escape_gate',
        factory: 'buildQuestItems -> prop_escape_gate',
        file: 'models/Items.ts',
        desc: 'Wrought iron portcullis with vertical spear bars & stone pillars',
        tags: ['interactive', 'gate', 'exit'],
        collider: 'box [3.2, 3.8, 0.2]',
      },
      {
        id: 'cobweb',
        factory: 'createCobwebGroup',
        file: 'models/Cobweb.ts',
        desc: 'Translucent corner spiderweb geometry for ceiling corners and doorway trim',
        tags: ['decor', 'atmosphere'],
        collider: 'none',
      },
    ];

    container.innerHTML = reconstructedModels
      .map(
        (m) => `
        <div class="entity-row">
          <div class="entity-row-header">
            <span class="entity-id">${m.id}</span>
            <div class="entity-tags-group">
              ${m.tags.map((t) => `<span class="entity-tag-pill">${t}</span>`).join('')}
            </div>
          </div>
          <div style="font-size:0.75rem; color:#f8fafc; margin-top:2px;">${m.desc}</div>
          <div class="entity-coords" style="margin-top:2px;">
            📁 <code>${m.file}</code> &bull; ⚙️ Collider: <strong>${m.collider}</strong>
          </div>
        </div>
      `
      )
      .join('');
  }

  private copyToClipboard(text: string, btn?: HTMLElement): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    sfx.playRingChime();
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      btn.style.color = '#34d399';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = '';
      }, 1400);
    }
  }

  private getEngineStateSnapshot(): Record<string, any> {
    if (!this.currentGame) {
      return {
        view: 'Home Dashboard',
        selectedCard: GAMES_METADATA[GAME_ORDER[this.selectedAlbumIndex]]?.title,
        tick: 0,
        stateHash: 'CONSOLE_OS_00',
        timestamp: new Date().toISOString(),
      };
    }
    const engine = this.currentGame.engine;
    return {
      mode: this.activeMode,
      tick: engine.tick,
      stateHash: engine.getStateHash(),
      diagnosticsCount: engine.diagnostics.getRecords().length,
      entitiesCount: engine.entities.list().length,
      storeState: (engine as { store?: { getState: () => unknown } }).store?.getState?.() ?? null,
      storeHistory: (engine as { store?: { getHistory: () => unknown[] } }).store?.getHistory?.()?.slice(-10) ?? [],
      timestamp: new Date().toISOString(),
    };
  }

  private downloadStateSnapshot(): void {
    const snapshot = this.getEngineStateSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `renderoni-snapshot-${this.activeMode}-tick${snapshot.tick || 0}.json`;
    a.click();
    URL.revokeObjectURL(url);
    sfx.playRingChime();
  }

  private renderEntityTree(): void {
    if (!this.entitiesTreeContainer) return;
    const filter = (this.entitySearchInput?.value || '').toLowerCase().trim();

    if (!this.currentGame) {
      this.entitiesTreeContainer.innerHTML = `
        <div class="entity-row">
          <div class="entity-row-header">
            <span class="entity-id">home.scene</span>
            <div class="entity-tags-group"><span class="entity-tag-pill">dashboard</span></div>
          </div>
          <div class="entity-coords">Interactive Polyhedral Torus Mesh • Ambient Studio Lighting</div>
        </div>
      `;
      if (this.entityCountBadge) this.entityCountBadge.textContent = '1 Entity';
      return;
    }

    const entities = this.currentGame.engine.entities.list();
    const filtered = entities.filter((e) => {
      if (!filter) return true;
      if (e.id.toLowerCase().includes(filter)) return true;
      if (Array.from(e.tags).some((t: string) => t.toLowerCase().includes(filter))) return true;
      return false;
    });

    if (this.entityCountBadge) {
      this.entityCountBadge.textContent = `${filtered.length} / ${entities.length} Entities`;
    }

    if (filtered.length === 0) {
      this.entitiesTreeContainer.innerHTML = `<div class="log-entry empty">No entities match query "${filter}"</div>`;
      return;
    }

    this.entitiesTreeContainer.innerHTML = filtered
      .map((e) => {
        const tagPills = Array.from(e.tags).map((t: string) => `<span class="entity-tag-pill">${t}</span>`).join('');
        const statePreview = e.state ? JSON.stringify(e.state) : 'none';
        return `
          <div class="entity-row">
            <div class="entity-row-header">
              <span class="entity-id">${e.id}</span>
              <div class="entity-tags-group">${tagPills}</div>
            </div>
            <div class="entity-coords">State: ${statePreview}</div>
          </div>
        `;
      })
      .join('');
  }

  private initClock(): void {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      if (this.systemClock) this.systemClock.textContent = `${h}:${m}`;
    };
    updateTime();
    setInterval(updateTime, 10000);
  }

  private initKeyboardNavigation(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.code === 'F12') {
        e.preventDefault();
        this.toggleInspector();
        return;
      }

      if (this.handleOverlayKeyboard(e)) return;

      if (document.activeElement === this.actionInput || document.activeElement === this.entitySearchInput) return;

      if (this.activeMode === 'home') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          sfx.playMenuMove();
          this.selectAlbumCard(Math.max(0, this.selectedAlbumIndex - 1));
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          sfx.playMenuMove();
          this.selectAlbumCard(Math.min(GAME_ORDER.length - 1, this.selectedAlbumIndex + 1));
        } else if (e.code === 'Enter' || e.code === 'Space') {
          this.launchSelectedGame();
        }
      }

      if (e.code === 'Escape') {
        if (this.isInspectorOpen) {
          this.toggleInspector(false);
          return;
        }
        if (this.activeMode !== 'home') {
          e.preventDefault();
          this.setPaused(!this.paused);
        }
      }

      if (e.code === 'KeyM') {
        const muted = sfx.toggleMute();
        if (this.btnAudioToggle) {
          this.btnAudioToggle.textContent = muted ? '🔇' : '🔊';
        }
      }
    });
  }

  private handleOverlayKeyboard(e: KeyboardEvent): boolean {
    const pauseMenu = document.getElementById('pause-menu');
    const activeMenu = pauseMenu && !pauseMenu.hidden
      ? pauseMenu
      : !this.loopOverlay.hidden
        ? this.loopOverlay
        : null;
    if (!activeMenu) return false;

    const buttons = Array.from(
      activeMenu.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    );
    if (buttons.length === 0) return false;

    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (activeMenu === pauseMenu) {
        this.setPaused(false);
      } else {
        buttons.at(-1)?.focus({ preventScroll: true });
        sfx.playMenuMove();
      }
      return true;
    }

    const previousKeys = new Set(['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA']);
    const nextKeys = new Set(['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD']);
    if (previousKeys.has(e.code) || nextKeys.has(e.code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const direction = previousKeys.has(e.code) ? -1 : 1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + buttons.length) % buttons.length;
      buttons[nextIndex]?.focus({ preventScroll: true });
      sfx.playMenuMove();
      return true;
    }

    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const activeButton = buttons.includes(document.activeElement as HTMLButtonElement)
        ? document.activeElement as HTMLButtonElement
        : buttons[0];
      activeButton?.click();
      return true;
    }

    return false;
  }

  private selectAlbumCard(index: number): void {
    this.selectedAlbumIndex = index;
    sfx.playMenuMove();

    this.albumCards.forEach((card, i) => {
      card.style.transform = '';
      card.classList.toggle('active', i === index);
    });

    // Update dots
    this.albumDots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
    document.querySelectorAll('.shelf-item').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });

    this.updateSpotlightContent();

    // Update Home Scene dynamic lighting
    const gameKey = GAME_ORDER[index];
    const meta = GAMES_METADATA[gameKey];
    if (meta && this.homeScene) {
      this.homeScene.setAccentColor(meta.themeColorHex);
    }
  }

  private updateSpotlightContent(): void {
    const gameKey = GAME_ORDER[this.selectedAlbumIndex];
    const meta = GAMES_METADATA[gameKey];
    if (!meta || !this.spotlightBadge) return;

    this.spotlightBadge.textContent = meta.badge;
    this.spotlightGenre.textContent = meta.genre;
    this.spotlightTitle.textContent = meta.title;
    this.spotlightSubtitle.textContent = meta.subtitle;
    this.spotlightDesc.textContent = meta.description;

    // Features
    this.spotlightFeatures.innerHTML = meta.features
      .map((f) => `<div class="feature-chip">${f}</div>`)
      .join('');

    // Controls
    this.spotlightControlsGrid.innerHTML = meta.controls
      .map((c) => `<div class="control-item"><span class="keycap">${c.key}</span><span class="key-desc">${c.desc}</span></div>`)
      .join('');

    // Quick Action Bar
    this.renderQuickActions(meta.quickActions);
  }

  private logActionDispatch(actionName: string, success: boolean): void {
    const time = new Date().toTimeString().split(' ')[0];
    this.actionHistory.unshift({ text: actionName, time, success });
    if (this.actionHistory.length > 20) this.actionHistory.pop();

    if (this.actionHistoryList) {
      this.actionHistoryList.innerHTML = this.actionHistory
        .map(
          (a) => `
          <div class="log-entry ${a.success ? 'success' : 'error'}">
            <span style="color:#64748b;">[${a.time}]</span> ⚡ <strong>${a.text}</strong> &bull; ${a.success ? 'Executed' : 'Error'}
          </div>
        `
        )
        .join('');
    }
  }

  private renderQuickActions(actions: Array<{ label: string; action: string; payload?: any }>): void {
    const container = document.getElementById('inspector-quick-actions');
    if (!container) return;

    container.innerHTML = '';
    actions.forEach((qa) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.textContent = qa.label;
      btn.addEventListener('click', () => {
        if (this.currentGame) {
          try {
            if (qa.payload !== undefined) {
              this.currentGame.engine.act({ name: qa.action, payload: qa.payload });
            } else {
              this.currentGame.engine.act({ name: qa.action });
            }
            this.logActionDispatch(qa.action, true);
            sfx.playMenuMove();
          } catch (_) {
            this.logActionDispatch(qa.action, false);
          }
        }
      });
      container.appendChild(btn);
    });
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    (window as unknown as { __renderoniPaused?: boolean }).__renderoniPaused = paused;
    const menu = document.getElementById('pause-menu');
    if (menu) menu.hidden = !paused;
    document.body.classList.toggle('paused', paused);
    const meta = GAMES_METADATA[this.activeMode];
    const title = document.getElementById('pause-title');
    const kicker = document.getElementById('pause-kicker');
    if (title) title.textContent = meta?.title ?? 'Paused';
    if (kicker) kicker.textContent = meta?.genre ?? 'Paused';
    if (paused) {
      document.exitPointerLock?.();
      sfx.playMenuSelect();
      document.getElementById('pause-resume')?.focus({ preventScroll: true });
    } else {
      this.canvas.focus({ preventScroll: true });
    }
  }

  private launchSelectedGame(targetMode?: GameMode): void {
    const mode = targetMode || GAME_ORDER[this.selectedAlbumIndex];
    sfx.playGameLaunch();
    this.switchGame(mode);
  }

  private async restartCurrentGame(): Promise<void> {
    if (this.activeMode === 'home') return;
    sfx.playGameLaunch();
    await this.switchGame(this.activeMode, true);
  }

  async switchGame(mode: GameMode, force = false): Promise<void> {
    if (!force && this.activeMode === mode && this.currentGame) return;

    // 1. Dispose active game or home scene
    if (this.currentGame) {
      this.currentGame.dispose();
      this.currentGame = null;
    }
    if (this.homeScene) {
      this.homeScene.dispose();
      this.homeScene = null;
    }
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;

    this.activeMode = mode;
    this.focusedLoopPhase = null;

    // 2. Update navigation tab active state
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const tab = btn as HTMLElement;
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // 3. Mount view
    this.setPaused(false);
    document.body.classList.toggle('in-game', mode !== 'home');

    if (mode === 'home') {
      this.consoleHome.style.display = 'flex';
      this.hudContainer.style.display = 'none';
      this.selectAlbumCard(this.selectedAlbumIndex);
    } else {
      this.consoleHome.style.display = 'none';
      this.hudContainer.style.display = 'block';

      if (mode === 'studio') {
        this.currentGame = new ModelStudioScene(this.canvas);
        await (this.currentGame as ModelStudioScene).init();
      } else if (mode === 'psx') {
        this.currentGame = new PsxGame(this.canvas);
        await (this.currentGame as PsxGame).init();
        this.mountPsxHUD();
      } else if (mode === 'flight') {
        this.currentGame = new FlightGame(this.canvas);
        await (this.currentGame as FlightGame).init();
        this.mountFlightHUD();
      } else if (mode === 'quickstart') {
        this.currentGame = new QuickstartGame(this.canvas);
        await (this.currentGame as QuickstartGame).init();
        this.mountQuickstartHUD();
      }

      const meta = GAMES_METADATA[mode];
      if (meta) this.renderQuickActions(meta.quickActions);
    }
  }

  private mountPsxHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="game-hud-layout">
        <div class="hud-top-bar">
          <div class="hud-objective-pill">
            <span class="hud-obj-icon">📜</span>
            <span id="psx-quest" class="hud-obj-text">Walk the hall. First room on left: Read Journal</span>
          </div>
          <div class="hud-inventory-bar">
            <div class="inv-slot active" id="chip-flash" style="cursor: pointer;" title="Toggle Flashlight (F)"><span class="inv-icon">🔦</span> <span id="psx-flash" class="inv-badge active">ON</span></div>
            <div class="inv-slot" id="chip-key"><span class="inv-icon">🗝️</span> <span id="psx-key" class="inv-badge">—</span></div>
            <div class="inv-slot" id="chip-crest"><span class="inv-icon">🛡️</span> <span id="psx-crest" class="inv-badge">—</span></div>
            <div class="inv-slot" id="chip-gate"><span class="inv-icon">🚪</span> <span id="psx-gate" class="inv-badge locked">SEALED</span></div>
            <button class="btn-pause-chip" id="btn-pause-psx" title="Pause Menu (ESC)">⚙️ ESC</button>
          </div>
        </div>
        <div class="hud-reticle-dot"></div>
        <div id="psx-controls-banner" class="hud-controls-banner">
          <span><kbd>WASD</kbd> Walk</span>
          <span><kbd>Mouse</kbd> Look</span>
          <span><kbd>Shift</kbd> Run</span>
          <span><kbd>F</kbd> Flashlight</span>
          <span><kbd>E</kbd> Interact</span>
          <span><kbd>ESC</kbd> Menu</span>
        </div>
      </div>
    `;

    document.getElementById('chip-flash')?.addEventListener('click', () => {
      (this.currentGame as PsxGame)?.toggleFlashlight();
    });

    document.getElementById('btn-pause-psx')?.addEventListener('click', () => {
      this.setPaused(true);
    });
  }

  private mountFlightHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="game-hud-layout">
        <div class="hud-top-bar">
          <div class="hud-objective-pill">
            <span class="hud-obj-icon">✈️</span>
            <span id="flight-quest" class="hud-obj-text">Press [I] to Start Engine, then hold [Shift] for Takeoff power</span>
          </div>
          <div class="hud-inventory-bar">
            <div class="flight-inst"><span class="inst-lbl">SPD</span> <span id="flight-speed" class="inst-val">0 km/h</span></div>
            <div class="flight-inst"><span class="inst-lbl">ALT</span> <span id="flight-alt" class="inst-val">0 m</span></div>
            <div class="flight-inst"><span class="inst-lbl">VS</span> <span id="flight-vs" class="inst-val">0.0 m/s</span></div>
            <div class="flight-inst"><span class="inst-lbl">THR</span> <span id="flight-throttle-val" class="inst-val">0%</span></div>
            <div class="flight-inst"><span class="inst-lbl">PHASE</span> <span id="flight-state" class="inst-val tag tag-green">PARKED</span></div>
            <div class="flight-inst"><span class="inst-lbl">RINGS</span> <span id="flight-rings" class="inst-val tag tag-blue">0 / 6</span></div>
            <button class="btn-pause-chip" id="btn-pause-flight" title="Pause Menu (ESC)">⚙️ ESC</button>
          </div>
        </div>
        <div class="hud-reticle-dot"></div>
        <div id="flight-controls-banner" class="hud-controls-banner">
          <span><kbd>I</kbd> Start Engine</span>
          <span><kbd>Shift/Ctrl</kbd> Throttle</span>
          <span><kbd>W/S</kbd> Pitch</span>
          <span><kbd>A/D</kbd> Bank/Steer</span>
          <span><kbd>B</kbd> Brakes</span>
          <span><kbd>C</kbd> View</span>
          <span><kbd>ESC</kbd> Menu</span>
        </div>
        <div class="flight-bottom-slider-bar">
          <label for="flight-throttle">THR:</label>
          <input id="flight-throttle" type="range" min="0" max="100" value="0" class="flight-slider" />
        </div>
      </div>
    `;

    document.getElementById('btn-pause-flight')?.addEventListener('click', () => {
      this.setPaused(true);
    });

    const throttleInput = document.getElementById('flight-throttle') as HTMLInputElement;
    throttleInput?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value) / 100;
      (this.currentGame as FlightGame)?.setThrottle(val);
      const label = document.getElementById('flight-throttle-val');
      if (label) label.textContent = `${Math.round(val * 100)}%`;
      (document.activeElement as HTMLElement)?.blur();
    });
  }

  private mountQuickstartHUD(): void {
    this.hudContainer.innerHTML = `
      <div class="game-hud-layout">
        <div class="hud-top-bar">
          <div class="hud-objective-pill">
            <span class="hud-obj-icon">🪙</span>
            <span id="qs-quest" class="hud-obj-text">Physics sandbox: push crates, bounce on trampolines, collect coins!</span>
          </div>
          <div class="hud-inventory-bar">
            <div class="qs-stat"><span class="stat-lbl">COINS</span> <span id="qs-coins" class="stat-val tag-green">0 / 8</span></div>
            <div class="qs-stat"><span class="stat-lbl">BODIES</span> <span id="qs-bodies" class="stat-val">0</span></div>
            <button class="btn-pause-chip" id="btn-pause-qs" title="Pause Menu (ESC)">⚙️ ESC</button>
          </div>
        </div>
        <div class="hud-reticle-dot"></div>
        <div id="qs-controls-banner" class="hud-controls-banner">
          <span><kbd>WASD</kbd> Move</span>
          <span><kbd>Space</kbd> Jump</span>
          <span><kbd>Shift</kbd> Sprint</span>
          <span><kbd>E</kbd> Blast</span>
          <span><kbd>B</kbd> Boxes</span>
          <span><kbd>N</kbd> Spheres</span>
          <span><kbd>ESC</kbd> Pause</span>
        </div>
      </div>
    `;

    document.getElementById('btn-pause-qs')?.addEventListener('click', () => {
      this.setPaused(true);
    });
  }

  private dispatchCustomAction(): void {
    const raw = this.actionInput.value.trim();
    if (!raw) return;

    if (this.activeMode === 'home') {
      if (raw.startsWith('launch.')) {
        const target = raw.replace('launch.', '') as GameMode;
        if (GAME_ORDER.includes(target)) {
          this.launchSelectedGame(target);
          this.logActionDispatch(`launch.${target}`, true);
          this.actionInput.value = '';
          return;
        }
      }
    }

    if (!this.currentGame) return;

    try {
      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        this.currentGame.engine.act(parsed);
        this.logActionDispatch(parsed.name || raw, true);
      } else {
        this.currentGame.engine.act({ name: raw });
        this.logActionDispatch(raw, true);
      }
      sfx.playMenuMove();
      this.actionInput.value = '';
    } catch (_) {
      try {
        this.currentGame.engine.act({ name: raw });
        this.logActionDispatch(raw, true);
        sfx.playMenuMove();
      } catch (err) {
        this.logActionDispatch(raw, false);
      }
      this.actionInput.value = '';
    }
    this.actionInput.blur();
  }

  private startHUDUpdateLoop(): void {
    const updateHUD = () => {
      try {
        // 1. Calculate FPS
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 500) {
          this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
          this.frameCount = 0;
          this.lastFpsTime = now;
          const fpsBadge = document.getElementById('inspector-fps');
          const dockFps = document.getElementById('dock-pill-fps');
          if (fpsBadge) fpsBadge.textContent = `${this.currentFps} FPS`;
          if (dockFps) dockFps.textContent = `${this.currentFps} FPS`;
        }

        // 2. Update Dock Pill Stats
        const currentTick = this.currentGame ? this.currentGame.engine.tick : 0;
        let currentHash = 'CONSOLE_OS';
        if (this.currentGame) {
          try {
            currentHash = this.currentGame.engine.getStateHash();
          } catch (_) {}
        }
        const dockTick = document.getElementById('dock-pill-tick');
        const dockHash = document.getElementById('dock-pill-hash');
        if (dockTick) dockTick.textContent = `Tick: ${currentTick}`;
        if (dockHash) dockHash.textContent = currentHash.startsWith('0x') ? currentHash.slice(0, 8) : `#${currentHash.slice(0, 6)}`;

        if (this.activeMode === 'home') {
          if (this.isInspectorOpen) {
            const activeGameMeta = GAMES_METADATA[GAME_ORDER[this.selectedAlbumIndex]];
            const inspContent = document.getElementById('inspector-content');
            if (inspContent && this.activeInspectorTab === 'telemetry') {
              inspContent.textContent = `# Renderoni Console OS [v0.1.0]
# Active View: Home Dashboard
# Selected Album Card: ${activeGameMeta?.title ?? 'None'} (${activeGameMeta?.genre ?? ''})
# Engine Subsystems: Deterministic L0 Kernel, Rapier WASM 3D, Three.js WebGL
# State: Standby • 60 FPS Fixed Timestep • Press Enter or Click to Launch`;
            }
            const inspHash = document.getElementById('inspector-hash');
            const inspTick = document.getElementById('inspector-tick');
            const inspBytes = document.getElementById('inspector-bytes');
            if (inspHash) inspHash.textContent = 'CONSOLE_OS';
            if (inspTick) inspTick.textContent = `Tick: 0`;
            if (inspBytes) inspBytes.textContent = `128B / 500B`;
          }
        } else if (this.currentGame) {
          if (this.activeMode === 'psx') {
            const t = (this.currentGame as PsxGame).getTelemetry();
            const questEl = document.getElementById('psx-quest');
            const flashEl = document.getElementById('psx-flash');
            const chipFlash = document.getElementById('chip-flash');
            const keyEl = document.getElementById('psx-key');
            const chipKey = document.getElementById('chip-key');
            const crestEl = document.getElementById('psx-crest');
            const chipCrest = document.getElementById('chip-crest');
            const gateEl = document.getElementById('psx-gate');
            const chipGate = document.getElementById('chip-gate');

            if (questEl) questEl.textContent = t.questStatus;
            if (flashEl) {
              flashEl.textContent = t.flashlightOn ? 'ON' : 'OFF';
              flashEl.className = `inv-badge ${t.flashlightOn ? 'active' : ''}`;
              chipFlash?.classList.toggle('active', t.flashlightOn);
            }
            if (keyEl) {
              keyEl.textContent = t.hasKey ? 'KEY' : '—';
              keyEl.className = `inv-badge ${t.hasKey ? 'active' : ''}`;
              chipKey?.classList.toggle('active', t.hasKey);
            }
            if (crestEl) {
              crestEl.textContent = t.hasCrest ? 'CREST' : '—';
              crestEl.className = `inv-badge ${t.hasCrest ? 'active' : ''}`;
              chipCrest?.classList.toggle('active', t.hasCrest);
            }
            if (gateEl) {
              gateEl.textContent = t.gateUnlocked ? 'OPEN' : 'LOCKED';
              gateEl.className = `inv-badge ${t.gateUnlocked ? 'active' : 'locked'}`;
              chipGate?.classList.toggle('active', t.gateUnlocked);
              chipGate?.classList.toggle('locked', !t.gateUnlocked);
            }

            const prompt = (this.currentGame as PsxGame).getHoverPrompt();
            const promptEl = document.getElementById('interaction-prompt');
            const promptTextEl = document.getElementById('prompt-text');
            if (promptEl && promptTextEl) {
              if (this.currentGame.engine.loop.playing && prompt && !t.inspectingText) {
                promptEl.classList.add('visible');
                promptEl.style.display = 'flex';
                promptTextEl.textContent = prompt;
              } else {
                promptEl.classList.remove('visible');
                promptEl.style.display = 'none';
              }
            }

            if (this.inspectModal && this.inspectBodyText) {
              if (t.inspectingText) {
                this.inspectModal.style.display = 'flex';
                this.inspectBodyText.textContent = t.inspectingText;
              } else {
                this.inspectModal.style.display = 'none';
              }
            }
          } else if (this.activeMode === 'flight') {
            const t = (this.currentGame as FlightGame).getTelemetry();
            const spdEl = document.getElementById('flight-speed');
            const altEl = document.getElementById('flight-alt');
            const vsEl = document.getElementById('flight-vs');
            const stateEl = document.getElementById('flight-state');
            const ringsEl = document.getElementById('flight-rings');
            const questEl = document.getElementById('flight-quest');
            const throttleSlider = document.getElementById('flight-throttle') as HTMLInputElement;
            const throttleVal = document.getElementById('flight-throttle-val');

            if (spdEl) spdEl.textContent = `${t.speedKmh} km/h`;
            if (altEl) altEl.textContent = `${t.altitudeM} m`;
            if (vsEl) vsEl.textContent = `${t.verticalSpeedMs >= 0 ? '+' : ''}${t.verticalSpeedMs} m/s`;
            if (questEl) questEl.textContent = t.objective;
            if (ringsEl) ringsEl.textContent = `${t.ringsCleared} / ${t.totalRings}`;
            if (stateEl) {
              stateEl.textContent = t.phaseLabel;
              stateEl.className = `val tag ${t.flightPhase === 'airborne' ? 'tag-green' : t.flightPhase === 'touchdown' ? 'tag-orange' : 'tag-blue'}`;
            }
            if (throttleSlider && document.activeElement !== throttleSlider) {
              throttleSlider.value = t.throttlePercent.toString();
            }
            if (throttleVal) throttleVal.textContent = `${t.throttlePercent}%`;
          } else if (this.activeMode === 'quickstart') {
            const t = (this.currentGame as QuickstartGame).getTelemetry();
            const posEl = document.getElementById('qs-pos');
            const coinsEl = document.getElementById('qs-coins');
            const bodiesEl = document.getElementById('qs-bodies');
            const questEl = document.getElementById('qs-quest');

            if (posEl) posEl.textContent = `${t.playerPos[0]}, ${t.playerPos[1]}, ${t.playerPos[2]}`;
            if (coinsEl) coinsEl.textContent = `🪙 ${t.coinsCollected} / ${t.totalCoins}`;
            if (bodiesEl) bodiesEl.textContent = `${t.dynamicBodyCount} active`;
            if (questEl) questEl.textContent = t.lastAction;
          }

          if (this.isInspectorOpen) {
            try {
              const obs = ObservationEngine.generateTier0(this.currentGame.engine);
              const inspContent = document.getElementById('inspector-content');
              if (inspContent && this.activeInspectorTab === 'telemetry') {
                inspContent.textContent = obs.markdown;
              } else if (this.activeInspectorTab === 'entities') {
                this.renderEntityTree();
              } else if (this.activeInspectorTab === 'state') {
                const snap = this.getEngineStateSnapshot();
                const stateEl = document.getElementById('inspector-state-content');
                if (stateEl) {
                  stateEl.textContent = JSON.stringify(snap, null, 2);
                }
              }
              const inspHash = document.getElementById('inspector-hash');
              const inspTick = document.getElementById('inspector-tick');
              const inspBytes = document.getElementById('inspector-bytes');
              if (inspHash) inspHash.textContent = currentHash.startsWith('0x') ? currentHash.slice(0, 10) : `#${currentHash.slice(0, 8)}`;
              if (inspTick) inspTick.textContent = `Tick: ${currentTick}`;
              if (inspBytes) inspBytes.textContent = `${obs.bytes}B / 500B`;
            } catch (_) {}
          }
        }

        this.syncLoopOverlay();
      } catch (err) {
        console.error('HUD update error:', err);
      } finally {
        requestAnimationFrame(updateHUD);
      }
    };

    requestAnimationFrame(updateHUD);
  }

  private syncLoopOverlay(): void {
    if (!this.currentGame) {
      this.focusedLoopPhase = null;
      if (this.loopOverlay) {
        this.loopOverlay.style.display = 'none';
        this.loopOverlay.hidden = true;
      }
      return;
    }
    const ph = this.currentGame.engine.loop.phase;
    if (ph === 'playing') {
      this.focusedLoopPhase = null;
      if (this.loopOverlay) {
        this.loopOverlay.style.display = 'none';
        this.loopOverlay.hidden = true;
      }
      return;
    }
    if (this.loopOverlay) {
      this.loopOverlay.hidden = false;
      this.loopOverlay.style.display = 'flex';
      this.loopOverlay.classList.toggle('won', ph === 'won');
      this.loopOverlay.classList.toggle('lost', ph === 'lost');
      document.exitPointerLock?.();
      if (this.loopKicker) this.loopKicker.textContent = this.currentGame.engine.loop.title;
      if (this.loopTitle) {
        this.loopTitle.textContent =
          ph === 'ready' ? 'Simulation Ready' : ph === 'won' ? 'Victory!' : 'Game Over';
      }
      if (this.loopBody) this.loopBody.textContent = this.currentGame.engine.loop.outcome || this.currentGame.engine.loop.subtitle;
      if (this.loopAction) {
        this.loopAction.textContent =
          ph === 'ready' ? '▶ Start Simulation' : '🔄 Play Again';
      }
      if (this.focusedLoopPhase !== ph) {
        this.focusedLoopPhase = ph;
        this.loopAction.focus({ preventScroll: true });
      }
    }

    if (this.loopAction) {
      this.loopAction.onclick = () => {
        sfx.playMenuSelect();
        if (ph === 'ready') {
          this.currentGame?.engine.loop.start();
        } else {
          void this.restartCurrentGame();
        }
      };
    }
  }
}

if (typeof window !== 'undefined') {
  const start = () => {
    try {
      (window as unknown as { __renderoniApp?: PlaygroundApp }).__renderoniApp = new PlaygroundApp();
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      const host = document.getElementById('console-home');
      if (host) {
        const pre = document.createElement('pre');
        pre.style.cssText = 'position:relative;z-index:80;margin:16px;padding:16px;background:#450a0a;color:#fecaca;white-space:pre-wrap;';
        pre.textContent = msg;
        host.prepend(pre);
      }
      console.error(err);
    }
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
