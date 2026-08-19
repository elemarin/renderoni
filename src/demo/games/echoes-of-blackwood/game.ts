/**
 * Echoes of Blackwood — PSX Survival Horror Manor & Narrative Puzzle
 *
 * Modular Pure TypeScript Architecture:
 * - models/ (ManorHallway, GrandfatherClock, Flashlight, Items)
 * - state.ts (Quest State Store)
 * - audio.ts (Horror Sound Synthesizer)
 */

import * as THREE from 'three';
import { RenderoniEngine } from '../../../core/engine.js';
import { kccPlayer, type EntityInstance } from '../../../presets/index.js';
import { useHorrorStore } from './state.js';
import { horrorSfx } from './audio.js';
import { buildManorArchitecture } from './models/ManorHallway.js';
import { buildGrandfatherClockModel, type ClockModelResult } from './models/GrandfatherClock.js';
import { buildFlashlightRig, type FlashlightRig } from './models/Flashlight.js';
import { buildQuestItems, type QuestItemsResult } from './models/Items.js';

export interface HorrorTelemetry {
  questStatus: string;
  flashlightOn: boolean;
  hasKey: boolean;
  hasCrest: boolean;
  gateUnlocked: boolean;
  inspectingText: string | null;
}

export class EchoesOfBlackwoodGame {
  public engine: RenderoniEngine;
  public canvas: HTMLCanvasElement;

  private playerEntity: EntityInstance | null = null;
  private flashlightRig: FlashlightRig | null = null;
  private clockModel: ClockModelResult | null = null;
  private items: QuestItemsResult | null = null;

