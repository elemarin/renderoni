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
import { buildManorArchitecture, type ManorArchitectureResult } from './models/ManorHallway.js';
import { buildGrandfatherClockModel, type ClockModelResult } from './models/GrandfatherClock.js';
import { buildFlashlightRig, type FlashlightRig } from './models/Flashlight.js';
import { buildQuestItems, type QuestItemsResult } from './models/Items.js';
import { clockHandRotations } from './models/VictorianWallClock.js';

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
  private doors: ManorArchitectureResult | null = null;

  // First-Person Camera & Movement State
  private playerPos = new THREE.Vector3(0, 1.55, 6);
  private yawAngle = 0.0;
  private pitchAngle = 0.0;
  private isLocked = false;
  private isMouseDown = false;
  private keys: Record<string, boolean> = {};
  private unbindInput: Array<() => void> = [];
  private _camForward = new THREE.Vector3();
  private _toTarget = new THREE.Vector3();

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

    // 1. Spawn First-Person KCC Character Controller Entity
    const startPos: [number, number, number] = [0, 0.9, 6];
    this.playerEntity = this.engine.add(
      kccPlayer({
        id: 'hero_player',
        position: startPos,
        height: 1.4,
        radius: 0.35,
        moveSpeed: 4.0,
        jumpSpeed: 0,
        gravity: 15.0,
        state: { flashlightOn: true },
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

    // 3. Build Manor Architecture, Sconces, Doors & Atmosphere
    this.doors = buildManorArchitecture(this.engine);

    // 4. Build Victorian Wall Clock puzzle (Room 3, [-8, 0, -14])
    this.clockModel = buildGrandfatherClockModel(this.engine, -8, 0, -14);

    // 5. Build Quest Items (Desk, Key, Crest, Gate)
    this.items = buildQuestItems(this.engine);

    // 6. Register Action Handlers for Agent & UI
    this.setupActions();

    // 7. Bind Controls
    this.bindControls();

    // 8. Start Match Loop & Presentation Loop
    this.engine.loop.start();
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
        if (this.playerEntity) this.playerEntity.state.hasKey = true;
      },
    });

    this.engine.actions.register({
      name: 'quest.solveClock',
      handle: () => {
        horrorSfx.playClockChime();
        useHorrorStore.getState().solveClock();
        if (this.clockModel) {
          const solvedTime = clockHandRotations(11, 45);
          this.clockModel.hourHand.rotation.z = solvedTime.hour;
          this.clockModel.minuteHand.rotation.z = solvedTime.minute;
          const bcObj = this.clockModel.secretBookcase.native.three?.object;
          if (bcObj) {
            bcObj.position.x += 1.8;
            bcObj.position.z += 0.8;
          }
        }
        if (this.playerEntity) this.playerEntity.state.clockSolved = true;
      },
    });

    this.engine.actions.register({
      name: 'quest.pickupCrest',
      handle: () => {
        horrorSfx.playItemPickup();
        useHorrorStore.getState().pickupCrest();
        const crestObj = this.items?.crestEntity.native.three?.object;
        if (crestObj) crestObj.visible = false;
        if (this.playerEntity) this.playerEntity.state.hasCrest = true;
      },
    });

    this.engine.actions.register({
      name: 'quest.unlockGate',
      handle: () => {
        horrorSfx.playGateOpen();
        useHorrorStore.getState().unlockGate();
        if (this.playerEntity) this.playerEntity.state.gateUnlocked = true;
        const gateObj = this.items?.gateEntity.native.three?.object;
        if (gateObj) gateObj.position.y = 4.8;
        this.engine.loop.win('You escaped Blackwood Manor!');
      },
    });

    this.engine.actions.register({
      name: 'player.toggleFlashlight',
      handle: () => {
        horrorSfx.playFlashlightClick();
        useHorrorStore.getState().toggleFlashlight();
        const isOn = useHorrorStore.getState().flashlightOn;
        if (this.playerEntity) {
          this.playerEntity.state.flashlightOn = isOn;
        }
        this.flashlightRig?.setVisible(isOn);
      },
    });
  }

  private update(dt: number): void {
    if ((window as unknown as { __renderoniPaused?: boolean }).__renderoniPaused) return;
    const keys = this.keys;
    const mobileMove = this.engine.input.getMoveVector();
    const mobileLook = this.engine.input.consumeLookDelta();
    this.yawAngle -= mobileLook.dx * 0.004;
    this.pitchAngle -= mobileLook.dy * 0.004;
    this.pitchAngle = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitchAngle));

    if (this.engine.input.consumeButtonPress('interact')) this.tryInteract();
    if (this.engine.input.consumeButtonPress('flashlight')) this.toggleFlashlight();

    // 1. Smooth Keyboard Turning (ArrowLeft / ArrowRight)
    const turnSpeed = 2.4;
    if (keys['ArrowLeft']) this.yawAngle += turnSpeed * dt;
    if (keys['ArrowRight']) this.yawAngle -= turnSpeed * dt;

    // 2. 1st-Person Movement through Rapier KCC (WASD)
    const forwardX = -Math.sin(this.yawAngle);
    const forwardZ = -Math.cos(this.yawAngle);
    const rightX = Math.cos(this.yawAngle);
    const rightZ = -Math.sin(this.yawAngle);

    let dirX = forwardX * mobileMove.z + rightX * mobileMove.x;
    let dirZ = forwardZ * mobileMove.z + rightZ * mobileMove.x;
    if (keys['KeyW'] || keys['ArrowUp']) { dirX += forwardX; dirZ += forwardZ; }
    if (keys['KeyS'] || keys['ArrowDown']) { dirX -= forwardX; dirZ -= forwardZ; }
    if (keys['KeyD']) { dirX += rightX; dirZ += rightZ; }
    if (keys['KeyA']) { dirX -= rightX; dirZ -= rightZ; }

    const len = Math.hypot(dirX, dirZ);
    if (len > 0.001) {
      dirX /= len;
      dirZ /= len;
    }

    const isSprinting = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = isSprinting ? 6.2 : 3.8;
    this.playerEntity?.actions.move({ x: dirX, z: dirZ, speed });

    // 3. Update Camera Position from Physics Entity with eye level
    if (this.playerEntity) {
      const p = this.playerEntity.position;
      this.playerPos.set(p[0], p[1] + 0.65, p[2]);
    }

    const camera = this.engine.native.camera;
    if (camera) {
      camera.position.copy(this.playerPos);
      camera.quaternion.setFromEuler(new THREE.Euler(this.pitchAngle, this.yawAngle, 0, 'YXZ'));
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

    // 5. Animate Smooth Door Hinges
    if (this.doors) {
      this.doors.doorStudy.update(dt);
      this.doors.doorKey.update(dt);
      this.doors.doorClock.update(dt);
      this.doors.doorCrest.update(dt);
    }

    // 6. Animate Escape Gate Lifting on Unlock
    if (useHorrorStore.getState().gateUnlocked) {
      const gateObj = this.items?.gateEntity.native.three?.object;
      if (gateObj && gateObj.position.y < 4.8) {
        gateObj.position.y += dt * 4.0;
      }
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
    if (!prompt) return;

    // Door Interactions
    if (prompt.includes('Study Door')) {
      this.doors?.doorStudy.toggle();
    } else if (prompt.includes('Workshop Door')) {
      this.doors?.doorKey.toggle();
    } else if (prompt.includes('Clock Room Door')) {
      if (s.hasKey) {
        this.doors?.doorClock.unlock();
        this.doors?.doorClock.toggle();
      } else {
        horrorSfx.playFlashlightClick();
      }
    } else if (prompt.includes('Secret Chamber Door')) {
      if (s.clockSolved) {
        this.doors?.doorCrest.unlock();
        this.doors?.doorCrest.toggle();
      } else {
        horrorSfx.playFlashlightClick();
      }
    }
    // Clue & Item Interactions
    else if (prompt.includes('Journal')) {
      this.engine.act({ name: 'quest.readJournal' });
    } else if (prompt.includes('Take Clock Key') || prompt.includes('Key')) {
      if (!s.hasKey) {
        this.engine.act({ name: 'quest.pickupKey' });
      }
    } else if (prompt.includes('Wind Clock')) {
      if (s.hasKey && !s.clockSolved) {
        this.engine.act({ name: 'quest.solveClock' });
      } else {
        horrorSfx.playFlashlightClick();
      }
    } else if (prompt.includes('Unlock Manor Gate') || prompt.includes('Gate')) {
      if (s.hasCrest && !s.gateUnlocked) {
        this.engine.act({ name: 'quest.unlockGate' });
      } else {
        horrorSfx.playFlashlightClick();
      }
    } else if (prompt.includes('Take Blackwood Crest') || prompt.includes('Crest')) {
      if (s.clockSolved && !s.hasCrest) {
        this.engine.act({ name: 'quest.pickupCrest' });
      } else {
        horrorSfx.playFlashlightClick();
      }
    }
  }

  private updateProximityInteractions(): void {
    const s = useHorrorStore.getState();
    const camera = this.engine.native.camera;
    if (!camera) return;

    camera.getWorldDirection(this._camForward);
    const px = camera.position.x;
    const py = camera.position.y;
    const pz = camera.position.z;

    const isFacing = (tx: number, ty: number, tz: number, maxDist = 6.0): boolean => {
      this._toTarget.set(tx - px, ty - py, tz - pz);
      const dist = this._toTarget.length();
      if (dist > maxDist) return false;
      this._toTarget.normalize();
      const dot = this._camForward.dot(this._toTarget);
      return dot > 0.25 || dist < 2.5;
    };

    // 1. Interactive Manor Doors
    // Study Door ([-3.3, 1.7, 2.0])
    if (isFacing(-3.3, 1.7, 2.0, 3.8)) {
      s.setHoverPrompt(`[ E ] ${this.doors?.doorStudy.open ? 'Close' : 'Open'} Study Door`);
      return;
    }

    // Workshop Door ([3.3, 1.7, -6.0])
    if (isFacing(3.3, 1.7, -6.0, 3.8)) {
      s.setHoverPrompt(`[ E ] ${this.doors?.doorKey.open ? 'Close' : 'Open'} Workshop Door`);
      return;
    }

    // Clock Room Door ([-3.3, 1.7, -14.0])
    if (isFacing(-3.3, 1.7, -14.0, 3.8)) {
      if (this.doors?.doorClock.open) {
        s.setHoverPrompt('[ E ] Close Clock Room Door');
      } else if (s.hasKey) {
        s.setHoverPrompt('[ E ] Open Clock Room Door (Key)');
      } else {
        s.setHoverPrompt('Clock Room Door is locked. (Requires Winding Key)');
      }
      return;
    }

    // Secret Chamber Door ([3.3, 1.7, -22.0])
    if (isFacing(3.3, 1.7, -22.0, 3.8)) {
      if (this.doors?.doorCrest.open) {
        s.setHoverPrompt('[ E ] Close Secret Chamber Door');
      } else if (s.clockSolved) {
        s.setHoverPrompt('[ E ] Open Secret Chamber Door');
      } else {
        s.setHoverPrompt('Secret Chamber Door is sealed by Clock Mechanism.');
      }
      return;
    }

    // 2. Study Desk Journal (Room 1: [-8, 0.92, 2])
    if (isFacing(-8, 0.92, 2, 6.0)) {
      s.setHoverPrompt('[ E ] Read Clockmaker\'s Journal');
      return;
    }

    // 3. Key Pedestal (Room 2: [8, 1.35, -6])
    if (isFacing(8, 1.35, -6, 6.0)) {
      if (!s.hasKey) {
        s.setHoverPrompt('[ E ] Take Clock Key');
      } else {
        s.setHoverPrompt('Key Pedestal (Empty)');
      }
      return;
    }

    // 4. Victorian Wall Clock (Room 3: [-8, 2.5, -14])
    if (isFacing(-8, 2.5, -14, 6.0)) {
      if (s.clockSolved) {
        s.setHoverPrompt('Victorian Wall Clock (Set to 11:45 — Passage Open)');
      } else if (s.hasKey) {
        s.setHoverPrompt('[ E ] Wind Clock to 11:45');
      } else {
        s.setHoverPrompt('Victorian Wall Clock (Locked — Requires Winding Key)');
      }
      return;
    }

    // 5. Blackwood Crest (Room 4: [8, 1.45, -22])
    if (isFacing(8, 1.45, -22, 6.0)) {
      if (!s.hasCrest) {
        if (s.clockSolved) {
          s.setHoverPrompt('[ E ] Take Blackwood Crest');
        } else {
          s.setHoverPrompt('Blackwood Crest (Sealed by Clock Mechanism)');
        }
      } else {
        s.setHoverPrompt('Crest Altar (Empty)');
      }
      return;
    }

    // 6. Escape Gate ([0, 2.0, -29])
    if (isFacing(0, 2.0, -29, 6.5)) {
      if (s.gateUnlocked) {
        s.setHoverPrompt('Iron Gate (Unlocked — Escaped!)');
      } else if (s.hasCrest) {
        s.setHoverPrompt('[ E ] Unlock Manor Gate with Crest');
      } else {
        s.setHoverPrompt('Iron Gate (Locked — Requires Blackwood Crest)');
      }
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
      if (!this.isLocked && navigator.maxTouchPoints === 0) {
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
    this.engine.input.attachMobileControls({
      lookElement: this.canvas,
      buttons: [
        { name: 'interact', label: 'USE', ariaLabel: 'Interact' },
        { name: 'flashlight', label: 'LIGHT', ariaLabel: 'Toggle flashlight' },
      ],
      joystickColor: '#ef4444',
    });

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
