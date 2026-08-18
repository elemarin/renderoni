/**
 * Renderoni Showcase: Skyward Courier — Isle of Aeolus
 *
 * Stylized Ghibli-Style Flight & Exploration:
 * - Hand-crafted Vintage Biplane (dual wings, spinning wooden propellers with blur discs,
 *   working rudder/aileron/elevator control surfaces, pontoon skids, and cockpit dashboard)
 * - Aerodynamic Flight Dynamics (speed-dependent dynamic lift, smooth banking, self-leveling stability)
 * - Floating Archipelago (Haven Outpost, Windmill Valley, Sky Lighthouse, Canyon Wind Tunnels)
 * - Postal Airmail Delivery Game Loop:
 *   1. Take off from Haven Island runway
 *   2. Deliver Parcel to Windmill Valley
 *   3. Soar through glowing Canyon Thermal Updrafts
 *   4. Ignite the Sky Lighthouse Beacon Ring
 *   5. Smooth water/runway touchdown
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RenderoniEngine } from '../core/engine.js';
import { light } from '../presets/index.js';
import { sfx } from './audio-sfx.js';

export interface FlightTelemetry {
  speed: number;
  altitude: number;
  throttle: number;
  flightState: 'Parked' | 'Takeoff' | 'Airborne' | 'Stall Warning' | 'Landed';
  parcelsDelivered: number;
  totalParcels: number;
  viewMode: 'cockpit' | 'outside';
  activeObjective: string;
}

export class FlightGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;

  // Aircraft Visual Mesh Hierarchy
  private planeRoot = new THREE.Group();
  private propMeshLeft!: THREE.Mesh;
  private propMeshRight!: THREE.Mesh;
  private blurDiscLeft!: THREE.Mesh;
  private blurDiscRight!: THREE.Mesh;
  private rudderMesh!: THREE.Mesh;
  private leftAileron!: THREE.Mesh;
  private rightAileron!: THREE.Mesh;
  private elevatorMesh!: THREE.Mesh;

  // Physics
  private planeBody!: RAPIER.RigidBody;

  // Flight State
  private throttle = 0.0; // 0.0 to 1.0
  private airspeed = 0.0; // m/s
  private isAirborne = false;
  private yaw = -Math.PI / 2;
  private pitch = 0;
  private roll = 0;
  private viewMode: 'cockpit' | 'outside' = 'outside';

  private currentObjective = 'Hold Z until ~70% — then you leave the grass';

  // Controls
  private keys: Record<string, boolean> = {};
  private unbind: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -14.0, 0],
      loop: {
        enabled: true,
        title: 'Skyward Courier',
        subtitle: 'Hold Z to take off. Below half throttle you sink. Fly the islands.',
      },
    });
  }

  async init(): Promise<void> {
    await this.engine.init({ gravity: [0, -14.0, 0] });

    const scene = this.engine.native.scene;
    scene.background = new THREE.Color(0x38bdf8);
    scene.fog = new THREE.Fog(0x7dd3fc, 180, 900);
    this.engine.native.camera.far = 1200;
    this.engine.native.camera.updateProjectionMatrix();

    // 1. Setup Sun & Ambient Lighting
    this.setupLighting();

    // 2. Build Floating Archipelago Islands
    this.buildArchipelago();

    // 3. Build Handcrafted Vintage Biplane
    this.buildBiplane();

    // 4. Setup Action Handlers
    this.setupActions();

    // 6. Setup Controls
    this.setupControls();
    this.engine.loop.onReset(() => this.resetPlane());

    // Start engine sound
    sfx.startEngineDrone();

    // Start presentation loop
    this.engine.start((dt) => this.update(dt));
  }

  private setupLighting(): void {
    const scene = this.engine.native.scene;

    // Sun Light with Soft Shadows
    this.engine.add(
      light({
        type: 'directional',
        intensity: 2.8,
        color: 0xfffbeb,
        position: [60, 100, 40],
      })
    );

    // Warm Hemisphere Ambient Light
    const hemi = new THREE.HemisphereLight(0xbae6fd, 0x166534, 0.8);
    scene.add(hemi);
  }

  private buildBiplane(): void {
    const scene = this.engine.native.scene;
    this.planeRoot = new THREE.Group();

    // Materials
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.5 }); // Warm teak wood
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.4 }); // Canvas fabric wings
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.2 }); // Steampunk brass
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45, roughness: 0.1 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 });

    // 1. Fuselage
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 4.4, 12), woodMat);
    fuselage.rotation.x = Math.PI / 2;
    this.planeRoot.add(fuselage);

    // Brass Nose Cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.8, 12), brassMat);
    nose.position.set(0, 0, -2.4);
    nose.rotation.x = -Math.PI / 2;
    this.planeRoot.add(nose);

    // Cockpit Canopy & Windshield
    const windshield = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 1.2, 8, 1, false, 0, Math.PI), glassMat);
    windshield.position.set(0, 0.42, -0.4);
    windshield.rotation.z = Math.PI / 2;
    windshield.rotation.y = Math.PI / 2;
    this.planeRoot.add(windshield);

    // 2. Dual Biplane Wings (Top & Bottom with Brass Struts)
    const topWing = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.08, 1.3), creamMat);
    topWing.position.set(0, 0.9, -0.4);
    const bottomWing = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.08, 1.1), creamMat);
    bottomWing.position.set(0, -0.15, -0.4);
    this.planeRoot.add(topWing, bottomWing);

    // Brass Wing Struts
    for (let x of [-3.2, 3.2]) {
      const strutL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 6), brassMat);
      strutL.position.set(x, 0.38, -0.7);
      const strutR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 6), brassMat);
      strutR.position.set(x, 0.38, -0.1);
      this.planeRoot.add(strutL, strutR);
    }

    // Working Ailerons
    this.leftAileron = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 0.3), creamMat);
    this.leftAileron.position.set(-3.0, 0.9, 0.35);
    this.rightAileron = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 0.3), creamMat);
    this.rightAileron.position.set(3.0, 0.9, 0.35);
    this.planeRoot.add(this.leftAileron, this.rightAileron);

    // 3. Tail Assembly (Vertical Fin + Horizontal Elevator)
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.9), creamMat);
    tailFin.position.set(0, 0.6, 2.0);
    this.planeRoot.add(tailFin);

    this.rudderMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.4), creamMat);
    this.rudderMesh.position.set(0, 0.55, 2.5);
    this.planeRoot.add(this.rudderMesh);

    this.elevatorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 0.6), creamMat);
    this.elevatorMesh.position.set(0, 0.2, 2.1);
    this.planeRoot.add(this.elevatorMesh);

    // 4. Twin Propellers (Left & Right Wing Mounted with Blur Discs)
    const propMat = new THREE.MeshStandardMaterial({ color: 0x451a03 });
    const blurMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.25 });

    // Left Propeller
    this.propMeshLeft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.04), propMat);
    this.propMeshLeft.position.set(-1.8, 0.38, -1.2);
    this.blurDiscLeft = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), blurMat);
    this.blurDiscLeft.position.set(-1.8, 0.38, -1.22);
    this.planeRoot.add(this.propMeshLeft, this.blurDiscLeft);

    // Right Propeller
    this.propMeshRight = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.04), propMat);
    this.propMeshRight.position.set(1.8, 0.38, -1.2);
    this.blurDiscRight = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), blurMat);
    this.blurDiscRight.position.set(1.8, 0.38, -1.22);
    this.planeRoot.add(this.propMeshRight, this.blurDiscRight);

    // 5. Pontoon Water Skids
    const pontoonL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 3.4), metalMat);
    pontoonL.position.set(-1.3, -0.9, -0.2);
    const pontoonR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 3.4), metalMat);
    pontoonR.position.set(1.3, -0.9, -0.2);
    this.planeRoot.add(pontoonL, pontoonR);

    // On the runway, yawed toward +X (open water) so takeoff is not a canyon wall.
    const startPos = [0, 3.1, 40];
    this.planeRoot.position.set(startPos[0], startPos[1], startPos[2]);
    this.planeRoot.quaternion.set(0, -0.7071, 0, 0.7071);
    scene.add(this.planeRoot);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(startPos[0], startPos[1], startPos[2])
      .setRotation({ x: 0, y: -0.7071, z: 0, w: 0.7071 });
    this.planeBody = this.engine.native.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(1.6, 0.45, 2.2);
    colliderDesc.setFriction(0.15);
    colliderDesc.setRestitution(0.1);
    this.engine.native.world.createCollider(colliderDesc, this.planeBody);
  }

  private buildArchipelago(): void {
    const scene = this.engine.native.scene;

    // Endless Sparkling Ocean Surface
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.15,
      metalness: 0.8,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), waterMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0.0;
    scene.add(ocean);

    this.buildIsland(20, 0, 40, 55, 40, 2.2, 0x16a34a, true);
    const runwayMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.85 });
    const runway = new THREE.Mesh(new THREE.BoxGeometry(70, 0.18, 7), runwayMat);
    runway.position.set(18, 2.32, 40);
    scene.add(runway);

    this.buildIsland(180, 2, -40, 50, 50, 16, 0x4d7c0f, false);
    this.buildWindmill(180, 18, -40);
    this.buildIsland(-160, 6, -120, 42, 42, 22, 0x365314, false);
    this.buildLighthouse(-160, 28, -120);
    this.buildIsland(140, 1, 220, 48, 48, 12, 0x15803d, false);
    this.buildIsland(-90, 4, 180, 36, 36, 14, 0x3f6212, false);
    this.buildIsland(260, 8, 80, 30, 30, 18, 0x166534, false);
    this.buildIsland(-40, 10, -240, 44, 44, 20, 0x4d7c0f, false);
    this.buildIsland(80, 3, -180, 26, 26, 11, 0x3f6212, false);

    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 1, transparent: true, opacity: 0.88 });
    for (const [x, y, z, s] of [
      [40, 48, 10, 10],
      [160, 55, 60, 14],
      [-80, 50, -40, 11],
      [240, 62, 20, 16],
      [10, 52, 160, 12],
      [-140, 58, 90, 13],
      [100, 70, -200, 15],
    ] as Array<[number, number, number, number]>) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cloudMat);
      puff.scale.set(1.6, 0.55, 1.1);
      puff.position.set(x, y, z);
      scene.add(puff);
    }

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    sun.position.set(80, 70, -40);
    scene.add(sun);
  }

  private buildIsland(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: number,
    solid = false
  ): void {
    const scene = this.engine.native.scene;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const island = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.7, w, h, 16), mat);
    island.position.set(x, y + h / 2, z);
    scene.add(island);
    if (solid) this.addStaticBox(x, y + h / 2, z, w * 0.7, h / 2, d * 0.7);
  }

  private buildWindmill(x: number, y: number, z: number): void {
    const scene = this.engine.native.scene;
    const millMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 3.5, 12, 8), millMat);
    tower.position.set(x, y + 6, z);
    scene.add(tower);
    this.addStaticBox(x, y + 6, z, 2.5, 6, 2.5);
  }

  private buildLighthouse(x: number, y: number, z: number): void {
    const scene = this.engine.native.scene;
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3.2, 22, 12), towerMat);
    tower.position.set(x, y + 11, z);
    scene.add(tower);

    // Golden Beacon Light
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 16), beaconMat);
    beacon.position.set(x, y + 23, z);
    scene.add(beacon);

    const light = new THREE.PointLight(0xfef08a, 4.0, 80);
    light.position.set(x, y + 24, z);
    scene.add(light);
  }

  private addStaticBox(x: number, y: number, z: number, hx: number, hy: number, hz: number): void {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = this.engine.native.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    this.engine.native.world.createCollider(colliderDesc, body);
  }

  private setupActions(): void {
    this.engine.actions.register({
      name: 'flight.throttle',
      handle: (val: any) => this.setThrottle(typeof val === 'number' ? val : 1.0),
    });
    this.engine.actions.register({
      name: 'flight.toggleCamera',
      handle: () => this.toggleCameraView(),
    });
    this.engine.actions.register({
      name: 'flight.reset',
      handle: () => this.resetPlane(),
    });
  }

  private setupControls(): void {
    const onDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (this.engine.loop.enabled && this.engine.loop.phase === 'ready') {
        this.engine.loop.start();
      }
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;
      if (e.code === 'KeyZ' || e.key.toLowerCase() === 'z') this.setThrottle(1.0);
      if (e.code === 'KeyX' || e.key.toLowerCase() === 'x') this.setThrottle(0.0);
      if (e.code === 'KeyC' || e.key.toLowerCase() === 'c') this.toggleCameraView();
      if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') this.resetPlane();
    };
    const onUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    this.unbind.push(
      () => window.removeEventListener('keydown', onDown),
      () => window.removeEventListener('keyup', onUp)
    );
  }

  setThrottle(val: number): void {
    this.throttle = Math.max(0, Math.min(1, val));
  }

  toggleCameraView(): void {
    this.viewMode = this.viewMode === 'cockpit' ? 'outside' : 'cockpit';
  }

  resetPlane(): void {
    this.yaw = -Math.PI / 2;
    this.pitch = 0;
    this.roll = 0;
    this.throttle = 0.0;
    this.airspeed = 0.0;
    this.isAirborne = false;
    this.planeBody.setNextKinematicTranslation({ x: 0, y: 3.1, z: 40 });
    this.planeBody.setNextKinematicRotation({ x: 0, y: -0.7071, z: 0, w: 0.7071 });
    this.currentObjective = 'Hold Z until ~70% — then you leave the grass';
  }

  getTelemetry(): FlightTelemetry {
    const pos = this.planeBody.translation();
    const speedKmh = Math.round(this.airspeed * 3.6);
    const alt = Math.max(0, Math.round(pos.y));

    let state: FlightTelemetry['flightState'] = 'Parked';
    if (this.airspeed > 5 && !this.isAirborne) state = 'Takeoff';
    else if (this.isAirborne) {
      state = speedKmh < 45 ? 'Stall Warning' : 'Airborne';
    }

    return {
      speed: speedKmh,
      altitude: alt,
      throttle: this.throttle,
      flightState: state,
      parcelsDelivered: 0,
      totalParcels: 0,
      viewMode: this.viewMode,
      activeObjective: this.currentObjective,
    };
  }

  update(dt: number): void {
    if (!this.engine.loop.playing) {
      this.syncPlaneVisual();
      this.updateCamera();
      return;
    }

    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) this.throttle = Math.min(1, this.throttle + dt * 0.85);
    if (this.keys['ControlLeft'] || this.keys['ControlRight']) this.throttle = Math.max(0, this.throttle - dt * 0.95);

    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) this.yaw += 1.5 * dt;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) this.yaw -= 1.5 * dt;
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) this.pitch += 1.15 * dt;
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) this.pitch -= 1.15 * dt;
    if (this.keys['KeyQ'] || this.keys['q']) this.roll += 1.8 * dt;
    if (this.keys['KeyE'] || this.keys['e']) this.roll -= 1.8 * dt;
    this.pitch = Math.max(-0.55, Math.min(0.5, this.pitch));
    this.roll = Math.max(-0.7, Math.min(0.7, this.roll));
    if (!this.keys['KeyQ'] && !this.keys['q'] && !this.keys['KeyE'] && !this.keys['e']) {
      this.roll *= Math.max(0, 1 - dt * 3);
    }

    const p = this.planeBody.translation();
    const floor = this.groundHeight(p.x, p.z);
    const grounded = p.y <= floor + 0.08;

    const power = this.throttle * this.throttle;
    this.airspeed = grounded && this.throttle < 0.62 ? this.throttle * 10 : 4 + power * 42;
    if (grounded && (this.keys['ControlLeft'] || this.keys['ControlRight'])) this.airspeed *= 0.3;

    const vx = -Math.sin(this.yaw) * this.airspeed;
    const vz = -Math.cos(this.yaw) * this.airspeed;
    let vy = 0;
    if (!grounded || this.throttle >= 0.62) {
      vy = (this.throttle - 0.7) * 16 - this.pitch * 18;
      if (this.throttle < 0.5) vy -= (0.5 - this.throttle) * 28;
    }

    let nextY = p.y + vy * dt;
    if (nextY <= floor) {
      nextY = floor;
      this.pitch *= 0.4;
      this.roll *= 0.3;
    }

    const next = {
      x: p.x + vx * dt,
      y: Math.min(220, nextY),
      z: p.z + vz * dt,
    };
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    this.planeBody.setNextKinematicTranslation(next);
    this.planeBody.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });

    this.isAirborne = next.y > 3.4;
    const speedKmh = Math.round(this.airspeed * 3.6);
    this.planeRoot.position.set(next.x, next.y, next.z);
    this.planeRoot.quaternion.copy(q);

    const propSpeed = 2 + this.throttle * 35;
    this.propMeshLeft.rotation.z += propSpeed * dt;
    this.propMeshRight.rotation.z -= propSpeed * dt;
    this.blurDiscLeft.visible = this.throttle > 0.45;
    this.blurDiscRight.visible = this.throttle > 0.45;
    this.rudderMesh.rotation.y = (this.keys['KeyA'] ? 0.3 : 0) + (this.keys['KeyD'] ? -0.3 : 0);
    this.leftAileron.rotation.x = this.roll * 0.6;
    this.rightAileron.rotation.x = -this.roll * 0.6;
    this.elevatorMesh.rotation.x = this.pitch;

    sfx.updateEngineDrone(this.throttle, speedKmh);
    this.currentObjective = this.isAirborne
      ? 'Shift faster · Ctrl slower · Q/E roll · cut throttle to land'
      : 'Taxi with Shift. Hold past 60% to take off';

    // 11. Camera System
    this.updateCamera();
  }

  private groundHeight(x: number, z: number): number {
    const dx = x - 20;
    const dz = z - 40;
    if (dx * dx + dz * dz < 48 * 48) return 3.1;
    return 1.2;
  }

  private syncPlaneVisual(): void {
    const p = this.planeBody.translation();
    const rot = this.planeBody.rotation();
    this.planeRoot.position.set(p.x, p.y, p.z);
    this.planeRoot.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  }

  private updateCamera(): void {
    const camera = this.engine.native.camera;
    const p = this.planeBody.translation();
    const rot = this.planeBody.rotation();
    const planeQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const forwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(planeQuat);
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(planeQuat);
    const planePos = new THREE.Vector3(p.x, p.y, p.z);
    if (this.viewMode === 'cockpit') {
      const eyePos = forwardVec.clone().multiplyScalar(0.4).add(upVec.clone().multiplyScalar(0.55));
      camera.position.copy(planePos).add(eyePos);
      const lookTarget = planePos.clone().add(forwardVec.clone().multiplyScalar(100));
      camera.lookAt(lookTarget);
    } else {
      const chase = planePos
        .clone()
        .add(forwardVec.clone().multiplyScalar(-9))
        .add(new THREE.Vector3(0, 7.5, 0));
      camera.position.lerp(chase, 0.16);
      camera.lookAt(planePos);
    }
  }

  dispose(): void {
    sfx.stopEngineDrone();
    for (const fn of this.unbind) fn();
    this.unbind.length = 0;
    this.engine.dispose();
  }
}
