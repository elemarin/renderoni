/**
 * Renderoni Web Demo: Realistic Aeroplane Flight Simulator
 *
 * Features runway takeoff/landing, retractable landing gear (G),
 * cabin/cockpit and outside chase camera views (C), and aerodynamic flight physics.
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

  // Flight Controls & State
  private throttle = 0.0;
  private pitchInput = 0;
  private rollInput = 0;
  private yawInput = 0;
  private keys: Record<string, boolean> = {};

  // Landing Gear & Camera
  private gearDown = true;
  private gearAnim = 1.0; // 1.0 = down, 0.0 = up
  private viewMode: CameraViewMode = 'chase';
  private smoothCamPos = new THREE.Vector3(0, 10, 205);

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

    // 3. 3D Airplane Model (with Cockpit & Retractable Landing Gear)
    this.buildAirplane(scene);

    // 4. Aerial Course (Floating Golden Rings)
    this.buildRingCourse(scene);

    // 5. Setup Controls
    this.setupControls();

    // 6. Flight Dynamics System (Takeoff, Lift, Drag, Thrust, Ground Rolling)
    this.engine.systems.add({
      phase: 'prePhysics',
      update: () => {
        this.updateFlightPhysics();
      },
    });

    // Actions
    this.engine.actions.register({
      name: 'flight.throttle',
      handle: (val: number) => this.setThrottle(val),
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
    this.engineSound.setThrottle(this.throttle);

    // Start engine presentation loop with camera & gear animation
    this.engine.start((dt) => this.update(dt));
  }

  private buildWorld(scene: THREE.Scene): void {
    // Ocean Water Plane
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1e40af,
      roughness: 0.15,
      metalness: 0.6,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0;
    scene.add(ocean);

    // Static Physics Ground/Water
    this.engine.add(
      body({
        id: 'ocean_ground',
        shape: 'box',
        type: 'fixed',
        size: [4000, 2, 4000],
        position: [0, -1, 0],
      })
    );

    // Runway Island Base
    const runwayIsland = new THREE.Mesh(
      new THREE.BoxGeometry(100, 6, 600),
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
        size: [100, 6, 600],
        position: [0, 3, 0],
      })
    );

    // Runway Tarmac
    const tarmac = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 560),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    );
    tarmac.rotation.x = -Math.PI / 2;
    tarmac.position.set(0, 6.02, 0);
    scene.add(tarmac);

    // Center White Runway Stripes
    for (let z = -240; z <= 240; z += 24) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 14),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 6.04, z);
      scene.add(stripe);
    }

    // Runway Green/Red Threshold Lights
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    for (let x = -18; x <= 18; x += 6) {
      const lightStart = new THREE.Mesh(new THREE.SphereGeometry(0.3), greenMat);
      lightStart.position.set(x, 6.3, 270);
      const lightEnd = new THREE.Mesh(new THREE.SphereGeometry(0.3), redMat);
      lightEnd.position.set(x, 6.3, -270);
      scene.add(lightStart, lightEnd);
    }

    // Mountain Islands Archipelago
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });

    const islandCoords = [
      { x: -500, z: -600, r: 260, h: 140 },
      { x: 600, z: -750, r: 320, h: 180 },
      { x: 480, z: 500, r: 280, h: 150 },
      { x: -600, z: 450, r: 300, h: 160 },
      { x: 0, z: -1300, r: 400, h: 250 },
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
        (Math.random() - 0.5) * 2400,
        150 + Math.random() * 100,
        (Math.random() - 0.5) * 2400
      );
      cloud.scale.set(1.2 + Math.random(), 0.5, 1.2 + Math.random() * 1.8);
      scene.add(cloud);
    }
  }

  private buildAirplane(scene: THREE.Scene): void {
    this.planeMesh = new THREE.Group();

    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.3, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.2, roughness: 0.3 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.3 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });

    // Forward = -Z, Up = +Y, Right = +X

    // 1. Fuselage
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 4.8, 16), redMat);
    fuselage.rotation.x = Math.PI / 2;
    this.planeMesh.add(fuselage);

    // 2. Nose Cone (-Z forward)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.0, 16), redMat);
    nose.position.z = -2.9;
    nose.rotation.x = -Math.PI / 2;
    this.planeMesh.add(nose);

    // 3. Propeller Spinner
    const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), darkMat);
    propHub.position.z = -3.45;
    propHub.rotation.x = -Math.PI / 2;

    this.propellerMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 0.03), darkMat);
    propHub.add(this.propellerMesh);
    this.planeMesh.add(propHub);

    // 4. Cockpit Canopy & Dashboard
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

    // 5. Wings (Span 8.2m at z = -0.5)
    const wings = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.08, 1.4), whiteMat);
    wings.position.set(0, 0.06, -0.5);
    this.planeMesh.add(wings);

    // Wingtip Lights
    const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    redLight.position.set(-4.1, 0.06, -0.5);
    const greenLight = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    greenLight.position.set(4.1, 0.06, -0.5);
    this.planeMesh.add(redLight, greenLight);

    // 6. Tail Stabilizers & Vertical Fin (+Z rear)
    const tailElevators = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.8), whiteMat);
    tailElevators.position.set(0, 0.12, 2.1);
    this.planeMesh.add(tailElevators);

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.9), redMat);
    tailFin.position.set(0, 0.72, 2.0);
    this.planeMesh.add(tailFin);

    // 7. Retractable Tricycle Landing Gear Group
    this.landingGearGroup = new THREE.Group();

    // Nose Gear (Front)
    const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), chromeMat);
    noseStrut.position.set(0, -0.35, -1.8);
    const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 16), darkMat);
    noseWheel.rotation.z = Math.PI / 2;
    noseWheel.position.set(0, -0.65, -1.8);
    this.landingGearGroup.add(noseStrut, noseWheel);

    // Main Left Gear
    const leftStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), chromeMat);
    leftStrut.position.set(-1.2, -0.35, 0.2);
    const leftWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), darkMat);
    leftWheel.rotation.z = Math.PI / 2;
    leftWheel.position.set(-1.2, -0.65, 0.2);
    this.landingGearGroup.add(leftStrut, leftWheel);

    // Main Right Gear
    const rightStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), chromeMat);
    rightStrut.position.set(1.2, -0.35, 0.2);
    const rightWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), darkMat);
    rightWheel.rotation.z = Math.PI / 2;
    rightWheel.position.set(1.2, -0.65, 0.2);
    this.landingGearGroup.add(rightStrut, rightWheel);

    this.planeMesh.add(this.landingGearGroup);
    scene.add(this.planeMesh);

    // 8. Physics Rigid Body: Spawns LANDED on the Runway at (0, 7.1, 220) facing -Z
    this.planeBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 7.1, 220.0)
        .setAdditionalMass(8.0)
        .setLinearDamping(0.2)
        .setAngularDamping(3.5)
        .setCanSleep(false)
    );

    const planeCollider = this.engine.native.world.createCollider(
      RAPIER.ColliderDesc.cuboid(4.1, 0.7, 2.5).setFriction(0.1).setRestitution(0.0),
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
    const ringGeo = new THREE.TorusGeometry(8.5, 0.45, 16, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0x78350f,
      roughness: 0.2,
      metalness: 0.8,
    });

    const waypoints: Array<[number, number, number]> = [
      [0, 24, 60],
      [0, 45, -120],
      [50, 65, -300],
      [140, 85, -480],
      [80, 100, -700],
      [-120, 105, -740],
      [-260, 90, -520],
      [-220, 68, -280],
      [-80, 48, -80],
      [0, 30, 120],
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
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;

      if (e.code === 'KeyG' || e.key.toLowerCase() === 'g') {
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

    // 1. Process Flight Inputs
    this.pitchInput = 0;
    this.rollInput = 0;
    this.yawInput = 0;

    // Pitch: W/Up = Pitch Down, S/Down = Pitch Up (Climb)
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) this.pitchInput += 1;
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) this.pitchInput -= 1;

    // Roll: A/Left = Bank Left, D/Right = Bank Right
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) this.rollInput += 1;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) this.rollInput -= 1;

    // Yaw: Q = Left, E = Right
    if (this.keys['KeyQ'] || this.keys['q']) this.yawInput += 1;
    if (this.keys['KeyE'] || this.keys['e']) this.yawInput -= 1;

    // Throttle (+/- or Shift/Ctrl)
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
      this.setThrottle(this.throttle + 0.008);
    }
    if (this.keys['ControlLeft'] || this.keys['ControlRight']) {
      this.setThrottle(this.throttle - 0.008);
    }

    // 2. Compute Airplane Orientation
    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);

    // Current Velocity & Airspeed
    const vel = this.planeBody.linvel();
    const velVec = new THREE.Vector3(vel.x, vel.y, vel.z);
    const forwardSpeed = Math.max(0, velVec.dot(forward));
    const totalSpeed = Math.hypot(vel.x, vel.y, vel.z);

    // 3. Forward Thrust
    const maxThrust = 520.0;
    const thrustForce = forward.clone().multiplyScalar(maxThrust * this.throttle);

    // 4. Dynamic Aerodynamic Lift Force
    // High-efficiency lift scaling: when speed > 18 m/s (~65 km/h), lift easily counters gravity
    // Angle of Attack factor based on pitch
    const aoaFactor = Math.max(0.2, Math.min(2.2, up.y + (this.pitchInput > 0 ? 0.4 : 0)));
    const liftMagnitude = Math.min(340.0, Math.pow(forwardSpeed, 1.45) * 3.4 * aoaFactor);
    const liftForce = up.clone().multiplyScalar(liftMagnitude);

    // 5. Drag Force
    const gearDragCoeff = this.gearDown ? 0.55 : 0.35;
    const dragForce = velVec.clone().multiplyScalar(-gearDragCoeff);

    // Total Force Impulse
    const totalForce = thrustForce.add(liftForce).add(dragForce);
    this.planeBody.applyImpulse(
      new RAPIER.Vector3(totalForce.x * 0.0166, totalForce.y * 0.0166, totalForce.z * 0.0166),
      true
    );

    // 6. Control Torques (scaled with forward airspeed)
    const controlPower = Math.min(1.0, Math.max(0.1, totalSpeed / 12.0));
    const pitchTorque = right.clone().multiplyScalar(this.pitchInput * 54.0 * controlPower);
    const rollTorque = forward.clone().multiplyScalar(this.rollInput * 68.0 * controlPower);
    const yawTorque = up.clone().multiplyScalar(this.yawInput * 28.0 * controlPower);

    const totalTorque = pitchTorque.add(rollTorque).add(yawTorque);
    this.planeBody.applyTorqueImpulse(
      new RAPIER.Vector3(totalTorque.x * 0.0166, totalTorque.y * 0.0166, totalTorque.z * 0.0166),
      true
    );

    // Check Ring Collisions
    this.checkRingCollection();
  }

  private checkRingCollection(): void {
    if (!this.planeBody) return;
    const p = this.planeBody.translation();

    for (const ring of this.rings) {
      if (!ring.collected) {
        const d = Math.hypot(p.x - ring.position[0], p.y - ring.position[1], p.z - ring.position[2]);
        if (d < 10.0) {
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
    this.engineSound.setThrottle(this.throttle);
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
    // Reset to runway tarmac at (0, 7.1, 220) with 0 speed
    this.planeBody.setTranslation(new RAPIER.Vector3(0, 7.1, 220.0), true);
    this.planeBody.setRotation(new RAPIER.Quaternion(0, 0, 0, 1), true);
    this.planeBody.setLinvel(new RAPIER.Vector3(0, 0, 0), true);
    this.planeBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);
    this.throttle = 0.0;
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
      return { altitude: 0, speed: 0, throttle: this.throttle, heading: 0, gearDown: this.gearDown, viewMode: this.viewMode, ringsCollected: 0, totalRings: 10 };
    }

    const pos = this.planeBody.translation();
    const vel = this.planeBody.linvel();
    const speedKmh = Math.hypot(vel.x, vel.y, vel.z) * 3.6;

    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const heading = ((Math.atan2(forward.x, forward.z) * 180) / Math.PI + 360) % 360;

    return {
      altitude: Math.max(0, parseFloat((pos.y - 6.0).toFixed(1))),
      speed: parseFloat(speedKmh.toFixed(1)),
      throttle: this.throttle,
      heading: Math.round(heading),
      gearDown: this.gearDown,
      viewMode: this.viewMode,
      ringsCollected: this.ringsCollected,
      totalRings: this.rings.length,
    };
  }

  update(dt: number): void {
    if (!this.planeBody) return;

    // Spin Propeller
    if (this.propellerMesh) {
      this.propellerMesh.rotation.z += (15.0 + this.throttle * 65.0) * dt;
    }

    // Landing Gear Smooth Retraction Animation
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
      // 1. Cockpit / Cabin View (inside the glass canopy looking forward past the nose)
      const cockpitEye = new THREE.Vector3(0, 0.48, -0.6).applyQuaternion(q);
      camera.position.set(pos.x + cockpitEye.x, pos.y + cockpitEye.y, pos.z + cockpitEye.z);

      const lookAhead = new THREE.Vector3(0, 0.45, -20).applyQuaternion(q);
      camera.lookAt(pos.x + lookAhead.x, pos.y + lookAhead.y, pos.z + lookAhead.z);
    } else {
      // 2. Outside Chase Camera View (Smooth trailing aerobatic camera)
      const behindOffset = new THREE.Vector3(0, 2.6, 12.0).applyQuaternion(q);
      const targetCamPos = new THREE.Vector3(pos.x, pos.y, pos.z).add(behindOffset);

      this.smoothCamPos.lerp(targetCamPos, 0.16);
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
