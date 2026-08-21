/**
 * Renderoni Model Studio
 *
 * Preview-only inspection studio for reconstructed game props.
 */

import * as THREE from 'three';
import { createAncestorPortraitGroup } from './games/echoes-of-blackwood/models/AncestorPortrait.js';
import { createManorDoorModel } from './games/echoes-of-blackwood/models/ManorDoor.js';
import { createVictorianWallClockModel } from './games/echoes-of-blackwood/models/VictorianWallClock.js';
import { createVictorianWindingKeyModel } from './games/echoes-of-blackwood/models/VictorianWindingKey.js';
import { createCobwebGroup } from './games/echoes-of-blackwood/models/Cobweb.js';
import { buildAerobaticPlane } from './games/skyward-courier/models/AerobaticPlane.js';
import { RenderoniEngine } from '../core/engine.js';
import { sfx } from './audio-sfx.js';

export interface StudioAnnotation {
  id: string;
  note: string;
  position: [number, number, number];
}

export interface StudioModelDef {
  id: string;
  name: string;
  category: 'prop' | 'architecture' | 'decor' | 'vehicle' | 'puzzle';
  description: string;
  sourceFile: string;
  colliderHint: string;
  create: () => THREE.Object3D;
}

const woodMat = () => new THREE.MeshStandardMaterial({ color: 0x5b3417, roughness: 0.72, metalness: 0.08 });
const brassMat = () => new THREE.MeshStandardMaterial({ color: 0xd99b2b, roughness: 0.28, metalness: 0.85 });
const stoneMat = () => new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.82, metalness: 0.1 });

export const STUDIO_PIN_GEOMETRY = new THREE.SphereGeometry(0.075, 12, 12);
export const STUDIO_PIN_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false });

export function createAnnotationPinMesh(pin: StudioAnnotation, index: number): THREE.Mesh {
  const mesh = new THREE.Mesh(STUDIO_PIN_GEOMETRY, STUDIO_PIN_MATERIAL);
  mesh.position.set(...pin.position);
  mesh.renderOrder = 10;
  mesh.name = `annotation_pin_${index + 1}`;
  return mesh;
}

export function createStudyDeskJournalModel(): THREE.Object3D {
  const group = new THREE.Group();
  const wood = woodMat();
  const brass = brassMat();

  const desktop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.3), wood);
  desktop.position.y = 0.86;
  const leftPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.82, 1.2), wood);
  leftPedestal.position.set(-0.75, 0.41, 0);
  const rightPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.82, 1.2), wood);
  rightPedestal.position.set(0.75, 0.41, 0);
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.04), wood);
  backPanel.position.set(0, 0.57, -0.52);
  group.add(desktop, leftPedestal, rightPedestal, backPanel);

  for (const xOff of [-0.75, 0.75]) {
    for (const yOff of [0.22, 0.45, 0.68]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), brass);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(xOff, yOff, 0.62);
      group.add(knob);
    }
  }

  const journal = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.36), new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 }));
  cover.position.y = 0.01;
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5 });
  const leftPage = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.025, 0.33), pageMat);
  leftPage.position.set(-0.115, 0.022, 0);
  leftPage.rotation.z = 0.06;
  const rightPage = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.025, 0.33), pageMat);
  rightPage.position.set(0.115, 0.022, 0);
  rightPage.rotation.z = -0.06;
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.008, 0.38), new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 }));
  ribbon.position.set(0, 0.036, 0);
  journal.position.set(-0.2, 0.94, 0.14);
  journal.rotation.y = -0.18;
  journal.add(cover, leftPage, rightPage, ribbon);
  group.add(journal);

  const candleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 12), brass);
  candleBase.position.set(0.65, 0.93, -0.22);
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xfef9c3, roughness: 0.6 }));
  candle.position.set(0.65, 1.03, -0.22);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 8), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
  flame.position.set(0.65, 1.15, -0.22);
  group.add(candleBase, candle, flame);
  return group;
}

