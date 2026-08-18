/**
 * Renderoni Web Demo: KSP-Style Smooth Aeroplane Flight Simulator
 *
 * KSP Flight Control Mapping:
 * - W / S: Pitch Down / Pitch Up
 * - A / D: Yaw / Turn Left / Right
 * - Q / E: Roll Left / Right (Rotation)
 * - Shift / Ctrl: Throttle Up / Down
 * - Z: Max Throttle (100%) | X: Cut Throttle (0%)
 * - G: Landing Gear | C: Camera View | R: Reset
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RenderoniEngine } from '../core/engine.js';
import { body } from '../presets/body.js';
import { light } from '../presets/light.js';
import { sfx } from './audio-sfx.js';

export type CameraViewMode = 'chase' | 'cockpit';

export interface FlightTelemetry {
  altitude: number;
  speed: number;
  throttle: number;
  heading: number;
  gearDown: boolean;
  viewMode: CameraViewMode;
  flightState: string;
  ringsCollected: number;
  totalRings: number;
}

interface RingCheckpoint {
  mesh: THREE.Mesh;
  position: [number, number, number];
  collected: boolean;
}

export class FlightGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;
  private planeMesh!: THREE.Group;
  private propellerMesh!: THREE.Mesh;
  private landingGearGroup!: THREE.Group;
  private planeBody!: RAPIER.RigidBody;
  private engineSound = sfx.createFlightEngine();

  // Flight Controls & State - Starts parked with 0% throttle
  private throttle = 0.0;
  private smoothThrottle = 0.0;
  private pitchInput = 0;
  private rollInput = 0;
  private yawInput = 0;
  private keys: Record<string, boolean> = {};

  // Landing Gear & Camera
  private gearDown = true;
  private gearAnim = 1.0;
  private viewMode: CameraViewMode = 'chase';
  private smoothCamPos = new THREE.Vector3(0, 10, 280);

  // Checkpoint Rings
  private rings: RingCheckpoint[] = [];
  private ringsCollected = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -9.81, 0],
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    scene.background = new THREE.Color(0x60a5fa);
    scene.fog = new THREE.FogExp2(0x60a5fa, 0.0012);

    // 1. Lighting & Sun
    this.engine.add(light({ type: 'directional', intensity: 2.5, position: [120, 250, 120] }));
    this.engine.add(light({ type: 'ambient', intensity: 0.65, color: 0xe0f2fe }));

    // 2. World Archipelago & Runway Island
    this.buildWorld(scene);

    // 3. 3D Airplane Model
    this.buildAirplane(scene);

    // 4. Aerial Course (Floating Golden Rings)
    this.buildRingCourse(scene);

    // 5. Setup Controls
    this.setupControls();

    // 6. Smooth Flight Dynamics System
    this.engine.systems.add({
      phase: 'prePhysics',
      update: () => {
        this.updateFlightPhysics();
      },
    });

    // Actions
    this.engine.actions.register({
      name: 'flight.throttle',
      handle: (val: any) => this.setThrottle(typeof val === 'number' ? val : (val?.value ?? 0.0)),
    });

    this.engine.actions.register({
      name: 'flight.toggleGear',
      handle: () => this.toggleLandingGear(),
    });

    this.engine.actions.register({
      name: 'flight.toggleCamera',
      handle: () => this.toggleCameraView(),
    });

    this.engine.actions.register({
      name: 'flight.reset',
      handle: () => this.resetPlane(),
    });

    // Start Sound
    this.engineSound.start();
    this.engineSound.setThrottle(0.0);

    // Start presentation loop
    this.engine.start((dt) => this.update(dt));
  }

  private buildWorld(scene: THREE.Scene): void {
    // Ocean Water Plane
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1e40af,
      roughness: 0.15,
      metalness: 0.6,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0;
    scene.add(ocean);

    // Static Ground/Ocean Physics
    this.engine.add(
      body({
        id: 'ocean_ground',
        shape: 'box',
        type: 'fixed',
        size: [5000, 2, 5000],
        position: [0, -1, 0],
      })
    );

    // Runway Island Base
    const runwayIsland = new THREE.Mesh(
      new THREE.BoxGeometry(120, 6, 800),
      new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 })
    );
    runwayIsland.position.set(0, 3, 0);
    scene.add(runwayIsland);

    // Runway Physics Body (Elevation y = 6.0)
    this.engine.add(
      body({
        id: 'runway_ground',
        shape: 'box',
        type: 'fixed',
        size: [120, 6, 800],
        position: [0, 3, 0],
      })
    );

    // Runway Tarmac
    const tarmac = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 760),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    );
    tarmac.rotation.x = -Math.PI / 2;
    tarmac.position.set(0, 6.02, 0);
    scene.add(tarmac);

    // White Runway Stripes
    for (let z = -340; z <= 340; z += 24) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 14),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 6.04, z);
      scene.add(stripe);
    }

    // Mountain Islands Archipelago
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });

    const islandCoords = [
      { x: -550, z: -650, r: 280, h: 160 },
      { x: 650, z: -800, r: 340, h: 200 },
      { x: 500, z: 550, r: 290, h: 160 },
      { x: -650, z: 500, r: 310, h: 170 },
      { x: 0, z: -1400, r: 420, h: 280 },
    ];

    islandCoords.forEach((isl) => {
      const isMesh = new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r * 1.3, 12, 16), islandMat);
      isMesh.position.set(isl.x, 4, isl.z);
      scene.add(isMesh);

      const peak = new THREE.Mesh(new THREE.ConeGeometry(isl.r * 0.75, isl.h, 14), mountainMat);
      peak.position.set(isl.x, isl.h / 2 + 8, isl.z);
      scene.add(peak);
    });

    // Clouds
    const cloudGeo = new THREE.DodecahedronGeometry(24, 1);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, transparent: true, opacity: 0.9 });

    for (let i = 0; i < 50; i++) {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(
        (Math.random() - 0.5) * 2600,
        150 + Math.random() * 100,
        (Math.random() - 0.5) * 2600
      );
      cloud.scale.set(1.2 + Math.random(), 0.5, 1.2 + Math.random() * 1.8);
      scene.add(cloud);
    }
  }

  private buildAirplane(scene: THREE.Scene): void {
    this.planeMesh = new THREE.Group();

    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.3, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.2, roughness: 0.3 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.75 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.3 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });

    // Fuselage
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 4.8, 16), redMat);
    fuselage.rotation.x = Math.PI / 2;
    this.planeMesh.add(fuselage);

    // Nose Cone (-Z forward)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 16), redMat);
    nose.position.z = -2.9;
    nose.rotation.x = -Math.PI / 2;
    this.planeMesh.add(nose);

    // Propeller Hub
    const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), darkMat);
    propHub.position.z = -3.45;
    propHub.rotation.x = -Math.PI / 2;

    this.propellerMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 0.03), darkMat);
    propHub.add(this.propellerMesh);
    this.planeMesh.add(propHub);

    // Cockpit Canopy & Dashboard
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), canopyMat);
    canopy.position.set(0, 0.4, -0.7);
    canopy.scale.set(0.75, 0.75, 1.6);
    this.planeMesh.add(canopy);

    const dashboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x111827 })
    );
    dashboard.position.set(0, 0.32, -1.1);
    this.planeMesh.add(dashboard);

    // Wings
    const wings = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.08, 1.4), whiteMat);
    wings.position.set(0, 0.06, -0.5);
    this.planeMesh.add(wings);

    // Wingtips
    const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    redLight.position.set(-4.1, 0.06, -0.5);
    const greenLight = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    greenLight.position.set(4.1, 0.06, -0.5);
    this.planeMesh.add(redLight, greenLight);

    // Tail Stabilizers & Vertical Fin
    const tailElevators = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.8), whiteMat);
    tailElevators.position.set(0, 0.12, 2.1);
    this.planeMesh.add(tailElevators);

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.9), redMat);
    tailFin.position.set(0, 0.72, 2.0);
    this.planeMesh.add(tailFin);

    // Landing Gear Group
    this.landingGearGroup = new THREE.Group();

    const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), chromeMat);
    noseStrut.position.set(0, -0.35, -1.8);
    const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 16), darkMat);
    noseWheel.rotation.z = Math.PI / 2;
    noseWheel.position.set(0, -0.65, -1.8);
    this.landingGearGroup.add(noseStrut, noseWheel);

    const leftStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), chromeMat);
    leftStrut.position.set(-1.2, -0.35, 0.2);
    const leftWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), darkMat);
    leftWheel.rotation.z = Math.PI / 2;
    leftWheel.position.set(-1.2, -0.65, 0.2);
    this.landingGearGroup.add(leftStrut, leftWheel);

    const rightStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), chromeMat);
    rightStrut.position.set(1.2, -0.35, 0.2);
    const rightWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), darkMat);
    rightWheel.rotation.z = Math.PI / 2;
    rightWheel.position.set(1.2, -0.65, 0.2);
    this.landingGearGroup.add(rightStrut, rightWheel);

    this.planeMesh.add(this.landingGearGroup);
    scene.add(this.planeMesh);

    // Stable Horizontal Physics Body
    this.planeBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 6.7, 260.0)
        .setAdditionalMass(6.0)
        .setLinearDamping(0.03)
        .setAngularDamping(5.0) // Strong damping prevents crazy spinning
        .setCanSleep(false)
    );

    const planeCollider = this.engine.native.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.5, 0.35, 2.2).setDensity(0.01).setFriction(0.0).setRestitution(0.0),
      this.planeBody
    );

    this.engine.add({
      id: 'flight_aircraft',
      tags: ['aircraft', 'player'],
      native: {
        three: { object: this.planeMesh },
        rapier: { body: this.planeBody, colliders: [planeCollider] },
      },
    });
  }

  private buildRingCourse(scene: THREE.Scene): void {
    const ringGeo = new THREE.TorusGeometry(9.0, 0.45, 16, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0x78350f,
      roughness: 0.2,
      metalness: 0.8,
    });

    const waypoints: Array<[number, number, number]> = [
      [0, 22, 100],
      [0, 42, -80],
      [45, 62, -260],
      [140, 82, -440],
      [80, 98, -660],
      [-120, 102, -700],
      [-260, 88, -500],
      [-220, 65, -260],
      [-80, 45, -70],
      [0, 28, 140],
    ];

    waypoints.forEach((pt) => {
      const mesh = new THREE.Mesh(ringGeo, ringMat.clone());
      mesh.position.set(pt[0], pt[1], pt[2]);
      mesh.rotation.y = Math.atan2(pt[0], pt[2]) + Math.PI / 2;
      scene.add(mesh);

      this.rings.push({
        mesh,
        position: pt,
        collected: false,
      });
    });
  }

  private setupControls(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;

      // KSP Quick Throttle Shortcuts
      if (e.code === 'KeyZ' || e.key.toLowerCase() === 'z') {
        this.setThrottle(1.0);
      } else if (e.code === 'KeyX' || e.key.toLowerCase() === 'x') {
        this.setThrottle(0.0);
      } else if (e.code === 'KeyG' || e.key.toLowerCase() === 'g') {
        this.toggleLandingGear();
      } else if (e.code === 'KeyC' || e.key.toLowerCase() === 'c') {
        this.toggleCameraView();
      } else if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
        this.resetPlane();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  private updateFlightPhysics(): void {
    if (!this.planeBody) return;

    // 1. KSP-Style Controls:
    // W / S: Pitch Down / Pitch Up
    this.pitchInput = 0;
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) this.pitchInput += 1;
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) this.pitchInput -= 1;

    // A / D: Yaw / Turn Left / Right
    this.yawInput = 0;
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) this.yawInput += 1;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) this.yawInput -= 1;

    // Q / E: Roll Left / Right (Rotation)
    this.rollInput = 0;
    if (this.keys['KeyQ'] || this.keys['q']) this.rollInput += 1;
    if (this.keys['KeyE'] || this.keys['e']) this.rollInput -= 1;

    // Shift / Ctrl: Smooth Throttle adjustments
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
      this.setThrottle(this.throttle + 0.015);
    }
    if (this.keys['ControlLeft'] || this.keys['ControlRight']) {
      this.setThrottle(this.throttle - 0.015);
    }

    // 2. Smooth Throttle Interpolation
    this.smoothThrottle += (this.throttle - this.smoothThrottle) * 0.1;
    this.engineSound.setThrottle(this.smoothThrottle);

    // 3. Compute Airplane Orientation
    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);

    // Current Velocity & Airspeed
    const vel = this.planeBody.linvel();
    const velVec = new THREE.Vector3(vel.x, vel.y, vel.z);
    const forwardSpeed = Math.max(0, velVec.dot(forward));
    const pos = this.planeBody.translation();
    const isLanded = pos.y <= 7.1 && Math.abs(pos.x) < 40;

    // 4. Engine Forward Thrust
    const maxThrust = 1600.0;
    const thrustForce = forward.clone().multiplyScalar(maxThrust * this.smoothThrottle);

    // 5. Smooth Aerodynamic Lift
    let liftMagnitude = 0;
    if (forwardSpeed > 3.0) {
      const baseLift = Math.pow(forwardSpeed / 16.0, 1.8) * 80.0;
      const pitchClimbBoost = this.pitchInput > 0 ? 140.0 : 0;
      liftMagnitude = Math.min(650.0, baseLift + pitchClimbBoost);
    }
    const liftForce = up.clone().multiplyScalar(liftMagnitude);

    // 6. Aerodynamic Drag
    const dragCoeff = this.gearDown ? -0.08 : -0.04;
    const dragForce = velVec.clone().multiplyScalar(dragCoeff * Math.max(1.0, forwardSpeed));

    // Ground Wheel Leveling (Prevent flipping on the runway)
    let groundNormal = new THREE.Vector3(0, 0, 0);
    if (isLanded) {
      if (pos.y < 6.75 && vel.y < 0) {
        groundNormal = new THREE.Vector3(0, -vel.y * 3.0, 0);
      }
    }

    // Apply Linear Forces
    const totalForce = thrustForce.add(liftForce).add(dragForce).add(groundNormal);
    this.planeBody.applyImpulse(
      new RAPIER.Vector3(totalForce.x * 0.0166, totalForce.y * 0.0166, totalForce.z * 0.0166),
      true
    );

    // 7. Smooth Control Torques (Scaled to prevent oversteer/snapping)
    const controlScale = Math.min(1.0, Math.max(0.25, forwardSpeed / 10.0));
    const pitchTorque = right.clone().multiplyScalar(this.pitchInput * 26.0 * controlScale);
    const yawTorque = up.clone().multiplyScalar(this.yawInput * 18.0 * controlScale);
    const rollTorque = forward.clone().multiplyScalar(this.rollInput * 28.0 * controlScale);

    // Aerodynamic self-leveling stability assist when controls are neutral
    let stabilityTorque = new THREE.Vector3(0, 0, 0);
    if (!isLanded) {
      if (this.rollInput === 0 && Math.abs(right.y) > 0.08) {
        stabilityTorque.add(forward.clone().multiplyScalar(-right.y * 14.0));
      }
    } else {
      // Keep level on runway
      if (this.pitchInput <= 0) {
        this.planeBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);
      }
    }

    const totalTorque = pitchTorque.add(yawTorque).add(rollTorque).add(stabilityTorque);
    this.planeBody.applyTorqueImpulse(
      new RAPIER.Vector3(totalTorque.x * 0.0166, totalTorque.y * 0.0166, totalTorque.z * 0.0166),
      true
    );

    // Check Ring Course
    this.checkRingCollection();
  }

  private checkRingCollection(): void {
    if (!this.planeBody) return;
    const p = this.planeBody.translation();

    for (const ring of this.rings) {
      if (!ring.collected) {
        const d = Math.hypot(p.x - ring.position[0], p.y - ring.position[1], p.z - ring.position[2]);
        if (d < 11.0) {
          ring.collected = true;
          this.ringsCollected++;
          (ring.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x10b981);
          (ring.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x059669);
          sfx.playRingCollect();
          this.engine.events.emit('ring.collected', { index: this.ringsCollected });
        }
      }
    }
  }

  setThrottle(val: number): void {
    this.throttle = Math.max(0.0, Math.min(1.0, val));
  }

  toggleLandingGear(): void {
    this.gearDown = !this.gearDown;
    this.engine.events.emit('flight.gear', { gearDown: this.gearDown });
  }

  toggleCameraView(): void {
    this.viewMode = this.viewMode === 'chase' ? 'cockpit' : 'chase';
    this.engine.events.emit('flight.camera', { viewMode: this.viewMode });
  }

  resetPlane(): void {
    if (!this.planeBody) return;
    this.planeBody.setTranslation(new RAPIER.Vector3(0, 6.7, 260.0), true);
    this.planeBody.setRotation(new RAPIER.Quaternion(0, 0, 0, 1), true);
    this.planeBody.setLinvel(new RAPIER.Vector3(0, 0, 0), true);
    this.planeBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);
    this.throttle = 0.0;
    this.smoothThrottle = 0.0;
    this.gearDown = true;
    this.gearAnim = 1.0;
    this.engineSound.setThrottle(0.0);
    this.ringsCollected = 0;
    this.rings.forEach((r) => {
      r.collected = false;
      (r.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xf59e0b);
      (r.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x78350f);
    });
  }

  getTelemetry(): FlightTelemetry {
    if (!this.planeBody) {
      return {
        altitude: 0,
        speed: 0,
        throttle: this.throttle,
        heading: 0,
        gearDown: this.gearDown,
        viewMode: this.viewMode,
        flightState: 'Parked',
        ringsCollected: 0,
        totalRings: 10,
      };
    }

    const pos = this.planeBody.translation();
    const vel = this.planeBody.linvel();
    const speedKmh = Math.hypot(vel.x, vel.y, vel.z) * 3.6;

    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const heading = ((Math.atan2(forward.x, forward.z) * 180) / Math.PI + 360) % 360;

    let flightState = 'Parked';
    if (pos.y > 8.0) {
      flightState = 'Airborne';
    } else if (speedKmh > 55.0) {
      flightState = 'Rotate (Pull S)';
    } else if (this.throttle > 0.05) {
      flightState = 'Takeoff Roll';
    }

    return {
      altitude: Math.max(0, parseFloat((pos.y - 6.0).toFixed(1))),
      speed: parseFloat(speedKmh.toFixed(1)),
      throttle: parseFloat(this.throttle.toFixed(2)),
      heading: Math.round(heading),
      gearDown: this.gearDown,
      viewMode: this.viewMode,
      flightState,
      ringsCollected: this.ringsCollected,
      totalRings: this.rings.length,
    };
  }

  update(dt: number): void {
    if (!this.planeBody) return;

    // Spin Propeller
    if (this.propellerMesh) {
      this.propellerMesh.rotation.z += (15.0 + this.smoothThrottle * 80.0) * dt;
    }

    // Smooth Gear Retraction
    const targetGearAnim = this.gearDown ? 1.0 : 0.0;
    this.gearAnim += (targetGearAnim - this.gearAnim) * 0.08;
    if (this.landingGearGroup) {
      this.landingGearGroup.position.y = (this.gearAnim - 1.0) * 0.45;
      this.landingGearGroup.scale.set(1.0, Math.max(0.01, this.gearAnim), 1.0);
      this.landingGearGroup.visible = this.gearAnim > 0.05;
    }

    const pos = this.planeBody.translation();
    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const camera = this.engine.native.camera;

    if (this.viewMode === 'cockpit') {
      const cockpitEye = new THREE.Vector3(0, 0.48, -0.6).applyQuaternion(q);
      camera.position.set(pos.x + cockpitEye.x, pos.y + cockpitEye.y, pos.z + cockpitEye.z);

      const lookAhead = new THREE.Vector3(0, 0.45, -20).applyQuaternion(q);
      camera.lookAt(pos.x + lookAhead.x, pos.y + lookAhead.y, pos.z + lookAhead.z);
    } else {
      const behindOffset = new THREE.Vector3(0, 2.6, 12.0).applyQuaternion(q);
      const targetCamPos = new THREE.Vector3(pos.x, pos.y, pos.z).add(behindOffset);

      this.smoothCamPos.lerp(targetCamPos, 0.18);
      camera.position.copy(this.smoothCamPos);

      const lookTarget = new THREE.Vector3(pos.x, pos.y + 0.6, pos.z).add(
        new THREE.Vector3(0, 0, -4).applyQuaternion(q)
      );
      camera.lookAt(lookTarget);
    }
  }

  dispose(): void {
    this.engineSound.stop();
    this.engine.dispose();
  }
}