  // First-Person Camera & Movement State
  private playerPos = new THREE.Vector3(0, 1.6, 6);
  private yawAngle = 0.0;
  private pitchAngle = 0.0;
  private isLocked = false;
  private isMouseDown = false;
  private keys: Record<string, boolean> = {};
  private unbindInput: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, 0, 0],
      loop: {
        enabled: true,
        title: 'Echoes of Blackwood',
        subtitle: 'Read the journal, wind the clock, retrieve the crest, and escape the gate.',
      },
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    const camera = this.engine.native.camera;

    camera.fov = 72;
    camera.near = 0.1;
    camera.far = 100;
    camera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x06080d);
    scene.fog = new THREE.FogExp2(0x06080d, 0.035);

    // 1. Spawn First-Person KCC Character Controller Entity (Invisible Capsule in 1st-person)
    const startPos: [number, number, number] = [0, 1.6, 6];
    this.playerEntity = this.engine.add(
      kccPlayer({
        id: 'hero_player',
        position: startPos,
        height: 1.6,
        radius: 0.35,
        moveSpeed: 4.2,
        jumpSpeed: 0,
        gravity: 0,
      })
    );

    const playerObj = this.playerEntity.native.three?.object;
    if (playerObj) {
      playerObj.visible = false; // Hide player capsule from 1st-person camera
    }

    // 2. Build Flashlight Viewmodel Rig attached to Camera
    this.flashlightRig = buildFlashlightRig();
    camera.add(this.flashlightRig.group);
    scene.add(camera);

    // 3. Build Manor Architecture & Sconces
    buildManorArchitecture(this.engine);

    // 4. Build Grandfather Clock (Room 3, [-8, 0, -14])
    this.clockModel = buildGrandfatherClockModel(this.engine, -8, 0, -14);

    // 5. Build Quest Items (Desk, Key, Crest, Gate)
    this.items = buildQuestItems(this.engine);

    // 6. Register Action Handlers for Agent & UI
    this.setupActions();

    // 7. Bind Controls
    this.bindControls();

    // 8. Start Engine Simulation Loop
    this.engine.start((dt) => this.update(dt));
  }

  private setupActions(): void {
    this.engine.actions.register({
      name: 'quest.readJournal',
      handle: () => {
        horrorSfx.playPageTurn();
        useHorrorStore.getState().readJournal();
      },
    });

    this.engine.actions.register({
      name: 'quest.pickupKey',
      handle: () => {
        horrorSfx.playItemPickup();
        useHorrorStore.getState().pickupKey();
        const keyObj = this.items?.keyEntity.native.three?.object;
        if (keyObj) keyObj.visible = false;
      },
    });

    this.engine.actions.register({
      name: 'quest.solveClock',
      handle: () => {
        horrorSfx.playClockChime();
        useHorrorStore.getState().solveClock();
        if (this.clockModel) {
          this.clockModel.hourHand.rotation.z = (11 / 12) * Math.PI * 2;
          this.clockModel.minuteHand.rotation.z = (45 / 60) * Math.PI * 2;
          const bcObj = this.clockModel.secretBookcase.native.three?.object;
          if (bcObj) bcObj.position.z += 1.6;
        }
      },
    });

    this.engine.actions.register({
      name: 'quest.pickupCrest',
      handle: () => {
        horrorSfx.playItemPickup();
        useHorrorStore.getState().pickupCrest();
        const crestObj = this.items?.crestEntity.native.three?.object;
        if (crestObj) crestObj.visible = false;
      },
    });

    this.engine.actions.register({
      name: 'quest.unlockGate',
      handle: () => {
        horrorSfx.playGateOpen();
        useHorrorStore.getState().unlockGate();
        const gateObj = this.items?.gateEntity.native.three?.object;
        if (gateObj) gateObj.position.y += 4.0;
        this.engine.loop.win('You escaped Blackwood Manor!');
      },
    });

    this.engine.actions.register({
      name: 'player.toggleFlashlight',
      handle: () => {
        horrorSfx.playFlashlightClick();
        useHorrorStore.getState().toggleFlashlight();
        const isOn = useHorrorStore.getState().flashlightOn;
        this.flashlightRig?.setVisible(isOn);
      },
    });
  }

  private update(dt: number): void {
    if ((window as unknown as { __renderoniPaused?: boolean }).__renderoniPaused) return;
    const keys = this.keys;

    // 1. Smooth Keyboard Turning (ArrowLeft / ArrowRight ONLY — NOT Q/E)
    const turnSpeed = 2.4;
    if (keys['ArrowLeft']) this.yawAngle += turnSpeed * dt;
    if (keys['ArrowRight']) this.yawAngle -= turnSpeed * dt;

    // 2. 1st-Person Movement (WASD)
    const moveSpeed = (keys['ShiftLeft'] || keys['ShiftRight'] ? 6.5 : 3.8) * dt;
    const forward = new THREE.Vector3(-Math.sin(this.yawAngle), 0, -Math.cos(this.yawAngle));
    const right = new THREE.Vector3(Math.cos(this.yawAngle), 0, -Math.sin(this.yawAngle));

    const moveDir = new THREE.Vector3();
    if (keys['KeyW'] || keys['ArrowUp']) moveDir.add(forward);
    if (keys['KeyS'] || keys['ArrowDown']) moveDir.sub(forward);
    if (keys['KeyD']) moveDir.add(right);
    if (keys['KeyA']) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(moveSpeed);
      this.playerPos.add(moveDir);

      // Keep inside manor boundary walls
      this.playerPos.x = Math.max(-12.5, Math.min(12.5, this.playerPos.x));
      this.playerPos.z = Math.max(-28.5, Math.min(9.5, this.playerPos.z));
    }
    this.playerPos.y = 1.6;

    // 3. Update Camera Position and Free Rotation
    const camera = this.engine.native.camera;
    if (camera) {
      camera.position.copy(this.playerPos);
      camera.quaternion.setFromEuler(new THREE.Euler(this.pitchAngle, this.yawAngle, 0, 'YXZ'));
    }

    const playerObj = this.playerEntity?.native.three?.object;
    if (playerObj) {
      playerObj.position.copy(this.playerPos);
    }

    // 4. Animate Key & Crest Idle Spins
    const keyObj = this.items?.keyEntity.native.three?.object;
    if (keyObj && keyObj.visible) {
      keyObj.rotation.y += dt * 2.0;
    }
    const crestObj = this.items?.crestEntity.native.three?.object;
    if (crestObj && crestObj.visible) {
      crestObj.rotation.y += dt * 1.5;
    }

    this.updateProximityInteractions();
  }

  private tryInteract(): void {
    const s = useHorrorStore.getState();
    if (s.inspectingText) {
      s.dismissInspect();
      return;
    }
    const prompt = s.hoverPrompt;
    if (prompt?.includes('Journal')) this.engine.act({ name: 'quest.readJournal' });
    else if (prompt?.includes('Key')) this.engine.act({ name: 'quest.pickupKey' });
    else if (prompt?.includes('Wind Clock')) this.engine.act({ name: 'quest.solveClock' });
    else if (prompt?.includes('Crest')) {
      if (s.clockSolved) this.engine.act({ name: 'quest.pickupCrest' });
      else horrorSfx.playFlashlightClick();
    } else if (prompt?.includes('Gate')) {
      if (s.hasCrest) this.engine.act({ name: 'quest.unlockGate' });
      else horrorSfx.playFlashlightClick();
    }
  }

  private updateProximityInteractions(): void {
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    const s = useHorrorStore.getState();

    // Study Desk Journal ([-8, 2])
    if (Math.hypot(px - (-8), pz - 2) < 5.5) {
      s.setHoverPrompt('[ E ] Read Clockmaker\'s Journal');
      return;
    }

    // Key Pedestal ([8, -6])
    if (!s.hasKey && Math.hypot(px - 8, pz - (-6)) < 5.5) {
      s.setHoverPrompt('[ E ] Take Clock Key');
      return;
    }

    // Grandfather Clock ([-8, -14])
    if (!s.clockSolved && Math.hypot(px - (-8), pz - (-14)) < 5.5) {
      s.setHoverPrompt(s.hasKey ? '[ E ] Wind Clock to 11:45' : 'Grandfather Clock is locked. (Requires Winding Key)');
      return;
    }

    // Blackwood Crest ([8, -22])
    if (!s.hasCrest && Math.hypot(px - 8, pz - (-22)) < 5.5) {
      if (s.clockSolved) {
        s.setHoverPrompt('[ E ] Take Blackwood Crest');
      } else {
        s.setHoverPrompt('The Crest is sealed by the Clock mechanism.');
      }
      return;
    }

    // Escape Gate ([0, -28])
    if (Math.hypot(px - 0, pz - (-28)) < 6.0) {
      s.setHoverPrompt(s.hasCrest ? '[ E ] Unlock Manor Gate with Crest' : 'Manor Gate is sealed. (Requires Blackwood Crest)');
      return;
    }

    s.setHoverPrompt(null);
  }

  private bindControls(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyF') {
        this.engine.act({ name: 'player.toggleFlashlight' });
      }
      if (e.code === 'KeyE') {
        e.preventDefault();
        this.tryInteract();
      }
      this.keys[e.code] = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };

    const onMouseDown = () => {
      this.isMouseDown = true;
    };

    const onMouseUp = () => {
      this.isMouseDown = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isLocked && !this.isMouseDown) return;
      const sensitivity = 0.0024;
      this.yawAngle -= e.movementX * sensitivity;
      this.pitchAngle -= e.movementY * sensitivity;
      this.pitchAngle = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitchAngle));
    };

    const onPointerLockChange = () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    };

    const onClick = () => {
      if (useHorrorStore.getState().inspectingText) {
        useHorrorStore.getState().dismissInspect();
        return;
      }
      if (!this.isLocked) {
        this.canvas.requestPointerLock();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    this.canvas.addEventListener('click', onClick);

    this.unbindInput.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      this.canvas.removeEventListener('click', onClick);
    });
  }

  toggleFlashlight(): void {
    this.engine.act({ name: 'player.toggleFlashlight' });
  }

  readJournal(): void {
    this.engine.act({ name: 'quest.readJournal' });
  }

  getTelemetry(): HorrorTelemetry {
    const s = useHorrorStore.getState();
    return {
      questStatus: s.objective,
      flashlightOn: s.flashlightOn,
      hasKey: s.hasKey,
      hasCrest: s.hasCrest,
      gateUnlocked: s.gateUnlocked,
      inspectingText: s.inspectingText,
    };
  }

  getHoverPrompt(): string | null {
    return useHorrorStore.getState().hoverPrompt;
  }

  dismissInspect(): void {
    useHorrorStore.getState().dismissInspect();
  }

  resetMatch(): void {
    useHorrorStore.getState().resetQuest();
    if (this.items?.keyEntity.native.three?.object) this.items.keyEntity.native.three.object.visible = true;
    if (this.items?.crestEntity.native.three?.object) this.items.crestEntity.native.three.object.visible = true;
    this.playerPos.set(0, 1.6, 6);
    this.yawAngle = 0;
    this.pitchAngle = 0;
  }

  dispose(): void {
    for (const unbind of this.unbindInput) unbind();
    this.engine.dispose();
  }
}
