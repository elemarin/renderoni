/**
 * Skyward Courier — Isle of Aeolus
 *
 * Modular Pure TypeScript Architecture:
 * - models/ (AerobaticPlane, AirportIsland, WaypointRings)
 * - state.ts (Aerodynamic Telemetry Store)
 * - audio.ts (Flight Sound Synthesizer)
 */

import * as THREE from 'three';
import { RenderoniEngine } from '../../../core/engine.js';
import { model, light } from '../../../presets/index.js';
import { useFlightStore, type FlightPhase } from './state.js';
import { flightSfx } from './audio.js';
import { buildAerobaticPlane, type AircraftRig } from './models/AerobaticPlane.js';
import { buildAirportIsland } from './models/AirportIsland.js';
import { buildWaypointRings, type RingData } from './models/WaypointRings.js';

export interface FlightTelemetry {
  speedKmh: number;
  altitudeM: number;
  verticalSpeedMs: number;
  throttlePercent: number;
  flightPhase: FlightPhase;
  phaseLabel: string;
  engineRunning: boolean;
  wheelBrakes: boolean;
  ringsCleared: number;
  totalRings: number;
  viewMode: 'cockpit' | 'outside';
  objective: string;
}

export class SkywardCourierGame {
  public engine: RenderoniEngine;
  public canvas: HTMLCanvasElement;

  private planeRig: AircraftRig | null = null;
  private rings: RingData[] = [];
  private keys: Record<string, boolean> = {};
  private unbind: Array<() => void> = [];

