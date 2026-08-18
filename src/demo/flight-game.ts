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
  private throttle = 0.6;
  private pitchInput = 0;
  private rollInput = 0;
  private yawInput = 0;
  private keys: Record<string, boolean> = {};

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
    scene.background = new THREE.Color(0x70a5ff);
    scene.fog = new THREE.FogExp2(0x70a5ff, 0.0018);

    // 1. Lighting & Sun
    this.engine.add(light({ type: 'directional', intensity: 2.2, position: [80, 140, 80] }));
    this.engine.add(light({ type: 'ambient', intensity: 0.6, color: 0xcce0ff }));

    // 2. World Archipelago & Runway
    this.buildWorld(scene);

    // 3. 3D Airplane Model & Physics Rigid Body
    this.buildAirplane(scene);

    // 4. Aerial Course (Floating Golden Rings)
    this.buildRingCourse(scene);

    // 5. Controls
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

    // Start engine presentation loop with camera & propeller update
    this.engine.start((dt) => this.update(dt));
  }

  private buildWorld(scene: THREE.Scene): void {
    // Ocean Water Plane
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.2,
      metalness: 0.8,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0;
    scene.add(ocean);

    // Static Physics Ground/Water
    this.engine.add(
      body({
        id: 'ocean_ground',
        shape: 'box',
        type: 'fixed',
        size: [2400, 2, 2400],
        position: [0, -1, 0],
      })
    );

    // Runway Island
    const runwayIsland = new THREE.Mesh(
      new THREE.BoxGeometry(60, 4, 320),
      new THREE.MeshStandardMaterial({ color: 0x3d7a42, roughness: 0.8 })
    );
    runwayIsland.position.set(0, 2, 0);
    scene.add(runwayIsland);

    // Runway Tarmac
    const tarmac = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 300),
      new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.9 })
    );
    tarmac.rotation.x = -Math.PI / 2;
    tarmac.position.set(0, 4.02, 0);
    scene.add(tarmac);

    // Mountain Islands Archipelago
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x5a6370, roughness: 0.9 });
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x2f6e35, roughness: 0.8 });

    const islandCoords = [
      { x: -350, z: -400, r: 180, h: 90 },
      { x: 420, z: -550, r: 240, h: 140 },
      { x: 300, z: 350, r: 200, h: 110 },
      { x: -450, z: 280, r: 220, h: 120 },
      { x: 0, z: -850, r: 300, h: 180 },
    ];

    islandCoords.forEach((isl) => {
      // Base Island
      const isMesh = new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r * 1.3, 10, 16), islandMat);
      isMesh.position.set(isl.x, 3, isl.z);
      scene.add(isMesh);

      // Mountain Peak
      const peak = new THREE.Mesh(new THREE.ConeGeometry(isl.r * 0.7, isl.h, 12), mountainMat);
      peak.position.set(isl.x, isl.h / 2 + 5, isl.z);
      scene.add(peak);
    });

    // Fluffy Clouds
    const cloudGeo = new THREE.DodecahedronGeometry(18, 1);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, transparent: true, opacity: 0.85 });

    for (let i = 0; i < 40; i++) {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(
        (Math.random() - 0.5) * 1600,
        120 + Math.random() * 80,
        (Math.random() - 0.5) * 1600
      );
      cloud.scale.set(1 + Math.random(), 0.6, 1 + Math.random() * 1.5);
      scene.add(cloud);
    }
  }

  private buildAirplane(scene: THREE.Scene): void {
    this.planeMesh = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.4, roughness: 0.3 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.3, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });

    // Fuselage (Streamlined Body)
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 5.0, 16), bodyMat);
    fuselage.rotation.x = Math.PI / 2;
    this.planeMesh.add(fuselage);

    // Nose Cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 16), bodyMat);
    nose.position.z = 3.0;
    nose.rotation.x = Math.PI / 2;
    this.planeMesh.add(nose);

    // Cockpit Canopy
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), glassMat);
    canopy.position.set(0, 0.4, 0.8);
    canopy.scale.set(0.8, 0.8, 1.8);
    this.planeMesh.add(canopy);

    // Main Wings
    const wings = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.08, 1.3), wingMat);
    wings.position.set(0, 0.1, 0.6);
    this.planeMesh.add(wings);

    // Wingtips with Navigation Lights
    const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    redLight.position.set(-3.8, 0.1, 0.6);
    const greenLight = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    greenLight.position.set(3.8, 0.1, 0.6);
    this.planeMesh.add(redLight, greenLight);

    // Horizontal Tail Elevators
    const tailElevator = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.8), wingMat);
    tailElevator.position.set(0, 0.15, -2.1);
    this.planeMesh.add(tailElevator);

    // Vertical Stabilizer / Rudder
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.9), bodyMat);
    tailFin.position.set(0, 0.7, -2.0);
    this.planeMesh.add(tailFin);

    // Propeller Spinner
    const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), darkMat);
    propHub.position.z = 3.55;
    propHub.rotation.x = Math.PI / 2;

    this.propellerMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.04), darkMat);
    propHub.add(this.propellerMesh);
    this.planeMesh.add(propHub);

    scene.add(this.planeMesh);

    // Physics Rigid Body
    this.planeBody = this.engine.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 20.0, 100)
        .setAdditionalMass(10.0)
        .setLinearDamping(0.3)
        .setAngularDamping(2.5)
        .setCanSleep(false)
    );

    const planeCollider = this.engine.native.world.createCollider(
      RAPIER.ColliderDesc.cuboid(3.8, 0.6, 2.5),
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

    // Initial forward velocity
    this.planeBody.setLinvel(new RAPIER.Vector3(0, 0, -35), true);
  }

  private buildRingCourse(scene: THREE.Scene): void {
    const ringGeo = new THREE.TorusGeometry(8.0, 0.4, 16, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0x884400,
      roughness: 0.2,
      metalness: 0.8,
    });

    const waypoints: Array<[number, number, number]> = [
      [0, 28, -60],
      [40, 45, -180],
      [120, 65, -340],
      [180, 80, -520],
      [60, 95, -700],
      [-140, 100, -680],
      [-260, 85, -460],
      [-200, 60, -260],
      [-80, 45, -100],
      [0, 32, 20],
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
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  private updateAerodynamics(): void {
    if (!this.planeBody) return;

    // 1. Process Key Inputs
    this.pitchInput = 0;
    this.rollInput = 0;
    this.yawInput = 0;

    // Pitch (W = Nose Down, S = Nose Up)
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) this.pitchInput += 1;
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) this.pitchInput -= 1;

    // Roll (A = Bank Left, D = Bank Right)
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) this.rollInput += 1;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) this.rollInput -= 1;

    // Yaw / Rudder (Q = Left, E = Right)
    if (this.keys['KeyQ'] || this.keys['q']) this.yawInput += 1;
    if (this.keys['KeyE'] || this.keys['e']) this.yawInput -= 1;

    // Throttle (+ / - or Shift / Ctrl)
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
      this.setThrottle(this.throttle + 0.01);
    }
    if (this.keys['ControlLeft'] || this.keys['ControlRight']) {
      this.setThrottle(this.throttle - 0.01);
    }

    // 2. Compute Airplane Orientation Vectors
    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);

    // Velocity & Forward Speed
    const vel = this.planeBody.linvel();
    const velVec = new THREE.Vector3(vel.x, vel.y, vel.z);
    const forwardSpeed = Math.max(0, velVec.dot(forward));

    // 3. Aerodynamic Forces
    // Thrust (Forward along aircraft heading)
    const maxThrust = 420.0;
    const thrustForce = forward.clone().multiplyScalar(maxThrust * this.throttle);

    // Lift Force: Lift = 0.5 * CL * speed^2 (counteracts gravity when airspeed >= 25 m/s)
    const liftMagnitude = Math.min(220.0, Math.pow(forwardSpeed, 1.6) * 1.8);
    const liftForce = up.clone().multiplyScalar(liftMagnitude);

    // Drag Force: opposes velocity
    const dragForce = velVec.clone().multiplyScalar(-0.45);

    // Total Force Impulse
    const totalForce = thrustForce.add(liftForce).add(dragForce);
    this.planeBody.applyImpulse(
      new RAPIER.Vector3(totalForce.x * 0.0166, totalForce.y * 0.0166, totalForce.z * 0.0166),
      true
    );

    // 4. Control Torques (scaled with airspeed so control surfaces bite the air)
    const controlPower = Math.min(1.0, forwardSpeed / 20.0);
    const pitchTorque = right.clone().multiplyScalar(this.pitchInput * 45.0 * controlPower);
    const rollTorque = forward.clone().multiplyScalar(this.rollInput * 60.0 * controlPower);
    const yawTorque = up.clone().multiplyScalar(this.yawInput * 25.0 * controlPower);

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
        if (d < 9.0) {
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
    this.planeBody.setTranslation(new RAPIER.Vector3(0, 20.0, 100), true);
    this.planeBody.setRotation(new RAPIER.Quaternion(0, 0, 0, 1), true);
    this.planeBody.setLinvel(new RAPIER.Vector3(0, 0, -35), true);
    this.planeBody.setAngvel(new RAPIER.Vector3(0, 0, 0), true);
    this.ringsCollected = 0;
    this.rings.forEach((r) => {
      r.collected = false;
      (r.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xf59e0b);
      (r.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x884400);
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
      this.propellerMesh.rotation.z += (15.0 + this.throttle * 45.0) * dt;
    }

    // 3rd-Person Aerobatic Chase Camera
    const pos = this.planeBody.translation();
    const rot = this.planeBody.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    const behindOffset = new THREE.Vector3(0, 2.5, 12.0).applyQuaternion(q);
    const targetCamPos = new THREE.Vector3(pos.x, pos.y, pos.z).add(behindOffset);

    const camera = this.engine.native.camera;
    camera.position.lerp(targetCamPos, 0.12);

    const lookTarget = new THREE.Vector3(pos.x, pos.y + 0.8, pos.z);
    camera.lookAt(lookTarget);
  }

  dispose(): void {
    this.engineSound.stop();
    this.engine.dispose();
  }
}