export function createCrestAltarModel(): THREE.Object3D {
  const group = new THREE.Group();
  const stone = stoneMat();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.3 });
  const brass = brassMat();

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), stone);
  base.position.y = 0.1;
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), stone);
  pillar.position.y = 0.55;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 1.1), stone);
  top.position.y = 0.95;

  const crest = new THREE.Group();
  crest.position.y = 1.4;
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.08), gold);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.1), brass);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.1), brass);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.05 }));
  gem.position.z = 0.1;
  crest.add(shield, crossH, crossV, gem);
  group.add(base, pillar, top, crest);
  return group;
}

export const STUDIO_MODELS: StudioModelDef[] = [
  {
    id: 'victorian_wall_clock',
    name: 'Ornate Victorian Wall Clock',
    category: 'puzzle',
    description: 'Reference-matched circular clock with aged cream dial, antique bronze filigree, sculpted crown, glass bezel, black hands, and hanging ornamental pendulum.',
    sourceFile: 'models/VictorianWallClock.ts',
    colliderHint: 'box [1.65, 2.45, 0.35]',
    create: () => createVictorianWallClockModel().root,
  },
  {
    id: 'manor_door',
    name: 'Victorian Paneled Door',
    category: 'architecture',
    description: '4-panel dark oak door with outer molding frame, brass doorknobs on both sides, and smooth animated side-hinge.',
    sourceFile: 'models/ManorDoor.ts',
    colliderHint: 'box [2.0, 3.5, 0.35]',
    create: () => {
      const { root, hinge } = createManorDoorModel({ width: 2.0, height: 3.5 });
      hinge.rotation.y = -Math.PI / 3;
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
    create: createStudyDeskJournalModel,
  },
  {
    id: 'ancestor_portrait_1',
    name: 'Ancestor Portrait (Gentleman)',
    category: 'decor',
    description: 'Ornate carved walnut & gold frame housing a sepia oil portrait of a Victorian patriarch with mustache.',
    sourceFile: 'models/AncestorPortrait.ts',
    colliderHint: 'none (wall hung)',
    create: () => createAncestorPortraitGroup(0),
  },
  {
    id: 'ancestor_portrait_2',
    name: 'Ancestor Portrait (Matriarch)',
    category: 'decor',
    description: 'Victorian matriarch oil painting with high lace collar in dark ornate gilded frame.',
    sourceFile: 'models/AncestorPortrait.ts',
    colliderHint: 'none (wall hung)',
    create: () => createAncestorPortraitGroup(1),
  },
  {
    id: 'victorian_winding_key',
    name: 'Filigreed Victorian Winding Key',
    category: 'prop',
    description: 'Reference-matched antique winding key with an open circular bow, curled filigree, ribbed collars, engraved shaft, rosette, and decorative ward.',
    sourceFile: 'models/VictorianWindingKey.ts',
    colliderHint: 'box [0.9, 0.45, 0.12]',
    create: () => createVictorianWindingKeyModel(),
  },
  {
    id: 'crest_altar',
    name: 'Heraldic Crest & Stone Altar',
    category: 'prop',
    description: 'Blackwood family heraldic crest with red octahedron gemstone mounted atop a stone pedestal with amber lighting.',
    sourceFile: 'models/Items.ts',
    colliderHint: 'altar: box [1.2, 1.0, 1.2]',
    create: createCrestAltarModel,
  },
  {
    id: 'aerobatic_plane',
    name: 'Skyward Aerobatic Monoplane',
    category: 'vehicle',
    description: 'High-performance aerobatic airplane with crimson fuselage, dual cockpits, rotating propeller, and wing ailerons.',
    sourceFile: 'models/AerobaticPlane.ts',
    colliderHint: 'fuselage: box [1.8, 1.4, 7.2]',
    create: () => buildAerobaticPlane().root,
  },
  {
    id: 'cobweb',
    name: 'Atmospheric Corner Cobweb',
    category: 'decor',
    description: 'Translucent corner spiderweb geometry for ceilings, door archways, and dark alcoves.',
    sourceFile: 'models/Cobweb.ts',
    colliderHint: 'none',
    create: () => createCobwebGroup(),
  },
];

export class ModelStudioScene {
  public engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;
  private currentObject: THREE.Object3D | null = null;
  private activeModelId = 'victorian_winding_key';
  private autoRotate = false;
  private showWireframe = false;
  private showCollider = false;
  private colliderHelper: THREE.BoxHelper | null = null;
  private readonly models = STUDIO_MODELS;
  private studioGrid!: THREE.GridHelper;
  private studioLight!: THREE.PointLight;
  private annotations: StudioAnnotation[] = [];
  private pinGroup = new THREE.Group();
  private isPointerDown = false;
  private dragged = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private spherical = { radius: 6.0, theta: Math.PI / 4, phi: Math.PI / 3 };
  private targetCenter = new THREE.Vector3(0, 1.2, 0);
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private unbind: Array<() => void> = [];
  private activated = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, 0, 0],
    });
  }

  async init(options: { activate?: boolean } = {}): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    const camera = this.engine.native.camera;

    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.02);

    camera.fov = 50;
    camera.near = 0.1;
    camera.far = 100;
    camera.updateProjectionMatrix();

    this.studioGrid = new THREE.GridHelper(20, 20, 0x38bdf8, 0x1e293b);
    scene.add(this.studioGrid);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.5);
    keyLight.position.set(5, 8, 5);
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.2);
    fillLight.position.set(-5, 4, -5);
    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.8);
    rimLight.position.set(0, -3, -6);
    this.studioLight = new THREE.PointLight(0xfacc15, 1.5, 12, 1.2);
    this.studioLight.position.set(0, 3, 2);
    scene.add(keyLight, fillLight, rimLight, this.studioLight, this.pinGroup);

    this.loadModel(this.activeModelId);
    if (options.activate !== false) this.activate();
  }

  activate(): void {
    if (this.activated) return;
    this.activated = true;
    this.mountStudioUI();
    this.bindOrbitControls();
    this.engine.start((dt) => this.update(dt));
  }

  private mountStudioUI(): void {
    const hud = document.getElementById('game-hud');
    if (!hud) return;

    hud.style.display = 'block';
    hud.innerHTML = `
      <div class="studio-ui-container">
        <aside class="studio-panel studio-panel-left">
          <div class="studio-panel-header">
            <div>
              <h2>🎨 Model Studio</h2>
              <span>Preview-only prop lab</span>
            </div>
            <button id="btn-studio-exit" class="btn-pause-chip">✕ Home</button>
          </div>
          <div class="studio-help">Click a model to load it. Click the model surface to pin a short annotation. Pins are saved locally per model.</div>
          <div class="studio-section-label">Reconstructed Models</div>
          <div id="studio-model-list" class="studio-model-list">
            ${this.models.map((m) => `
              <button class="studio-model-item ${m.id === this.activeModelId ? 'active' : ''}" data-id="${m.id}">
                <span>
                  <strong>${m.name}</strong>
                  <small>${m.category} &bull; ${m.sourceFile}</small>
                </span>
              </button>
            `).join('')}
          </div>
        </aside>

        <aside class="studio-panel studio-panel-right">
          <div class="studio-model-summary">
            <span id="model-cat-badge" class="model-cat-badge">PROP</span>
            <h3 id="model-name-title">Model</h3>
            <p id="model-desc-text">Preview details.</p>
          </div>

          <div class="studio-button-grid">
            <button id="btn-toggle-rotate" class="btn-pause-chip">🔄 Rotate: OFF</button>
            <button id="btn-toggle-wireframe" class="btn-pause-chip">📐 Wireframe: OFF</button>
            <button id="btn-toggle-collider" class="btn-pause-chip">📦 Collider: OFF</button>
            <button id="btn-frame-view" class="btn-pause-chip">🖼️ Frame</button>
            <button id="btn-reset-view" class="btn-pause-chip">🎯 Reset</button>
            <button id="btn-clear-pins" class="btn-pause-chip">🧹 Clear Pins</button>
          </div>

          <div class="studio-spec-box">
            <div><span>Collider</span><strong id="model-collider-spec">none</strong></div>
            <div><span>Source</span><code id="model-source-file">models</code></div>
            <div><span>Orbit</span><em>Drag/touch rotate · wheel/pinch-ish zoom</em></div>
          </div>

          <div class="studio-actions-row">
            <button id="btn-copy-png" class="btn-sm btn-accent">📋 Copy PNG</button>
            <button id="btn-download-png" class="btn-sm">💾 PNG</button>
            <button id="btn-export-annotations" class="btn-sm">📍 JSON</button>
          </div>

          <div class="studio-annotations">
            <div class="studio-section-label">Annotation Pins</div>
            <div id="studio-annotation-list" class="studio-annotation-list"></div>
          </div>
        </aside>
      </div>
    `;

    document.getElementById('btn-studio-exit')?.addEventListener('click', () => {
      (window as unknown as { __renderoniApp?: { switchGame: (mode: string) => void } }).__renderoniApp?.switchGame('home');
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
    document.getElementById('btn-frame-view')?.addEventListener('click', () => this.frameCurrentModel());
    document.getElementById('btn-reset-view')?.addEventListener('click', () => {
      this.resetView();
      sfx.playMenuMove();
    });
    document.getElementById('btn-clear-pins')?.addEventListener('click', () => {
      this.annotations = [];
      this.saveAnnotations();
      this.renderPins();
      this.renderAnnotationList();
      sfx.playDecouple();
    });
    document.getElementById('btn-copy-png')?.addEventListener('click', () => void this.capturePng('copy'));
    document.getElementById('btn-download-png')?.addEventListener('click', () => void this.capturePng('download'));
    document.getElementById('btn-export-annotations')?.addEventListener('click', () => this.exportAnnotations());

    this.updateModelLabels();
    this.renderAnnotationList();
  }

  loadModel(modelId: string): void {
    const scene = this.engine.native.scene;
    this.activeModelId = modelId;

    if (this.currentObject) {
      scene.remove(this.currentObject);
      this.currentObject = null;
    }
    if (this.colliderHelper) {
      scene.remove(this.colliderHelper);
      this.colliderHelper = null;
    }
    this.pinGroup.clear();

    const def = this.models.find((m) => m.id === modelId) || this.models[0];
    if (!def) return;

    this.currentObject = def.create();
    this.currentObject.position.set(0, 0, 0);
    scene.add(this.currentObject);

    this.colliderHelper = new THREE.BoxHelper(this.currentObject, 0x4ade80);
    this.colliderHelper.visible = this.showCollider;
    scene.add(this.colliderHelper);

    this.updateWireframeState();
    this.frameCurrentModel(false);
    this.loadAnnotations();
    this.renderPins();
    if (this.activated) {
      this.updateModelLabels();
      this.renderAnnotationList();
      document.querySelectorAll('.studio-model-item').forEach((item) => {
        item.classList.toggle('active', (item as HTMLElement).dataset.id === modelId);
      });
    }
  }

  private updateModelLabels(): void {
    const def = this.models.find((m) => m.id === this.activeModelId);
    if (!def) return;
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

  private resetView(): void {
    this.spherical = { radius: 6.0, theta: Math.PI / 4, phi: Math.PI / 3 };
    this.frameCurrentModel(false);
  }

  private frameCurrentModel(playSound = true): void {
    if (!this.currentObject) return;
    const box = new THREE.Box3().setFromObject(this.currentObject);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    this.targetCenter.copy(center);
    const maxDim = Math.max(size.x, size.y, size.z, 1.5);
    this.spherical.radius = Math.min(30, Math.max(2.2, maxDim * 2.25));
    if (playSound) sfx.playMenuMove();
  }

  private bindOrbitControls(): void {
    const isUiTarget = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('.studio-panel');

    const onPointerDown = (e: PointerEvent) => {
      if (isUiTarget(e.target)) return;
      this.isPointerDown = true;
      this.dragged = false;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      this.canvas.releasePointerCapture?.(e.pointerId);
      if (!this.dragged && !isUiTarget(e.target)) this.placeAnnotationFromPointer(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isPointerDown) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      if (Math.hypot(dx, dy) > 4) this.dragged = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.spherical.theta -= dx * 0.008;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi - dy * 0.008));
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      if (isUiTarget(e.target)) return;
      this.spherical.radius = Math.max(1.5, Math.min(30.0, this.spherical.radius + e.deltaY * 0.005));
    };

    this.canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('wheel', onWheel, { passive: true });
    this.unbind.push(() => {
      this.canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('wheel', onWheel);
    });
  }

  private placeAnnotationFromPointer(clientX: number, clientY: number): void {
    if (!this.currentObject) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.engine.native.camera);
    const hit = this.raycaster.intersectObject(this.currentObject, true)[0];
    if (!hit) return;

    const note = window.prompt('Short annotation note:', 'Check silhouette')?.trim();
    if (!note) return;
    const p = hit.point;
    this.annotations.push({
      id: `pin-${Date.now().toString(36)}-${this.annotations.length}`,
      note: note.slice(0, 80),
      position: [Number(p.x.toFixed(3)), Number(p.y.toFixed(3)), Number(p.z.toFixed(3))],
    });
    this.saveAnnotations();
    this.renderPins();
    this.renderAnnotationList();
    sfx.playRingChime();
  }

  private annotationKey(): string {
    return `renderoni:model-studio:${this.activeModelId}:annotations`;
  }

  private loadAnnotations(): void {
    try {
      const raw = localStorage.getItem(this.annotationKey());
      this.annotations = raw ? JSON.parse(raw) as StudioAnnotation[] : [];
    } catch {
      this.annotations = [];
    }
  }

  private saveAnnotations(): void {
    try {
      localStorage.setItem(this.annotationKey(), JSON.stringify(this.annotations));
    } catch {
      // Storage can be unavailable in private browsing; the preview still works.
    }
  }

  private renderPins(): void {
    this.pinGroup.clear();
    this.annotations.forEach((pin, index) => {
      this.pinGroup.add(createAnnotationPinMesh(pin, index));
    });
  }

  private renderAnnotationList(): void {
    const list = document.getElementById('studio-annotation-list');
    if (!list) return;
    if (this.annotations.length === 0) {
      list.innerHTML = '<div class="studio-empty">No pins yet. Click the model to add one.</div>';
      return;
    }
    list.innerHTML = this.annotations.map((pin, i) => `
      <div class="studio-pin-row">
        <span>${i + 1}. ${pin.note}</span>
        <small>[${pin.position.join(', ')}]</small>
        <button data-pin-id="${pin.id}" type="button">×</button>
      </div>
    `).join('');
    list.querySelectorAll<HTMLButtonElement>('button[data-pin-id]').forEach((button) => {
      button.addEventListener('click', () => {
        this.annotations = this.annotations.filter((pin) => pin.id !== button.dataset.pinId);
        this.saveAnnotations();
        this.renderPins();
        this.renderAnnotationList();
      });
    });
  }

  private exportAnnotations(): void {
    const def = this.models.find((m) => m.id === this.activeModelId);
    this.downloadBlob(
      JSON.stringify({ modelId: this.activeModelId, modelName: def?.name, annotations: this.annotations }, null, 2),
      `renderoni-${this.activeModelId}-annotations.json`,
      'application/json'
    );
    sfx.playRingChime();
  }

  private async capturePng(mode: 'copy' | 'download'): Promise<void> {
    document.body.classList.add('studio-clean-shot');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    this.engine.native.renderer?.render(this.engine.native.scene, this.engine.native.camera);
    const blob = await new Promise<Blob | null>((resolve) => this.canvas.toBlob(resolve, 'image/png'));
    document.body.classList.remove('studio-clean-shot');
    if (!blob) return;

    if (mode === 'copy' && navigator.clipboard && 'ClipboardItem' in window) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        sfx.playRingChime();
        return;
      } catch {
        // Fall back to download when the browser disallows image clipboard writes.
      }
    }
    this.downloadBlob(blob, `renderoni-${this.activeModelId}.png`, 'image/png');
    sfx.playRingChime();
  }

  private downloadBlob(content: BlobPart | Blob, fileName: string, type: string): void {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  private update(dt: number): void {
    if (this.autoRotate && !this.isPointerDown) {
      this.spherical.theta += dt * 0.4;
    }

    const camera = this.engine.native.camera;
    const x = this.targetCenter.x + this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
    const y = this.targetCenter.y + this.spherical.radius * Math.cos(this.spherical.phi);
    const z = this.targetCenter.z + this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);
    camera.position.set(x, y, z);
    camera.lookAt(this.targetCenter);

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