  // Dynamic Flight Vectors
  private aircraftPos = new THREE.Vector3(0, 1.2, 20); // South threshold on runway 36
  private aircraftQuat = new THREE.Quaternion();
  private velocity = new THREE.Vector3(0, 0, 0);
  private airspeed = 0;
  private throttle = 0;
  private engineRunning = false;
  private brakes = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, 0, 0],
      loop: {
        enabled: true,
        title: 'Skyward Courier',
        subtitle: 'Hold W or Shift to accelerate, pull up (S/Down) to take off, fly the 6 rings, and land on Runway 36.',
      },
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    const camera = this.engine.native.camera;

    camera.fov = 65;
    camera.near = 0.5;
    camera.far = 4000;
    camera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x38bdf8); // Tropical sky
    scene.fog = new THREE.FogExp2(0x7dd3fc, 0.00075);

    // Sun light
    this.engine.add(light({ type: 'directional', color: 0xfffbeb, intensity: 2.2, position: [150, 300, 100] }));
    this.engine.add(light({ type: 'ambient', color: 0x93c5fd, intensity: 0.8 }));

    // 1. Build Airport Island & 600m Runway
    buildAirportIsland(this.engine);

    // 2. Build Aerobatic Monoplane
    this.planeRig = buildAerobaticPlane();
    this.planeRig.root.position.copy(this.aircraftPos);

    this.engine.add(
      model({
        id: 'aircraft_monoplane',
        object: this.planeRig.root,
        position: [this.aircraftPos.x, this.aircraftPos.y, this.aircraftPos.z],
        physics: 'none',
        tags: ['player', 'aircraft', 'vehicle'],
        state: { airspeedKmh: 0, altitudeM: 0, engineRunning: false },
      })
    );

    // 3. Build Slalom Waypoint Rings
    this.rings = buildWaypointRings(this.engine);

    // 4. Register Actions
    this.setupActions();

    // 5. Bind Controls
    this.bindControls();

    // 6. Run gameplay on Renderoni's deterministic fixed-tick scheduler
    this.engine.systems.add({
      phase: 'prePhysics',
      update: ({ dt }) => this.update(dt),
    });
    this.engine.loop.start();
    this.engine.start();
  }

  private setupActions(): void {
    this.engine.actions.register({
      name: 'flight.startEngine',
      handle: () => {
        this.engineRunning = !this.engineRunning;
        useFlightStore.getState().toggleEngine();
      },
    });

    this.engine.actions.register({
      name: 'flight.setThrottle',
      handle: (payload?: { percent: number }) => {
        const val = Math.max(0, Math.min(100, payload?.percent ?? 100));
        this.throttle = val / 100;
        useFlightStore.getState().setThrottle(val);
      },
    });

    this.engine.actions.register({
      name: 'flight.toggleView',
      handle: () => {
        useFlightStore.getState().toggleViewMode();
      },
    });
    this.engine.actions.register({
      name: 'flight.reset',
      handle: () => this.resetFlight(),
    });
    this.engine.actions.register({
      name: 'flight.setBrakes',
      handle: (pressed?: boolean) => {
        this.engine.input.setButton(
          'brake',
          pressed ?? !this.engine.input.isButtonPressed('brake')
        );
      },
    });
  }

  private update(dt: number): void {
    if ((window as unknown as { __renderoniPaused?: boolean }).__renderoniPaused) return;
    const plane = this.planeRig;
    if (!plane) return;

    const keys = this.keys;
    const mobileMove = this.engine.input.getMoveVector();
    if (this.engine.input.consumeButtonPress('engine')) this.startEngine();
    if (this.engine.input.consumeButtonPress('view')) this.toggleView();

    // 1. Auto-Start & Throttle Input (W, Shift, Space accelerate)
    if (keys['KeyW'] || keys['ShiftLeft'] || keys['ShiftRight'] || keys['Space']
      || this.engine.input.isButtonPressed('throttle')) {
      if (!this.engineRunning) {
        this.engineRunning = true;
        useFlightStore.getState().toggleEngine();
      }
      this.throttle = Math.min(1.0, this.throttle + dt * 0.8);
    }
    if (keys['ControlLeft'] || keys['ControlRight'] || keys['KeyZ']) {
      this.throttle = Math.max(0.0, this.throttle - dt * 0.6);
    }
    useFlightStore.getState().setThrottle(Math.round(this.throttle * 100));

    // Brakes
    this.brakes = !!keys['KeyB'] || this.engine.input.isButtonPressed('brake');
    useFlightStore.getState().setBrakes(this.brakes);

    // 2. Propeller Spin & Audio
    if (this.engineRunning) {
      plane.propeller.rotation.z += (30 + this.throttle * 80) * dt;
    }
    flightSfx.updateEngineAudio(this.engineRunning, this.throttle, this.airspeed * 3.6);

    // 3. Flight Dynamics & Aerodynamics
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.aircraftQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.aircraftQuat);
    const onGround = this.aircraftPos.y <= 1.25;

    // Flight Controls (Smooth Responsive Flight Stick)
    const controlEff = Math.min(1.0, Math.max(0.3, this.airspeed / 12.0));
    const rotDelta = new THREE.Euler(0, 0, 0, 'YXZ');

    // Pitch: S or Down Arrow = Pitch UP / Climb; Up Arrow = Pitch DOWN / Dive
    if (keys['KeyS'] || keys['ArrowDown']) {
      rotDelta.x += (onGround ? 0.9 : 1.6) * controlEff * dt;
    }
    if (keys['ArrowUp']) {
      rotDelta.x -= 1.6 * controlEff * dt;
    }

    // Roll / Turn: A/D or Left/Right Arrow
    if (keys['KeyA'] || keys['ArrowLeft']) {
      if (onGround) rotDelta.y += 1.2 * dt;
      else rotDelta.z += 2.4 * controlEff * dt;
    }
    if (keys['KeyD'] || keys['ArrowRight']) {
      if (onGround) rotDelta.y -= 1.2 * dt;
      else rotDelta.z -= 2.4 * controlEff * dt;
    }
    if (Math.abs(mobileMove.z) > 0.05) {
      rotDelta.x += mobileMove.z * (onGround ? 0.9 : 1.6) * controlEff * dt;
    }
    if (Math.abs(mobileMove.x) > 0.05) {
      if (onGround) rotDelta.y -= mobileMove.x * 1.2 * dt;
      else rotDelta.z -= mobileMove.x * 2.4 * controlEff * dt;
    }
    if (keys['KeyQ']) rotDelta.y += 1.2 * controlEff * dt;
    if (keys['KeyE']) rotDelta.y -= 1.2 * controlEff * dt;

    const deltaQuat = new THREE.Quaternion().setFromEuler(rotDelta);
    this.aircraftQuat.multiply(deltaQuat);

    const maxThrust = 18;
    const thrust = this.engineRunning ? forward.clone().multiplyScalar(this.throttle * maxThrust) : new THREE.Vector3();
    const dragCoeff = onGround && this.brakes ? 1.4 : 0.16;
    const drag = this.velocity.clone().multiplyScalar(-dragCoeff);

    const rotateSpeed = 16;
    const canLift = !onGround || (this.airspeed > rotateSpeed && this.throttle > 0.55);
    const liftCoeff = 0.012;
    const dynamicLift = canLift ? this.airspeed * this.airspeed * liftCoeff : 0;
    const lift = up.clone().multiplyScalar(Math.min(dynamicLift, 22));
    const gravity = new THREE.Vector3(0, onGround && !canLift ? 0 : -9.81, 0);

    const totalAccel = new THREE.Vector3().add(thrust).add(drag).add(gravity).add(lift);
    this.velocity.addScaledVector(totalAccel, dt);
    const maxSpeed = 42;
    if (this.velocity.length() > maxSpeed) this.velocity.setLength(maxSpeed);

    // Runway Ground Interaction
    if (this.aircraftPos.y <= 1.2) {
      this.aircraftPos.y = 1.2;
      if (this.velocity.y < 0) {
        if (this.velocity.y < -3.5) {
          flightSfx.playTireScreech();
        }
        this.velocity.y = 0;
      }
      if (this.brakes) {
        this.velocity.x *= 0.94;
        this.velocity.z *= 0.94;
      }
    }

    this.aircraftPos.addScaledVector(this.velocity, dt);
    this.airspeed = this.velocity.length();

    // 4. Slalom Ring Collision Check
    this.rings.forEach((ring) => {
      if (!ring.cleared && ring.pos.distanceTo(this.aircraftPos) < ring.radius + 3.0) {
        ring.cleared = true;
        (ring.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x22c55e);
        (ring.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x16a34a);
        flightSfx.playRingChime();

        const clearedCount = this.rings.filter((r) => r.cleared).length;
        useFlightStore.getState().setTelemetry({ ringsCleared: clearedCount });

        if (clearedCount === this.rings.length) {
          this.engine.loop.win('Slalom Course Complete! Great Flying!');
        }
      }
    });

    // 5. Update Plane 3D Hierarchy
    plane.root.position.copy(this.aircraftPos);
    plane.root.quaternion.copy(this.aircraftQuat);

    // 6. Camera Tracking
    const camera = this.engine.native.camera;
    if (camera) {
      const mode = useFlightStore.getState().viewMode;
      if (mode === 'cockpit') {
        const cPos = new THREE.Vector3();
        plane.cockpitPos.getWorldPosition(cPos);
        camera.position.copy(cPos);
        camera.quaternion.copy(this.aircraftQuat);
      } else {
        const targetPos = new THREE.Vector3();
        plane.tailCameraPos.getWorldPosition(targetPos);
        camera.position.lerp(targetPos, 0.15);
        camera.lookAt(this.aircraftPos);
      }
    }

    // 7. Store Telemetry
    const speedKmh = Math.round(this.airspeed * 3.6);
    const altM = Math.max(0, Math.round(this.aircraftPos.y - 1.2));
    const vsMs = parseFloat(this.velocity.y.toFixed(1));

    let phase: FlightPhase = 'parked';
    let phaseLabel = 'PARKED ON RUNWAY';
    if (!this.engineRunning) {
      phase = 'parked';
      phaseLabel = 'PARKED (HOLD W OR SHIFT TO FLY)';
    } else if (onGround && speedKmh < 10) {
      phase = 'taxi';
      phaseLabel = 'TAXI (GROUND ROLL)';
    } else if (onGround && speedKmh >= 10) {
      phase = 'takeoff_roll';
      phaseLabel = 'TAKEOFF ROLL — PULL (S/DOWN) TO CLIMB';
    } else {
      phase = 'airborne';
      phaseLabel = 'AIRBORNE SLALOM';
    }

    useFlightStore.getState().setTelemetry({
      speedKmh,
      altitudeM: altM,
      verticalSpeedMs: vsMs,
      flightPhase: phase,
      phaseLabel,
    });
  }

  private bindControls(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyI') {
        this.engine.act({ name: 'flight.startEngine' });
      }
      if (e.code === 'KeyV' || e.code === 'KeyC') {
        this.engine.act({ name: 'flight.toggleView' });
      }
      this.keys[e.code] = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.engine.input.attachMobileControls({
      buttons: [
        { name: 'throttle', label: 'GO', ariaLabel: 'Hold for throttle' },
        { name: 'brake', label: 'BRAKE' },
        { name: 'engine', label: 'START', ariaLabel: 'Toggle engine' },
        { name: 'view', label: 'VIEW', ariaLabel: 'Change camera view' },
      ],
      joystickColor: '#38bdf8',
    });
    this.unbind.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });
  }

  startEngine(): void {
    this.engine.act({ name: 'flight.startEngine' });
  }

  setThrottle(percent: number): void {
    this.engine.act({ name: 'flight.setThrottle', payload: { percent } });
  }

  toggleView(): void {
    this.engine.act({ name: 'flight.toggleView' });
  }

  toggleCameraView(): void {
    this.toggleView();
  }

  resetPlane(): void {
    this.resetFlight();
  }

  getTelemetry(): FlightTelemetry {
    return useFlightStore.getState();
  }

  resetFlight(): void {
    useFlightStore.getState().resetFlight();
    this.aircraftPos.set(0, 1.2, 20);
    this.aircraftQuat.identity();
    this.velocity.set(0, 0, 0);
    this.airspeed = 0;
    this.throttle = 0;
    this.engineRunning = false;
    this.brakes = false;
    this.engine.input.setButton('brake', false);
  }

  dispose(): void {
    for (const unbind of this.unbind) unbind();
    flightSfx.stop();
    this.engine.dispose();
  }
}
