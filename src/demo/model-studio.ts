/**
 * Renderoni Model Studio & Prompt-to-Scene Approval Gate
 *
 * Dedicated pre-game 3D inspection studio for reviewing, inspecting,
 * and approving reconstructed img2threejs models before adding to games.
 */

import * as THREE from 'three';
import { createAncestorPortraitGroup } from './games/echoes-of-blackwood/models/AncestorPortrait.js';
import { createManorDoorModel } from './games/echoes-of-blackwood/models/ManorDoor.js';
import { createVictorianWallClockModel } from './games/echoes-of-blackwood/models/VictorianWallClock.js';
import { buildQuestItems } from './games/echoes-of-blackwood/models/Items.js';
import { createCobwebGroup } from './games/echoes-of-blackwood/models/Cobweb.js';
import { buildAerobaticPlane } from './games/skyward-courier/models/AerobaticPlane.js';
import { RenderoniEngine } from '../core/engine.js';
import { sfx } from './audio-sfx.js';

export interface StudioModelDef {
  id: string;
  name: string;
  category: 'prop' | 'architecture' | 'decor' | 'vehicle' | 'puzzle';
  description: string;
  sourceFile: string;
  colliderHint: string;
  approved: boolean;
  create: (engine: RenderoniEngine) => THREE.Object3D;
}

export class ModelStudioScene {
  public engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;
  private currentObject: THREE.Object3D | null = null;
  private activeModelId = 'victorian_wall_clock';
  private autoRotate = true;
  private showWireframe = false;
  private showCollider = false;
  private colliderHelper: THREE.BoxHelper | null = null;
  private models: StudioModelDef[] = [];
  private studioGrid!: THREE.GridHelper;
  private studioLight!: THREE.PointLight;

