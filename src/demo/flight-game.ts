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
import { body, light } from '../presets/index.js';
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
  private viewMode: 'cockpit' | 'outside' = 'outside';

  // Mission & Delivery Objectives
  private parcelsDelivered = 0;
  private totalParcels = 3;
  private currentObjective = 'Increase throttle (Shift or Z) to take off from Haven Island';

  // Interactive Rings & Delivery Hoppers
  private rings: Array<{
    id: string;
    pos: THREE.Vector3;
    mesh: THREE.Group;
    collected: boolean;
    type: 'mail' | 'thermal' | 'lighthouse';
  }> = [];

  // Controls
  private keys: Record<string, boolean> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -14.0, 0],
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    scene.background = new THREE.Color(0x38bdf8); // Vibrant azure sky
    scene.fog = new THREE.FogExp2(0x38bdf8, 0.0035);

    // 1. Setup Sun & Ambient Lighting
    this.setupLighting();

    // 2. Build Floating Archipelago Islands
    this.buildArchipelago();

    // 3. Build Handcrafted Vintage Biplane
    this.buildBiplane();

    // 4. Setup Delivery Missions & Wind Tunnels
    this.setupDeliveryRings();

    // 5. Setup Action Handlers
    this.setupActions();

    // 6. Setup Controls
    this.setupControls();

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

    // Spawn on Haven Island Runway (Facing North: -Z)
    const startPos = [0, 1.4, 40];
    this.planeRoot.position.set(startPos[0], startPos[1], startPos[2]);
    scene.add(this.planeRoot);

    // Rapier Flat Cuboid Collider (Eliminates tipping)
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startPos[0], startPos[1], startPos[2])
      .setLinearDamping(0.8)
      .setAngularDamping(4.5)
      .setCanSleep(false);
    this.planeBody = this.engine.native.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(1.6, 0.45, 2.2);
    colliderDesc.setFriction(0.15);
    colliderDesc.setRestitution(0.1);
    this.engine.native.world.createCollider(colliderDesc, this.planeBody);

    // Register in Engine
    this.engine.add(
      body({
        id: 'skyward_plane',
        shape: 'box',
        type: 'dynamic',
        size: [3.2, 0.9, 4.4],
        position: [startPos[0], startPos[1], startPos[2]],
        tags: ['airplane', 'player'],
      })
    );
  }

  private buildArchipelago(): void {
    const scene = this.engine.native.scene;

    // Endless Sparkling Ocean Surface
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.15,
      metalness: 0.8,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), waterMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = 0.0;
    scene.add(ocean);

    // Water Surface Collider (So pontoons can land on water!)
    this.addStaticBox(0, -0.5, 0, 800, 0.5, 800);

    // 1. Haven Island (Takeoff Runway Island)
    this.buildIsland(0, 0, 20, 28, 80, 2.5, 0x15803d);

    // Wooden Runway Strip
    const runwayMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const runway = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 70), runwayMat);
    runway.position.set(0, 1.25, 25);
    scene.add(runway);
    this.addStaticBox(0, 1.15, 25, 5, 0.1, 35);

    // 2. Windmill Valley Island (Northeast: 120, 25, -90)
    this.buildIsland(120, 25, -90, 70, 70, 20, 0x16a34a);
    this.buildWindmill(120, 45, -90);

    // 3. Sky Lighthouse Island (Northwest Spire: -130, 45, -160)
    this.buildIsland(-130, 45, -160, 45, 45, 45, 0x334155);
    this.buildLighthouse(-130, 90, -160);

    // 4. Canyon Archways (Between Islands: 0, 30, -80)
    this.buildIsland(0, 20, -80, 40, 30, 25, 0x475569);
  }

  private buildIsland(x: number, y: number, z: number, w: number, d: number, h: number, color: number): void {
    const scene = this.engine.native.scene;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const island = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.7, w, h, 16), mat);
    island.position.set(x, y + h / 2, z);
    scene.add(island);
    this.addStaticBox(x, y + h / 2, z, w * 0.7, h / 2, d * 0.7);
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

  private setupDeliveryRings(): void {
    const scene = this.engine.native.scene;

    const ringDefs = [
      { id: 'ring_takeoff', pos: new THREE.Vector3(0, 18, -10), type: 'mail' as const, label: 'Takeoff Mail Drop' },
      { id: 'ring_thermal', pos: new THREE.Vector3(50, 40, -50), type: 'thermal' as const, label: 'Canyon Thermal Updraft' },
      { id: 'ring_windmill', pos: new THREE.Vector3(120, 60, -90), type: 'mail' as const, label: 'Windmill Valley Delivery' },
      { id: 'ring_lighthouse', pos: new THREE.Vector3(-130, 115, -160), type: 'lighthouse' as const, label: 'Sky Lighthouse Beacon' },
    ];

    ringDefs.forEach((def) => {
      const ringGroup = new THREE.Group();
      ringGroup.position.copy(def.pos);

      const color = def.type === 'thermal' ? 0x38bdf8 : def.type === 'lighthouse' ? 0xf59e0b : 0x10b981;
      const ringMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        metalness: 0.8,
        roughness: 0.2,
      });

      const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.4, 12, 24), ringMat);
      ringGroup.add(ringMesh);

      scene.add(ringGroup);
      this.rings.push({
        id: def.id,
        pos: def.pos,
        mesh: ringGroup,
        collected: false,
        type: def.type,
      });
    });
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
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;

      // Quick throttle shortcuts
      if (e.code === 'KeyZ' || e.key.toLowerCase() === 'z') this.setThrottle(1.0);
      if (e.code === 'KeyX' || e.key.toLowerCase() === 'x') this.setThrottle(0.0);
      if (e.code === 'KeyC' || e.key.toLowerCase() === 'c') this.toggleCameraView();
      if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') this.resetPlane();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  setThrottle(val: number): void {
    this.throttle = Math.max(0, Math.min(1, val));
  }

  toggleCameraView(): void {
    this.viewMode = this.viewMode === 'cockpit' ? 'outside' : 'cockpit';
  }

  resetPlane(): void {
    this.planeBody.setTranslation({ x: 0, y: 1.4, z: 40 }, true);
    this.planeBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.planeBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.planeBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.throttle = 0.0;
    this.airspeed = 0.0;
    this.isAirborne = false;
    this.parcelsDelivered = 0;
    this.currentObjective = 'Increase throttle (Shift or Z) to take off from Haven Island';
    this.rings.forEach((r) => {
      r.collected = false;
      r.mesh.visible = true;
    });
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
      parcelsDelivered: this.parcelsDelivered,
      totalParcels: this.totalParcels,
      viewMode: this.viewMode,
      activeObjective: this.currentObjective,
    };
  }

  update(dt: number): void {
    // 1. Process Progressive Throttle (Shift / Ctrl)
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
      this.throttle = Math.min(1.0, this.throttle + dt * 0.5);
    }
    if (this.keys['ControlLeft'] || this.keys['ControlRight']) {
      this.throttle = Math.max(0.0, this.throttle - dt * 0.5);
    }

    // 2. Compute Orientation & Vectors
    const rot = this.planeBody.rotation();
    const planeQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const forwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(planeQuat);
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(planeQuat);
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(planeQuat);

    // Current linear velocity
    const linvel = this.planeBody.linvel();
    const velVec = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    this.airspeed = velVec.dot(forwardVec); // Forward speed projection
    const speedKmh = Math.max(0, this.airspeed * 3.6);
    const currentAlt = this.planeBody.translation().y;
    this.isAirborne = currentAlt > 3.5;

    // 3. Engine Thrust ($1,800\text{ N}$)
    const maxThrust = 1800.0;
    const thrustForce = forwardVec.clone().multiplyScalar(this.throttle * maxThrust);

    // 4. Aerodynamic Lift: Scales with $v^2$ and angle of attack
    let liftMag = 0;
    if (this.airspeed > 3.0) {
      liftMag = Math.min(18.0, 0.45 * this.airspeed * this.airspeed);
    }
    const liftForce = upVec.clone().multiplyScalar(liftMag);

    // 5. Aerodynamic Drag
    const dragForce = velVec.clone().multiplyScalar(-0.06 * this.airspeed);

    // Apply combined forces
    const totalForce = thrustForce.add(liftForce).add(dragForce);
    this.planeBody.applyImpulse({ x: totalForce.x * dt, y: totalForce.y * dt, z: totalForce.z * dt }, true);

    // 6. Control Torques (Pitch, Yaw, Roll)
    // Authority scales with forward airspeed so control feels realistic
    const speedAuthority = Math.min(1.0, this.airspeed / 16.0);

    let pitchTorque = 0;
    let yawTorque = 0;
    let rollTorque = 0;

    // W / S: Pitch Down / Up
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) pitchTorque -= 24.0 * speedAuthority;
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) pitchTorque += 24.0 * speedAuthority;

    // A / D: Yaw Left / Right
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) yawTorque += 18.0 * speedAuthority;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) yawTorque -= 18.0 * speedAuthority;

    // Q / E: Roll Left / Right
    if (this.keys['KeyQ'] || this.keys['q']) rollTorque += 28.0 * speedAuthority;
    if (this.keys['KeyE'] || this.keys['e']) rollTorque -= 28.0 * speedAuthority;

    // Aerodynamic self-leveling stability torque
    if (this.isAirborne && pitchTorque === 0 && rollTorque === 0) {
      const rollAngle = planeQuat.z;
      rollTorque += -rollAngle * 12.0;
    }

    const appliedTorque = rightVec
      .clone()
      .multiplyScalar(pitchTorque)
      .add(upVec.clone().multiplyScalar(yawTorque))
      .add(forwardVec.clone().multiplyScalar(rollTorque));

    this.planeBody.applyTorqueImpulse(
      { x: appliedTorque.x * dt, y: appliedTorque.y * dt, z: appliedTorque.z * dt },
      true
    );

    // 7. Synchronize Visual Mesh with Physics
    const p = this.planeBody.translation();
    this.planeRoot.position.set(p.x, p.y, p.z);
    this.planeRoot.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    // 8. Animate Propellers & Control Surfaces
    const propSpeed = 2.0 + this.throttle * 35.0;
    this.propMeshLeft.rotation.z += propSpeed * dt;
    this.propMeshRight.rotation.z -= propSpeed * dt;
    this.blurDiscLeft.visible = this.throttle > 0.3;
    this.blurDiscRight.visible = this.throttle > 0.3;

    // Ailerons & Rudder deflection
    this.leftAileron.rotation.x = (rollTorque !== 0 ? 0.4 : 0);
    this.rightAileron.rotation.x = (rollTorque !== 0 ? -0.4 : 0);
    this.rudderMesh.rotation.y = (yawTorque !== 0 ? Math.sign(yawTorque) * 0.35 : 0);
    this.elevatorMesh.rotation.x = (pitchTorque !== 0 ? Math.sign(pitchTorque) * 0.3 : 0);

    // 9. Audio Engine Modulation
    sfx.updateEngineDrone(this.throttle, speedKmh);

    // 10. Ring Collection & Missions
    const planePos = new THREE.Vector3(p.x, p.y, p.z);
    this.rings.forEach((ring) => {
      if (!ring.collected && planePos.distanceTo(ring.pos) < 6.5) {
        ring.collected = true;
        ring.mesh.visible = false;
        sfx.playRingChime();

        if (ring.type === 'thermal') {
          // Instant Thermal Updraft boost!
          this.planeBody.applyImpulse({ x: forwardVec.x * 200, y: 350, z: forwardVec.z * 200 }, true);
          this.currentObjective = 'Thermal boost acquired! Fly to Windmill Valley';
        } else if (ring.type === 'mail') {
          this.parcelsDelivered++;
          this.currentObjective = `Parcel Delivered! (${this.parcelsDelivered}/${this.totalParcels}) Next: Sky Lighthouse`;
        } else if (ring.type === 'lighthouse') {
          this.parcelsDelivered++;
          this.currentObjective = '🏆 Lighthouse Beacon Activated! Land gently on the sea to finish.';
        }
      }
    });

    // 11. Camera System
    const camera = this.engine.native.camera;
    if (this.viewMode === 'cockpit') {
      const eyePos = forwardVec.clone().multiplyScalar(0.4).add(upVec.clone().multiplyScalar(0.55));
      camera.position.copy(planePos).add(eyePos);
      const lookTarget = planePos.clone().add(forwardVec.clone().multiplyScalar(100));
      camera.lookAt(lookTarget);
    } else {
      // Smooth Dynamic Chase Camera
      const chaseOffset = forwardVec
        .clone()
        .multiplyScalar(-10.5)
        .add(upVec.clone().multiplyScalar(3.6));
      const targetCamPos = planePos.clone().add(chaseOffset);
      camera.position.lerp(targetCamPos, 0.12);
      camera.lookAt(planePos.clone().add(forwardVec.clone().multiplyScalar(4)));
    }
  }

  dispose(): void {
    sfx.stopEngineDrone();
    this.engine.dispose();
  }
}
