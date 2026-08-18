/**
 * Renderoni Web Demo: Aeroplane & Jet Flight Simulator
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RenderoniEngine } from '../core/engine.js';
import { body } from '../presets/body.js';
import { light } from '../presets/light.js';
import { sfx } from './audio-sfx.js';

export interface FlightTelemetry {
  altitude: number;
  speed: number;
  throttle: number;
  heading: number;
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
  private planeBody!: RAPIER.RigidBody;
  private engineSound = sfx.createFlightEngine();

  // Flight Controls & Aerodynamics
  private throttle = 0.75;
  private pitchInput = 0;
  private rollInput = 0;
  private yawInput = 0;
  private keys: Record<string, boolean> = {};

  // Checkpoint Rings
  private rings: RingCheckpoint[] = [];
  private ringsCollected = 0;

  // Smooth Camera State
  private smoothCamPos = new THREE.Vector3(0, 55, 120);

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
    scene.fog = new THREE.FogExp2(0x60a5fa, 0.0015);

    // 1. Lighting & Sun
    this.engine.add(light({ type: 'directional', intensity: 2.4, position: [100, 200, 100] }));
    this.engine.add(light({ type: 'ambient', intensity: 0.6, color: 0xe0f2fe }));

    // 2. World Archipelago & Runway
    this.buildWorld(scene);

    // 3. 3D Airplane Model & Physics Rigid Body
    this.buildAirplane(scene);

    // 4. Aerial Course (Floating Golden Rings)
    this.buildRingCourse(scene);

    // 5. Setup Controls
    this.setupControls();

    // 6. Flight Dynamics System (Aerodynamic Lift, Drag, Thrust, Control Torques)
    this.engine.systems.add({
      phase: 'prePhysics',
      update: () => {
        this.updateAerodynamics();
      },
    });

    // Actions
    this.engine.actions.register({
      name: 'flight.throttle',
      handle: (val: number) => this.setThrottle(val),
    });

    this.engine.actions.register({
      name: 'flight.reset',
      handle: () => this.resetPlane(),
    });

    // Start Sound
    this.engineSound.start();
    this.engineSound.setThrottle(this.throttle);

    // Start presentation loop with smooth chase camera & propeller update
    this.engine.start((dt) => this.update(dt));
  }

  private buildWorld(scene: THREE.Scene): void {
    // Ocean Water Plane
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1e40af,
      roughness: 0.15,
      metalness: 0.6,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0;
    scene.add(ocean);

    // Static Physics Ground/Water
    this.engine.add(
      body({
        id: 'ocean_ground',
        shape: 'box',
        type: 'fixed',
        size: [3000, 2, 3000],
        position: [0, -1, 0],
      })
    );

    // Runway Island
    const runwayIsland = new THREE.Mesh(
      new THREE.BoxGeometry(80, 6, 450),
      new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 })
    );
    runwayIsland.position.set(0, 3, 0);
    scene.add(runwayIsland);

    // Runway Tarmac with Center Line
    const tarmac = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 420),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    );
    tarmac.rotation.x = -Math.PI / 2;
    tarmac.position.set(0, 6.02, 0);
    scene.add(tarmac);

    // Runway White Stripe
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 400),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 6.04, 0);
    scene.add(stripe);

    // Mountain Islands Archipelago
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });

    const islandCoords = [
      { x: -450, z: -500, r: 220, h: 120 },
      { x: 550, z: -650, r: 280, h: 160 },
      { x: 400, z: 450, r: 240, h: 130 },
      { x: -550, z: 380, r: 260, h: 140 },
      { x: 0, z: -1100, r: 350, h: 220 },
    ];

    islandCoords.forEach((isl) => {
      const isMesh = new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r * 1.3, 12, 16), islandMat);
      isMesh.position.set(isl.x, 4, isl.z);
      scene.add(isMesh);

      const peak = new THREE.Mesh(new THREE.ConeGeometry(isl.r * 0.75, isl.h, 12), mountainMat);
      peak.position.set(isl.x, isl.h / 2 + 8, isl.z);
      scene.add(peak);
    });

    // Low-poly Clouds
    const cloudGeo = new THREE.DodecahedronGeometry(22, 1);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, transparent: true, opacity: 0.9 });

    for (let i = 0; i < 45; i++) {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(
        (Math.random() - 0.5) * 2000,
        140 + Math.random() * 90,
        (Math.random() - 0.5) * 2000
      );
      cloud.scale.set(1.2 + Math.random(), 0.55, 1.2 + Math.random() * 1.6);
      scene.add(cloud);
    }
  }

  private buildAirplane(scene: THREE.Scene): void {
    this.planeMesh = new THREE.Group();

    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.3, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.2, roughness: 0.3 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.75 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });

    // Standard Three.js Airplane coordinate frame:
    // Forward = -Z, Up = +Y, Right = +X

    // 1. Fuselage (Body along Z-axis)
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 4.6, 16), redMat);
    fuselage.rotation.x = Math.PI / 2;
    this.planeMesh.add(fuselage);

    // 2. Nose Cone (Pointing FORWARD along -Z)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 16), redMat);
    nose.position.z = -2.8;
    nose.rotation.x = -Math.PI / 2;
    this.planeMesh.add(nose);

    // 3. Propeller Hub & Blades (At very front nose, z = -3.35)
    const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), darkMat);
    propHub.position.z = -3.35;
    propHub.rotation.x = -Math.PI / 2;

    this.propellerMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.03), darkMat);
    propHub.add(this.propellerMesh);
    this.planeMesh.add(propHub);

    // 4. Cockpit Canopy (Top front, z = -0.8)
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), canopyMat);
    canopy.position.set(0, 0.38, -0.6);
    canopy.scale.set(0.75, 0.75, 1.6);
    this.planeMesh.add(canopy);

    // 5. Main Aerofoil Wings (Span = 8m, swept, at z = -0.5)
    const wings = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.08, 1.4), whiteMat);
    wings.position.set(0, 0.05, -0.5);
    this.planeMesh.add(wings);

    // Wingtips Navigation Lights
    const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    redLight.position.set(-3.9, 0.05, -0.5);
    const greenLight = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    greenLight.position.set(3.9, 0.05, -0.5);
    this.planeMesh.add(redLight, greenLight);

    // 6. Horizontal Tail Stabilizers / Elevators (At back, z = +2.0)
    const tailElevators = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 0.8), whiteMat);
    tailElevators.position.set(0, 0.12, 2.0);
    this.planeMesh.add(tailElevators);

    // 7. Vertical Tail Fin / Rudder (At back top, z = +1.9)
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.9), redMat);
    tailFin.position.set(0, 0.72, 1.9);
    this.planeMesh.add(tailFin);

    scene.add(this.planeMesh);

    // Physics Rigid Body: Spawns in mid-air flying down runway in level flight
    this.planeBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 45.0, 120.0)
        .setAdditionalMass(8.0)
        .setLinearDamping(0.2)
        .setAngularDamping(3.5)
        .setCanSleep(false)
    );

    const planeCollider = this.engine.native.world.createCollider(
      RAPIER.ColliderDesc.cuboid(3.9, 0.7, 2.5),
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

    // Initial forward cruising speed (-Z direction, 140 km/h = ~38 m/s)
    this.planeBody.setLinvel(new RAPIER.Vector3(0, 0, -38.0), true);
  }

  private buildRingCourse(scene: THREE.Scene): void {
    const ringGeo = new THREE.TorusGeometry(8.0, 0.45, 16, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0x78350f,
      roughness: 0.2,
      metalness: 0.8,
    });

    const waypoints: Array<[number, number, number]> = [
      [0, 48, -40],
      [40, 58, -160],
      [130, 72, -320],
      [200, 88, -500],
      [90, 100, -700],
      [-120, 105, -720],
      [-260, 90, -500],
      [-220, 68, -280],
      [-90, 52, -100],
      [0, 45, 40],
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
      if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
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

  private updateAerodynamics(): void {
    if (!this.planeBody) return;

    // 1. Process Key Inputs
    this.pitchInput = 0;
    this.rollInput = 0;
    this.yawInput = 0;

    // Pitch: W/Up = Nose Down, S/Down = Nose Up
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

    // 2. Compute Orientation
    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);

    // Current Velocity Vector & Forward Speed
    const vel = this.planeBody.linvel();
    const velVec = new THREE.Vector3(vel.x, vel.y, vel.z);
    const forwardSpeed = Math.max(0, velVec.dot(forward));

    // 3. Aerodynamic Forces
    // Thrust along forward vector (-Z local)
    const maxThrust = 450.0;
    const thrustForce = forward.clone().multiplyScalar(maxThrust * this.throttle);

    // Lift Force along local Up vector (+Y local)
    // Counteracts gravity when airspeed >= 24 m/s (86 km/h)
    const liftMagnitude = Math.min(260.0, Math.pow(forwardSpeed, 1.5) * 2.2);
    const liftForce = up.clone().multiplyScalar(liftMagnitude);

    // Drag Force opposing velocity
    const dragForce = velVec.clone().multiplyScalar(-0.4);

    const totalForce = thrustForce.add(liftForce).add(dragForce);
    this.planeBody.applyImpulse(
      new RAPIER.Vector3(totalForce.x * 0.0166, totalForce.y * 0.0166, totalForce.z * 0.0166),
      true
    );

    // 4. Control Torques
    const controlPower = Math.min(1.0, forwardSpeed / 15.0);
    const pitchTorque = right.clone().multiplyScalar(this.pitchInput * 48.0 * controlPower);
    const rollTorque = forward.clone().multiplyScalar(this.rollInput * 64.0 * controlPower);
    const yawTorque = up.clone().multiplyScalar(this.yawInput * 24.0 * controlPower);

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
        if (d < 9.5) {
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

  resetPlane(): void {
    if (!this.planeBody) return;
    this.planeBody.setTranslation(new RAPIER.Vector3(0, 45.0, 120.0), true);
    this.planeBody.setRotation(new RAPIER.Quaternion(0, 0, 0, 1), true);
    this.planeBody.setLinvel(new RAPIER.Vector3(0, 0, -38.0), true);
    this.planeBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);
    this.ringsCollected = 0;
    this.rings.forEach((r) => {
      r.collected = false;
      (r.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xf59e0b);
      (r.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x78350f);
    });
  }

  getTelemetry(): FlightTelemetry {
    if (!this.planeBody) {
      return { altitude: 0, speed: 0, throttle: this.throttle, heading: 0, ringsCollected: 0, totalRings: 10 };
    }

    const pos = this.planeBody.translation();
    const vel = this.planeBody.linvel();
    const speedKmh = Math.hypot(vel.x, vel.y, vel.z) * 3.6;

    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const heading = ((Math.atan2(forward.x, forward.z) * 180) / Math.PI + 360) % 360;

    return {
      altitude: Math.max(0, parseFloat(pos.y.toFixed(1))),
      speed: parseFloat(speedKmh.toFixed(1)),
      throttle: this.throttle,
      heading: Math.round(heading),
      ringsCollected: this.ringsCollected,
      totalRings: this.rings.length,
    };
  }

  update(dt: number): void {
    if (!this.planeBody) return;

    // Spin Propeller
    if (this.propellerMesh) {
      this.propellerMesh.rotation.z += (20.0 + this.throttle * 55.0) * dt;
    }

    // 3rd-Person Smooth Chase Camera
    const pos = this.planeBody.translation();
    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    // Behind offset: +Z local is behind the plane
    const behindOffset = new THREE.Vector3(0, 2.8, 12.5).applyQuaternion(q);
    const targetCamPos = new THREE.Vector3(pos.x, pos.y, pos.z).add(behindOffset);

    this.smoothCamPos.lerp(targetCamPos, 0.16);

    const camera = this.engine.native.camera;
    camera.position.copy(this.smoothCamPos);

    // Look slightly ahead of the plane nose
    const lookTarget = new THREE.Vector3(pos.x, pos.y + 0.6, pos.z).add(
      new THREE.Vector3(0, 0, -4).applyQuaternion(q)
    );
    camera.lookAt(lookTarget);
  }

  dispose(): void {
    this.engineSound.stop();
    this.engine.dispose();
  }
}