  // Orbit controls state
  private isMouseDown = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private spherical = { radius: 6.0, theta: Math.PI / 4, phi: Math.PI / 3 };
  private targetCenter = new THREE.Vector3(0, 1.2, 0);
  private unbind: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, 0, 0],
    });

    this.initModelRegistry();
  }

  private initModelRegistry(): void {
    this.models = [
      {
        id: 'victorian_wall_clock',
        name: 'Ornate Victorian Wall Clock',
        category: 'puzzle',
        description: 'Reference-matched circular clock with aged cream dial, antique bronze filigree, sculpted crown, glass bezel, black hands, and hanging ornamental pendulum.',
        sourceFile: 'models/VictorianWallClock.ts',
        colliderHint: 'box [1.65, 2.45, 0.35]',
        approved: true,
        create: () => createVictorianWallClockModel().root,
      },
      {
        id: 'manor_door',
        name: 'Victorian Paneled Door',
        category: 'architecture',
        description: '4-panel dark oak door with outer molding frame, brass doorknobs on both sides, and smooth animated side-hinge.',
        sourceFile: 'models/ManorDoor.ts',
        colliderHint: 'box [2.0, 3.5, 0.35]',
        approved: true,
        create: () => {
          const { root, hinge } = createManorDoorModel({ width: 2.0, height: 3.5 });
          hinge.rotation.y = -Math.PI / 3; // partially open showcase angle
          return root;
        },
      },
      {
        id: 'study_desk_journal',
        name: 'Antique Study Desk & Clue Journal',
        category: 'prop',
        description: 'Victorian double-pedestal desk with brass pulls, open leather-bound journal with red ribbon, and burning candlestick.',
        sourceFile: 'models/Items.ts',
        colliderHint: 'box [2.4, 0.9, 1.3]',
        approved: true,
        create: (eng) => {
          buildQuestItems(eng);
          const group = new THREE.Group();
          eng.native.scene.traverse((c) => {
            if (c.name === 'study_desk' || (c as any).isMesh) {
              // collect local demo meshes
            }
          });
          return group;
        },
      },
      {
        id: 'ancestor_portrait_1',
        name: 'Ancestor Portrait (Gentleman)',
        category: 'decor',
        description: 'Ornate carved walnut & gold frame housing an authentic sepia oil portrait of a Victorian patriarch with mustache.',
        sourceFile: 'models/AncestorPortrait.ts',
        colliderHint: 'none (wall hung)',
        approved: true,
        create: () => createAncestorPortraitGroup(0),
      },
      {
        id: 'ancestor_portrait_2',
        name: 'Ancestor Portrait (Matriarch)',
        category: 'decor',
        description: 'Victorian matriarch oil painting with high lace collar in dark ornate gilded frame.',
        sourceFile: 'models/AncestorPortrait.ts',
        colliderHint: 'none (wall hung)',
        approved: true,
        create: () => createAncestorPortraitGroup(1),
      },
      {
        id: 'key_pedestal',
        name: 'Stone Pedestal & Clock Key',
        category: 'prop',
        description: 'Gothic stone pedestal supporting a spinning brass clock winding key with ring handle and cross-cut bit.',
        sourceFile: 'models/Items.ts',
        colliderHint: 'pedestal: cylinder [0.35, 0.8]',
        approved: true,
        create: (eng) => {
          const res = buildQuestItems(eng);
          return res.keyEntity.native.three?.object || new THREE.Group();
        },
      },
      {
        id: 'crest_altar',
        name: 'Heraldic Crest & Stone Altar',
        category: 'prop',
        description: 'Blackwood family heraldic crest with red octahedron gemstone mounted atop a stone pedestal with amber lighting.',
        sourceFile: 'models/Items.ts',
        colliderHint: 'altar: box [1.2, 1.0, 1.2]',
        approved: true,
        create: (eng) => {
          const res = buildQuestItems(eng);
          return res.crestEntity.native.three?.object || new THREE.Group();
        },
      },
      {
        id: 'aerobatic_plane',
        name: 'Skyward Aerobatic Monoplane',
        category: 'vehicle',
        description: 'High-performance aerobatic airplane with crimson fuselage, dual cockpits, rotating propeller, and wing ailerons.',
        sourceFile: 'models/AerobaticPlane.ts',
        colliderHint: 'fuselage: box [1.8, 1.4, 7.2]',
        approved: true,
        create: () => {
          const rig = buildAerobaticPlane();
          return rig.root;
        },
      },
      {
        id: 'cobweb',
        name: 'Atmospheric Corner Cobweb',
        category: 'decor',
        description: 'Translucent corner spiderweb geometry for ceilings, door archways, and dark alcoves.',
        sourceFile: 'models/Cobweb.ts',
        colliderHint: 'none',
        approved: true,
        create: () => createCobwebGroup(),
      },
    ];
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    const camera = this.engine.native.camera;

    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.02);

    camera.fov = 50;
    camera.near = 0.1;
    camera.far = 100;
    camera.updateProjectionMatrix();

    // Studio Grid & Lighting
    this.studioGrid = new THREE.GridHelper(20, 20, 0x38bdf8, 0x1e293b);
    this.studioGrid.position.y = 0;
    scene.add(this.studioGrid);

    // Three-point Studio Lighting
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.5);
    keyLight.position.set(5, 8, 5);
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.2);
    fillLight.position.set(-5, 4, -5);
    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.8);
    rimLight.position.set(0, -3, -6);

    this.studioLight = new THREE.PointLight(0xfacc15, 1.5, 12, 1.2);
    this.studioLight.position.set(0, 3, 2);

    scene.add(keyLight, fillLight, rimLight, this.studioLight);

    // Mount UI Overlay
    this.mountStudioUI();

    // Load initial model
    this.loadModel(this.activeModelId);

    // Bind interactive orbit mouse / touch controls
    this.bindOrbitControls();

    // Start render loop
    this.engine.start((dt) => this.update(dt));
  }

  private mountStudioUI(): void {
    const hud = document.getElementById('game-hud');
    if (!hud) return;

    hud.style.display = 'block';
    hud.innerHTML = `
      <div class="studio-ui-container" style="position: absolute; inset: 0; pointer-events: none; display: flex; justify-content: space-between; padding: 20px;">
        <!-- Left Panel: Model Library & Scene Inventory -->
        <div class="studio-panel-left" style="pointer-events: auto; width: 340px; background: rgba(12, 12, 12, 0.94); border: 2px solid #fafaf9; box-shadow: 4px 4px 0 #000; padding: 16px; display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 40px); overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #292524; padding-bottom: 8px;">
            <div>
              <h2 style="font-size: 1.3rem; color: #facc15; margin: 0;">🎨 Model Studio</h2>
              <span style="font-size: 0.75rem; color: #a8a29e;">Prompt-to-Scene &bull; Approval Gate</span>
            </div>
            <button id="btn-studio-exit" class="btn-pause-chip" style="font-size: 0.85rem; padding: 4px 8px;">✕ Home</button>
          </div>

          <div style="font-size: 0.8rem; color: #cbd5e1; line-height: 1.4; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px;">
            🔍 <strong>Development Previews:</strong> Inspect 3D geometries, materials, and colliders reconstructed from prompts & reference art before approving for gameplay.
          </div>

          <!-- Model List -->
          <div style="font-size: 0.75rem; text-transform: uppercase; color: #a8a29e; font-weight: 700;">Reconstructed Models:</div>
          <div id="studio-model-list" style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
            ${this.models
              .map(
                (m) => `
              <button class="studio-model-item ${m.id === this.activeModelId ? 'active' : ''}" data-id="${m.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: ${m.id === this.activeModelId ? '#292524' : '#141414'}; border: 2px solid ${m.id === this.activeModelId ? '#facc15' : '#292524'}; color: #fafaf9; cursor: pointer; text-align: left; font-family: inherit;">
                <div>
                  <div style="font-weight: 700; font-size: 0.95rem;">${m.name}</div>
                  <div style="font-size: 0.7rem; color: #a8a29e;">${m.category} &bull; ${m.sourceFile}</div>
                </div>
                <span style="font-size: 0.75rem; padding: 2px 6px; background: ${m.approved ? 'rgba(74, 222, 128, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${m.approved ? '#4ade80' : '#fbbf24'}; border-radius: 3px; font-weight: 700;">
                  ${m.approved ? '✓ Approved' : 'Pending'}
                </span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- Right Panel: Inspection Controls & Approval Gate -->
        <div class="studio-panel-right" style="pointer-events: auto; width: 360px; background: rgba(12, 12, 12, 0.94); border: 2px solid #fafaf9; box-shadow: 4px 4px 0 #000; padding: 16px; display: flex; flex-direction: column; gap: 14px;">
          <div style="border-bottom: 2px solid #292524; padding-bottom: 8px;">
            <span id="model-cat-badge" style="font-size: 0.7rem; font-weight: 800; background: #38bdf8; color: #111; padding: 2px 6px; border-radius: 3px; text-transform: uppercase;">PROP</span>
            <h3 id="model-name-title" style="font-size: 1.3rem; color: #fafaf9; margin: 4px 0 2px;">Ornate Victorian Wall Clock</h3>
            <p id="model-desc-text" style="font-size: 0.82rem; color: #a8a29e; line-height: 1.4;">Reference-matched bronze filigree clock with hanging pendulum.</p>
          </div>

          <!-- Quick Toggles -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="btn-toggle-rotate" class="btn-pause-chip" style="font-size: 0.85rem; padding: 6px;">🔄 Rotate: ON</button>
            <button id="btn-toggle-wireframe" class="btn-pause-chip" style="font-size: 0.85rem; padding: 6px;">📐 Wireframe: OFF</button>
            <button id="btn-toggle-collider" class="btn-pause-chip" style="font-size: 0.85rem; padding: 6px;">📦 Collider: OFF</button>
            <button id="btn-reset-view" class="btn-pause-chip" style="font-size: 0.85rem; padding: 6px;">🎯 Reset View</button>
          </div>

          <!-- Specs Info Box -->
          <div style="background: rgba(0,0,0,0.4); padding: 10px; border: 1px solid #44403c; border-radius: 4px; font-size: 0.8rem; display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between;"><span style="color: #a8a29e;">Collider Spec:</span> <strong id="model-collider-spec" style="color: #facc15;">box [1.65, 2.45, 0.35]</strong></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #a8a29e;">Source Module:</span> <code id="model-source-file" style="color: #38bdf8;">models/VictorianWallClock.ts</code></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: #a8a29e;">Orbit Help:</span> <span style="color: #e2e8f0;">Drag to rotate &bull; Scroll zoom</span></div>
          </div>

          <!-- Approval Action Card -->
          <div style="background: #1c1917; border: 2px solid #78350f; padding: 12px; border-radius: 4px; display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 0.82rem; font-weight: 700; color: #facc15;">✅ Approval Gate:</div>
            <p style="font-size: 0.75rem; color: #cbd5e1;">Approve this 3D reconstruction into the level SceneInventory or request prompt adjustments.</p>
            <div style="display: flex; gap: 8px;">
              <button id="btn-approve-model" style="flex: 1; padding: 8px; font-family: inherit; font-size: 0.95rem; font-weight: 700; background: #4ade80; color: #111; border: 2px solid #fafaf9; cursor: pointer;">✓ Approve</button>
              <button id="btn-reject-model" style="flex: 1; padding: 8px; font-family: inherit; font-size: 0.95rem; font-weight: 700; background: #fb7185; color: #111; border: 2px solid #fafaf9; cursor: pointer;">✕ Adjust</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Hook listeners
    document.getElementById('btn-studio-exit')?.addEventListener('click', () => {
      (window as any).__renderoniApp?.switchGame('home');
    });

    document.querySelectorAll('.studio-model-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id;
        if (id) {
          sfx.playMenuSelect();
          this.loadModel(id);
        }
      });
    });

    document.getElementById('btn-toggle-rotate')?.addEventListener('click', (e) => {
      this.autoRotate = !this.autoRotate;
      (e.currentTarget as HTMLElement).textContent = `🔄 Rotate: ${this.autoRotate ? 'ON' : 'OFF'}`;
      sfx.playMenuMove();
    });

    document.getElementById('btn-toggle-wireframe')?.addEventListener('click', (e) => {
      this.showWireframe = !this.showWireframe;
      (e.currentTarget as HTMLElement).textContent = `📐 Wireframe: ${this.showWireframe ? 'ON' : 'OFF'}`;
      this.updateWireframeState();
      sfx.playMenuMove();
    });

    document.getElementById('btn-toggle-collider')?.addEventListener('click', (e) => {
      this.showCollider = !this.showCollider;
      (e.currentTarget as HTMLElement).textContent = `📦 Collider: ${this.showCollider ? 'ON' : 'OFF'}`;
      if (this.colliderHelper) this.colliderHelper.visible = this.showCollider;
      sfx.playMenuMove();
    });

    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
      this.spherical = { radius: 6.0, theta: Math.PI / 4, phi: Math.PI / 3 };
      sfx.playMenuMove();
    });

    document.getElementById('btn-approve-model')?.addEventListener('click', () => {
      const active = this.models.find((m) => m.id === this.activeModelId);
      if (active) {
        active.approved = true;
        sfx.playRingChime();
        this.mountStudioUI();
      }
    });

    document.getElementById('btn-reject-model')?.addEventListener('click', () => {
      const active = this.models.find((m) => m.id === this.activeModelId);
      if (active) {
        active.approved = false;
        sfx.playDecouple();
        this.mountStudioUI();
      }
    });
  }

  loadModel(modelId: string): void {
    const scene = this.engine.native.scene;
    this.activeModelId = modelId;

    // Remove previous model
    if (this.currentObject) {
      scene.remove(this.currentObject);
      this.currentObject = null;
    }
    if (this.colliderHelper) {
      scene.remove(this.colliderHelper);
      this.colliderHelper = null;
    }

    const def = this.models.find((m) => m.id === modelId) || this.models[0];
    if (!def) return;

    // Instantiate model group
    this.currentObject = def.create(this.engine);
    this.currentObject.position.set(0, 0, 0);
    scene.add(this.currentObject);

    // Compute bounding box for camera framing
    const box = new THREE.Box3().setFromObject(this.currentObject);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    this.targetCenter.copy(center);

    const maxDim = Math.max(size.x, size.y, size.z, 1.5);
    this.spherical.radius = maxDim * 2.2;

    // Collider Helper
    this.colliderHelper = new THREE.BoxHelper(this.currentObject, 0x4ade80);
    this.colliderHelper.visible = this.showCollider;
    scene.add(this.colliderHelper);

    // Update UI labels
    const titleEl = document.getElementById('model-name-title');
    const descEl = document.getElementById('model-desc-text');
    const catEl = document.getElementById('model-cat-badge');
    const specEl = document.getElementById('model-collider-spec');
    const fileEl = document.getElementById('model-source-file');

    if (titleEl) titleEl.textContent = def.name;
    if (descEl) descEl.textContent = def.description;
    if (catEl) catEl.textContent = def.category.toUpperCase();
    if (specEl) specEl.textContent = def.colliderHint;
    if (fileEl) fileEl.textContent = def.sourceFile;

    document.querySelectorAll('.studio-model-item').forEach((item) => {
      const el = item as HTMLElement;
      el.style.borderColor = el.dataset.id === modelId ? '#facc15' : '#292524';
      el.style.background = el.dataset.id === modelId ? '#292524' : '#141414';
    });

    this.updateWireframeState();
  }

  private updateWireframeState(): void {
    if (!this.currentObject) return;
    this.currentObject.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => (m.wireframe = this.showWireframe));
        } else if (child.material) {
          child.material.wireframe = this.showWireframe;
        }
      }
    });
  }

  private bindOrbitControls(): void {
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.studio-panel-left, .studio-panel-right')) return;
      this.isMouseDown = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    };

    const onMouseUp = () => {
      this.isMouseDown = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isMouseDown) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      this.spherical.theta -= dx * 0.008;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi - dy * 0.008));
    };

    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.studio-panel-left, .studio-panel-right')) return;
      this.spherical.radius = Math.max(1.5, Math.min(30.0, this.spherical.radius + e.deltaY * 0.005));
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: true });

    this.unbind.push(() => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('wheel', onWheel);
    });
  }

  private update(dt: number): void {
    if (this.autoRotate && !this.isMouseDown) {
      this.spherical.theta += dt * 0.4;
    }

    // Camera Orbit Position from Spherical coordinates
    const camera = this.engine.native.camera;
    if (camera) {
      const x = this.targetCenter.x + this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
      const y = this.targetCenter.y + this.spherical.radius * Math.cos(this.spherical.phi);
      const z = this.targetCenter.z + this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);

      camera.position.set(x, y, z);
      camera.lookAt(this.targetCenter);
    }

    if (this.colliderHelper && this.currentObject) {
      this.colliderHelper.update();
    }
  }

  dispose(): void {
    for (const fn of this.unbind) fn();
    this.unbind.length = 0;
    this.engine.dispose();
  }
}
