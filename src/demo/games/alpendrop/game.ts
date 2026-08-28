/**
 * AlpenDrop Master Game Orchestrator
 * Connects Renderoni engine, physics simulation, flight dynamics, magnetic slings, and cozy UI.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRenderoni, type RenderoniEngine } from '../../../index.js';
import { type EntityInstance } from '../../../presets/index.js';
import { vfx } from '../../../vfx/index.js';
import { audio } from '../../../audio/index.js';
import { ui } from '../../../ui/index.js';

import { AlpineTerrain } from './world/terrain.js';
import { AlpineLandmarks } from './world/landmarks.js';
import { AlpineEnvironment } from './world/environment.js';
import { WindSystem } from './flight/wind-system.js';
import { DroneFlightController } from './flight/drone-controller.js';
import { PlaneFlightController } from './flight/plane-controller.js';
import { createVehicleModel, type VehicleModelHierarchy } from './flight/vehicle-models.js';
import { VEHICLE_CATALOG } from './flight/specs.js';
import type { FlightInputState, FlightTelemetry, VehicleId } from './flight/types.js';
import { MagneticSlingSystem } from './cargo/tether-system.js';
import { ParcelEntity } from './cargo/parcel-entity.js';
import { DeliveryZoneManager } from './cargo/delivery-zones.js';
import { CareerStore } from './agency/career-store.js';
import { CAMPAIGN_ORDERS, type DeliveryOrder } from './agency/orders.js';
import { FlightHUD } from './ui/flight-hud.js';
import { MissionNotices } from './ui/mission-notices.js';
import { AgencyModals } from './ui/agency-modals.js';
import { alpineSFX } from './audio/alpine-sfx.js';
import './ui/styles.css';

// Module-level zero-GC scratch variables
const _scratchCamPos = new THREE.Vector3();
const _scratchCamTarget = new THREE.Vector3();
const _scratchForward = new THREE.Vector3();
const _scratchUp = new THREE.Vector3();
const _scratchRight = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchInterpPos = new THREE.Vector3();
const _scratchInterpRot = new THREE.Quaternion();
const _scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _scratchTelemetryQuat = new THREE.Quaternion();

export class AlpenDropGame {
  engine!: RenderoniEngine;
  private canvas: HTMLCanvasElement;

  // Subsystems & World
  terrain = new AlpineTerrain();
  landmarks = new AlpineLandmarks();
  environment = new AlpineEnvironment();
  windSystem = new WindSystem();
  career = new CareerStore();
  deliveryZones!: DeliveryZoneManager;
  hud = new FlightHUD();
  notices!: MissionNotices;
  modals!: AgencyModals;

  // Renderoni Managed Entities
  private vehicleEntity: EntityInstance | null = null;
  private parcelEntity: EntityInstance | null = null;

  // Current Active Aircraft
  currentVehicleModel!: VehicleModelHierarchy;
  droneController: DroneFlightController | null = null;
  planeController: PlaneFlightController | null = null;
  aircraftBody!: RAPIER.RigidBody;
  aircraftCollider!: RAPIER.Collider;

  private uiRoot: HTMLElement | null = null;

  // Cargo & Sling
  slingSystem!: MagneticSlingSystem;
  activeParcels: ParcelEntity[] = [];
  activeOrder: DeliveryOrder | null = null;
  orderTimerSeconds: number = 0;
  orderElapsedTime: number = 0;

  // Sub-Tick Presentation Interpolation (Hermite sub-frame lerp - zero tick stutter!)
  private prevPos = new THREE.Vector3(0, 4, 8);
  private currPos = new THREE.Vector3(0, 4, 8);
  private prevRot = new THREE.Quaternion();
  private currRot = new THREE.Quaternion();

  // View Mode
  viewMode: 'chase' | 'cockpit' | 'sling' = 'cockpit';
  private smoothFocus = new THREE.Vector3(0, 4, 8);
  private smoothYaw: number = 0;
  private camInitialized: boolean = false;

  // Input state
  inputState: FlightInputState = {
    throttleUp: false,
    throttleDown: false,
    pitchForward: false,
    pitchBack: false,
    rollLeft: false,
    rollRight: false,
    yawLeft: false,
    yawRight: false,
    releaseCargo: false,
    toggleMagnet: false,
    toggleDevAssist: false,
    switchCamera: false,
  };

  private keys: Record<string, boolean> = {};
  private unbindEvents: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(): Promise<void> {
    // 0. Ensure Full DOM Layer (HUD, Compass, Modals, Notices, FPV Lens) Exists
    this.ensureUIElements();

    // 1. Create Renderoni Engine with Rapier WASM + VFX + Audio + UI
    this.engine = await createRenderoni({
      mode: 'interactive',
      canvas: this.canvas,
      seed: 42,
      gravity: [0, -9.81, 0],
      subsystems: [vfx(), audio(), ui()],
    });

    const scene = this.engine.native.scene;
    const world = this.engine.native.world;
    const camera = this.engine.native.camera;

    // 2. Setup Environment Lighting, Skybox & Fog
    this.environment.setup(scene, camera);

    // 3. Build Mountain Terrain & Rapier Trimesh Colliders
    this.terrain.build(scene, world);

    // 4. Build Town Architecture, Chalets, Windmills, Cows & Forest
    this.landmarks.build(scene, world);

    // 5. Initialize Dynamic 3D Wind Currents & Stream Particle VFX
    this.windSystem.initVisuals(scene);

    // 6. Setup Delivery Zones & Target Pads
    this.deliveryZones = new DeliveryZoneManager(scene);
    this.setupDeliveryZones();

    // 6. Spawn Initial Aircraft (The Sparrow)
    this.spawnVehicle(this.career.currentVehicleId);

    // 7. Initialize Audio & UI
    alpineSFX.init();
    this.modals = new AgencyModals(this.career);
    this.notices = new MissionNotices();
    this.modals.setCallbacks(
      (order) => this.startDeliveryOrder(order),
      (vehicleId) => this.spawnVehicle(vehicleId)
    );

    this.hud.init(
      this.career,
      () => this.modals.showJobBoard(),
      () => this.modals.showHangar(),
      () => this.toggleDevAssists(),
      () => this.toggleMagneticLatch(),
      () => this.cycleCameraView()
    );

    // 8. Register Controls & Action Handlers
    this.setupInputListeners();
    this.setupActions();

    // 9. Register Simulation Systems in Renderoni
    this.engine.systems.add({
      phase: 'prePhysics',
      update: ({ dt }) => this.stepSimulation(dt),
    });

    // 10. Open with a delivery straight away, but vary which one each session
    this.startDeliveryOrder(this.pickOpeningOrder());
    this.syncFpvOverlay();

    // 11. Start Presentation Loop
    this.engine.start((dt) => this.renderUpdate(dt));
  }

  /**
   * Chooses the delivery the player starts the session with. Any order they have
   * the trust stamps for is fair game, and the previous session's pick is
   * excluded so the opening job is not the same run after run.
   */
  private pickOpeningOrder(): DeliveryOrder {
    const LAST_KEY = 'alpendrop:lastOpeningOrder';
    const unlocked = CAMPAIGN_ORDERS.filter((o) => o.requiredStamps <= this.career.trustStamps);
    const pool = unlocked.length > 0 ? unlocked : [CAMPAIGN_ORDERS[0]];

    let lastId: string | null = null;
    try {
      lastId = window.localStorage.getItem(LAST_KEY);
    } catch {
      lastId = null;
    }

    const notRepeated = pool.filter((o) => o.id !== lastId);
    const choices = notRepeated.length > 0 ? notRepeated : pool;
    const pickIndex = this.engine?.prng
      ? Math.floor(this.engine.prng.nextFloat() * choices.length)
      : Math.floor(Math.random() * choices.length);
    const pick = choices[pickIndex];

    try {
      window.localStorage.setItem(LAST_KEY, pick.id);
    } catch {
      /* private browsing / storage disabled - a repeat pick is harmless */
    }

    return pick;
  }

  private setupDeliveryZones(): void {
    const locs = this.landmarks.locations;
    this.deliveryZones.registerZone({
      id: 'town_square',
      name: 'Town Hall Rooftop Pad',
      locationDescription: 'Elevated wooden helipad on Town Hall roof',
      position: [-30, 10.0, -26],
      radius: 6.0,
      colorHex: 0xfacc15,
    });
    this.deliveryZones.registerZone({
      id: 'bakery_balcony',
      name: "Grandma's Bakery Rooftop Pad",
      locationDescription: 'Rooftop delivery helipad on bakery roof',
      position: locs.bakeryBalcony,
      radius: 6.0,
      colorHex: 0xd97706,
    });
    this.deliveryZones.registerZone({
      id: 'monastery_terrace',
      name: "Monk's Peak Summit Lookout",
      locationDescription: 'High clifftop terrace perched on the summit',
      position: locs.monasteryTerrace,
      radius: 8.0,
      colorHex: 0x38bdf8,
    });
    this.deliveryZones.registerZone({
      id: 'windmill_ridge',
      name: 'Windmill Ridge Observation Deck',
      locationDescription: 'Observation helipad deck next to the windmills',
      position: locs.windmillRidge,
      radius: 6.5,
      colorHex: 0x22c55e,
    });
    this.deliveryZones.registerZone({
      id: 'dairy_meadow',
      name: 'Dairy Barn Rooftop Pad',
      locationDescription: 'Barn rooftop helipad in the cow pasture',
      position: locs.dairyMeadow,
      radius: 7.0,
      colorHex: 0xa855f7,
    });
    this.deliveryZones.registerZone({
      id: 'gorge_bridge',
      name: 'Covered Bridge Chalet Roof',
      locationDescription: 'River bank chalet rooftop deck near the bridge',
      position: locs.gorgeBridge,
      radius: 8.0,
      colorHex: 0xec4899,
    });
    this.deliveryZones.registerZone({
      id: 'seeberg_lakeside',
      name: 'Seeberg Lakeside Pier Pad',
      locationDescription: 'Wooden fishing pier helipad on Lake Seeberg',
      position: locs.seebergLakeside,
      radius: 8.5,
      colorHex: 0x06b6d4,
    });
    this.deliveryZones.registerZone({
      id: 'bergdorf_hamlet',
      name: 'Bergdorf Overlook Landing Deck',
      locationDescription: 'Ski lodge rooftop helipad in Bergdorf Hamlet',
      position: locs.bergdorfHamlet,
      radius: 8.5,
      colorHex: 0x10b981,
    });
  }

  spawnVehicle(vehicleId: VehicleId): void {
    const scene = this.engine.native.scene;
    const world = this.engine.native.world;
    const specs = VEHICLE_CATALOG[vehicleId];

    // Cleanup previous aircraft entity and resources
    if (this.vehicleEntity) {
      this.vehicleEntity.destroy();
      this.vehicleEntity = null;
    }
    if (this.currentVehicleModel) {
      scene.remove(this.currentVehicleModel.root);
      if (this.slingSystem) this.slingSystem.dispose();
      if (this.aircraftCollider) world.removeCollider(this.aircraftCollider, false);
      if (this.aircraftBody) world.removeRigidBody(this.aircraftBody);
    }

    // 1. Build Model Hierarchy
    this.currentVehicleModel = createVehicleModel(vehicleId);
    scene.add(this.currentVehicleModel.root);

    // 2. Spawn Position (Helipad for drones, Runway for planes)
    const isPlane = specs.vehicleClass === 'plane';
    const spawnPos = isPlane ? this.landmarks.locations.airstripRunway : this.landmarks.locations.hangarHelipad;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPos[0], spawnPos[1] + 0.8, spawnPos[2])
      .setLinearDamping(0.9)
      .setAngularDamping(4.0)
      .setCcdEnabled(true);

    this.aircraftBody = world.createRigidBody(bodyDesc);

    const colliderDesc = isPlane
      ? RAPIER.ColliderDesc.roundCuboid(1.2, 0.28, 1.4, 0.05).setFriction(0.15).setRestitution(0.0)
      : RAPIER.ColliderDesc.roundCuboid(0.48, 0.22, 0.48, 0.08).setFriction(0.15).setRestitution(0.0);

    colliderDesc.setMass(specs.massKg);
    this.aircraftCollider = world.createCollider(colliderDesc, this.aircraftBody);

    // 3. Register as Renderoni Entity
    this.vehicleEntity = this.engine.add({
      id: 'player_aircraft',
      tags: ['player', 'aircraft', 'vehicle', specs.vehicleClass],
      state: {
        vehicleId,
        vehicleClass: specs.vehicleClass,
        massKg: specs.massKg,
        throttle: 0,
        battery: 100,
        isAirborne: false,
      },
      native: {
        three: { object: this.currentVehicleModel.root, ownership: 'borrowed' },
        rapier: {
          body: this.aircraftBody,
          colliders: [this.aircraftCollider],
          ownership: 'borrowed',
        },
      },
    });

    // 4. Instantiate Flight Controller
    if (isPlane) {
      this.planeController = new PlaneFlightController(this.aircraftBody, specs, this.windSystem);
      this.planeController.setAssists(this.career.gyroLevel);
      this.planeController.setDevAssists(this.career.devAssistsEnabled);
      this.droneController = null;
    } else {
      this.droneController = new DroneFlightController(this.aircraftBody, specs, this.windSystem);
      this.droneController.setAssists(
        this.career.gyroLevel,
        this.career.autoHoverTrim,
        this.career.cushionedSkids
      );
      this.droneController.setDevAssists(this.career.devAssistsEnabled);
      this.planeController = null;
    }

    // 5. Instantiate Magnetic Sling Tether System
    this.slingSystem = new MagneticSlingSystem(
      world,
      this.aircraftBody,
      this.currentVehicleModel.slingAnchor,
      scene,
      specs.slingLengthM,
      specs.magneticRadiusM
    );

    this.slingSystem.onLatch = () => {
      alpineSFX.playMagnetSnap();
      this.notices?.show('🧲', 'Parcel secured', 'Fly it to the drop pad, then press F to release.', 'good');
      if (this.activeOrder) {
        this.deliveryZones.setActiveZone(this.activeOrder.targetZoneId);
      }
      (this.engine as any).vfx?.spawnParticles?.({
        position: this.currentVehicleModel.slingAnchor.getWorldPosition(new THREE.Vector3()).toArray(),
        count: 12,
        color: 0x38bdf8,
        speed: 1.2,
      });
    };

    this.slingSystem.onDrop = (p) => {
      alpineSFX.playDrop();
      if (this.career.hasParachuteKit) {
        p.state.hasParachute = true;
      }
    };

    this.resetAircraft();
    this.syncFpvOverlay();
  }

  startDeliveryOrder(order: DeliveryOrder): void {
    this.activeOrder = order;
    this.orderTimerSeconds = order.timeLimitSeconds;
    this.orderElapsedTime = 0;
    this.deliveryZones.setActiveZone(null); // Keep destination beam off until cargo is latched!

    // Clean up previous parcel entity and uncompleted parcels
    if (this.parcelEntity) {
      this.parcelEntity.destroy();
      this.parcelEntity = null;
    }
    for (const p of this.activeParcels) {
      if (!p.state.isDelivered) {
        this.engine.native.scene.remove(p.mesh);
        p.dispose(this.engine.native.world);
      }
    }
    this.activeParcels = [];

    // Spawn New Parcel at Sender's Position
    const parcel = new ParcelEntity(
      this.engine.native.world,
      order.parcelConfig,
      order.senderPosition,
      this.career.hasParachuteKit
    );

    parcel.onImpact = (spd) => {
      alpineSFX.playImpact(spd);
      (this.engine as any).vfx?.screenShake?.(Math.min(0.8, spd * 0.08), 0.25);
    };

    parcel.onBreak = () => {
      this.notices?.show('💔', 'Parcel destroyed', 'That landing was too hard. Press H to take another job.', 'bad', 6000);
      alpineSFX.playImpact(10);
      (this.engine as any).vfx?.spawnParticles?.({
        position: parcel.mesh.position.toArray(),
        count: 35,
        color: order.parcelConfig.colorHex,
        speed: 3.5,
      });
    };

    this.engine.native.scene.add(parcel.mesh);
    this.activeParcels.push(parcel);

    // Register parcel entity in Renderoni
    this.parcelEntity = this.engine.add({
      id: `parcel_${order.id}`,
      tags: ['parcel', 'cargo', order.parcelConfig.kind],
      state: { ...parcel.state } as Record<string, unknown>,
      native: {
        three: { object: parcel.mesh, ownership: 'borrowed' },
        rapier: {
          body: parcel.body,
          colliders: [parcel.collider],
          ownership: 'borrowed',
        },
      },
    });

    this.notices?.show('📬', order.title, `Collect from ${order.senderLocationName}.`, 'info', 6000);
  }

  private setupInputListeners(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      this.keys[e.code] = true;
      if (e.key) {
        this.keys[e.key.toLowerCase()] = true;
      }

      // F = Dedicated Magnetic Sling Snap / Drop Key
      if (e.code === 'KeyF' || e.key?.toLowerCase() === 'f') {
        this.toggleMagneticLatch();
      }

      // O = Toggle Dev Assists Sandbox
      if (e.code === 'KeyO' || e.key?.toLowerCase() === 'o') {
        this.toggleDevAssists();
      }

      // C = Toggle Camera View
      if (e.code === 'KeyC' || e.key?.toLowerCase() === 'c') {
        this.cycleCameraView();
      }

      // H = Open Job Board / Hangar
      if (e.code === 'KeyH' || e.key?.toLowerCase() === 'h') {
        this.resetInputs();
        this.modals.showJobBoard();
      }

      // R = Reset to Helipad / Runway
      if (e.code === 'KeyR' || e.key?.toLowerCase() === 'r') {
        this.resetAircraft();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      if (e.key) {
        this.keys[e.key.toLowerCase()] = false;
      }
    };

    const onBlur = () => {
      this.resetInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // Prevent button click retention of focus
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') {
        (e.target as HTMLElement).blur();
      }
    });

    this.unbindEvents.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur)
    );
  }

  resetInputs(): void {
    this.keys = {};
    this.inputState.throttleUp = false;
    this.inputState.throttleDown = false;
    this.inputState.pitchForward = false;
    this.inputState.pitchBack = false;
    this.inputState.rollLeft = false;
    this.inputState.rollRight = false;
    this.inputState.yawLeft = false;
    this.inputState.yawRight = false;
  }

  private setupActions(): void {
    this.engine.actions.register({
      name: 'flight.setThrottle',
      handle: (val: any) => {
        const t = typeof val === 'number' ? val : 1.0;
        if (this.droneController) this.droneController.throttle = t;
        if (this.planeController) this.planeController.throttle = t;
      },
    });
    this.engine.actions.register({
      name: 'cargo.drop',
      handle: () => this.slingSystem.dropCargo(),
    });
    this.engine.actions.register({
      name: 'cargo.toggleMagnet',
      handle: () => this.toggleMagneticLatch(),
    });
    this.engine.actions.register({
      name: 'flight.toggleDevAssist',
      handle: () => this.toggleDevAssists(),
    });
    this.engine.actions.register({
      name: 'flight.reset',
      handle: () => this.resetAircraft(),
    });
    this.engine.actions.register({
      name: 'agency.acceptOrder',
      handle: (orderId: string) => {
        const order = CAMPAIGN_ORDERS.find((o) => o.id === orderId);
        if (order) this.startDeliveryOrder(order);
      },
    });
  }

  toggleMagneticLatch(): void {
    if (this.slingSystem.latchedParcel) {
      this.slingSystem.dropCargo();
    } else {
      this.slingSystem.toggleArm();
    }
  }

  toggleDevAssists(): void {
    const enabled = this.career.toggleDevAssists();
    if (this.droneController) this.droneController.setDevAssists(enabled);
    if (this.planeController) this.planeController.setDevAssists(enabled);
  }

  cycleCameraView(): void {
    if (this.viewMode === 'chase') this.viewMode = 'cockpit';
    else if (this.viewMode === 'cockpit') this.viewMode = 'sling';
    else this.viewMode = 'chase';
    this.syncFpvOverlay();
  }

  /** The lens/OSD overlay only makes sense looking through the drone's own FPV camera. */
  private syncFpvOverlay(): void {
    const overlay = document.getElementById('fpv-overlay');
    if (!overlay) return;
    const show = this.viewMode === 'cockpit' && !this.planeController;
    overlay.classList.toggle('active', show);
  }

  resetAircraft(): void {
    const isPlane = !!this.planeController;
    const pos = isPlane ? this.landmarks.locations.airstripRunway : this.landmarks.locations.hangarHelipad;
    if (this.droneController) this.droneController.reset(pos[0], pos[1] + 0.6, pos[2], 0);
    if (this.planeController) this.planeController.reset(pos[0], pos[1] + 0.6, pos[2], 0);
    this.prevPos.set(pos[0], pos[1] + 0.6, pos[2]);
    this.currPos.set(pos[0], pos[1] + 0.6, pos[2]);
    this.prevRot.set(0, 0, 0, 1);
    this.currRot.set(0, 0, 0, 1);
    this.smoothFocus.set(pos[0], pos[1] + 0.6, pos[2]);
    this.smoothYaw = 0;
    this.camInitialized = false;
  }

  private updateInputState(): void {
    this.inputState.throttleUp = !!(
      this.keys['Space'] ||
      this.keys['ShiftLeft'] ||
      this.keys['ShiftRight'] ||
      this.keys['shift'] ||
      this.keys['KeyZ'] ||
      this.keys['z']
    );
    this.inputState.throttleDown = !!(
      this.keys['ControlLeft'] ||
      this.keys['ControlRight'] ||
      this.keys['control'] ||
      this.keys['KeyC'] ||
      this.keys['KeyX'] ||
      this.keys['x']
    );
    this.inputState.pitchForward = !!(this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']);
    this.inputState.pitchBack = !!(this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']);
    this.inputState.rollLeft = !!(this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']);
    this.inputState.rollRight = !!(this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']);
    this.inputState.yawLeft = !!(this.keys['KeyQ'] || this.keys['q']);
    this.inputState.yawRight = !!(this.keys['KeyE'] || this.keys['e']);
  }

  private stepSimulation(dt: number): void {
    // 1. Record transform snapshot before physics step
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);

    this.updateInputState();
    this.windSystem.update(dt);

    const pos = this.aircraftBody.translation();
    const groundHeight = AlpineTerrain.getElevation(pos.x, pos.z);

    // Step Active Flight Controller
    if (this.droneController) {
      this.droneController.step(dt, this.inputState, groundHeight);
    } else if (this.planeController) {
      this.planeController.step(dt, this.inputState, groundHeight);
    }

    // Step Parcels & Magnetic Sling Physics
    for (const parcel of this.activeParcels) {
      const pPos = parcel.body.translation();
      const pGround = AlpineTerrain.getElevation(pPos.x, pPos.z);
      parcel.update(dt, pGround);
    }

    this.slingSystem.step(dt, this.activeParcels);

    // Check Order Timer & Target Zone Delivery Completion
    if (this.activeOrder && this.activeParcels.length > 0) {
      this.orderElapsedTime += dt;
      const targetParcel = this.activeParcels[0];

      // Update distance to delivery target
      const pPos = targetParcel.body.translation();
      const targetPos = this.activeOrder.targetPosition;
      targetParcel.state.distanceToTargetM = Math.hypot(pPos.x - targetPos[0], pPos.z - targetPos[2]);

      // Check if parcel settled into the target delivery zone!
      if (!targetParcel.state.isDelivered && !targetParcel.state.isBroken) {
        const evalResult = this.deliveryZones.checkDelivery(
          this.activeOrder.targetZoneId,
          targetParcel,
          this.activeOrder.timeLimitSeconds,
          this.orderElapsedTime
        );

        if (evalResult && evalResult.success) {
          alpineSFX.playSuccessJingle();
          this.career.addReward(evalResult.totalRewardFrancs, evalResult.trustStampsEarned);
          this.deliveryZones.setActiveZone(null);
          this.notices.showDeliveryResult(evalResult);

          // Auto-detach sling cable immediately upon job completion!
          if (this.slingSystem.latchedParcel) {
            this.slingSystem.dropCargo();
          }
          targetParcel.state.isLatched = false;
          targetParcel.state.isDelivered = true;

          this.activeOrder = null;
        }
      }
    }

    // 2. Record new authoritative transform snapshot after physics step
    const finalPos = this.aircraftBody.translation();
    const finalRot = this.aircraftBody.rotation();
    this.currPos.set(finalPos.x, finalPos.y, finalPos.z);
    this.currRot.set(finalRot.x, finalRot.y, finalRot.z, finalRot.w);
  }

  private renderUpdate(dt: number): void {
    // 1. Sub-Tick Hermite / Slerp Presentation Interpolation (Eliminates fixed-tick jitter!)
    const alpha = Math.max(0, Math.min(1, (this.engine as any).clock?.alpha ?? 1.0));
    _scratchInterpPos.lerpVectors(this.prevPos, this.currPos, alpha);
    _scratchInterpRot.slerpQuaternions(this.prevRot, this.currRot, alpha);

    this.currentVehicleModel.root.position.copy(_scratchInterpPos);
    this.currentVehicleModel.root.quaternion.copy(_scratchInterpRot);

    // Sync magnetic winch visual cables smoothly with interpolated vehicle mesh
    this.slingSystem.updateVisuals();

    // 2. Animate Propellers around each vehicle's true rotor axis
    const isPlane = !!this.planeController;
    const throttle = isPlane ? this.planeController!.throttle : this.droneController!.throttle;
    const propSpeed = (2.0 + throttle * 45.0) * dt;
    const spinAxis = this.currentVehicleModel.propSpinAxis;

    for (let i = 0; i < this.currentVehicleModel.propellers.length; i++) {
      const prop = this.currentVehicleModel.propellers[i];
      const delta = (i % 2 === 0 ? 1 : -1) * propSpeed;
      if (spinAxis === 'y') prop.rotation.y += delta;
      else prop.rotation.z += delta;
    }

    // In the FPV cockpit the rotors fill the frame, so fade the blur discs in
    // gradually instead of popping them on at a single throttle threshold.
    const inCockpit = this.viewMode === 'cockpit';
    const blurOpacity = inCockpit
      ? Math.min(0.2, Math.max(0, (throttle - 0.15) * 0.34))
      : Math.min(0.25, Math.max(0, (throttle - 0.4) * 0.9));
    for (const blur of this.currentVehicleModel.blurDiscs) {
      blur.visible = blurOpacity > 0.01;
      const mat = blur.material as THREE.Material & { opacity: number };
      mat.opacity = blurOpacity;
    }

    // Animate plane control surfaces
    if (this.planeController && this.currentVehicleModel.controlSurfaces) {
      const cs = this.currentVehicleModel.controlSurfaces;
      if (cs.leftAileron) cs.leftAileron.rotation.x = this.planeController.roll * 0.7;
      if (cs.rightAileron) cs.rightAileron.rotation.x = -this.planeController.roll * 0.7;
      if (cs.elevator) cs.elevator.rotation.x = this.planeController.pitch * 0.8;
      if (cs.rudder) cs.rudder.rotation.y = (this.keys['KeyQ'] ? 0.35 : 0) + (this.keys['KeyE'] ? -0.35 : 0);
    }

    // 3. Update Audio, Landmarks & Environment
    const vel = this.aircraftBody.linvel();
    const speedKmh = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) * 3.6;
    alpineSFX.updateFlightAudio(isPlane, throttle, speedKmh, dt);
    this.landmarks.update(dt);
    this.environment.update(dt);
    this.deliveryZones.update(dt);

    // 4. Update Camera using Interpolated Coordinates (Silky smooth 144Hz!)
    this.updateCamera(dt, _scratchInterpPos, _scratchInterpRot);

    // 5. Update HUD Telemetry, Minimap & Nav Arrow
    const telemetry = this.getTelemetry();
    const targetParcel = this.activeParcels[0] ?? null;
    const timeRemaining = Math.max(0, (this.activeOrder?.timeLimitSeconds ?? 0) - this.orderElapsedTime);
    this.hud.update(telemetry, _scratchInterpPos, this.activeOrder, targetParcel, timeRemaining, this.engine.native.camera);
  }

  private updateCamera(dt: number, currentPos: THREE.Vector3, currentRot: THREE.Quaternion): void {
    const camera = this.engine.native.camera as THREE.PerspectiveCamera;
    const isPlane = !!this.planeController;
    const currentYaw = isPlane ? this.planeController!.yaw : this.droneController!.yaw;

    if (!this.camInitialized) {
      this.smoothFocus.copy(currentPos);
      this.smoothYaw = currentYaw;
      this.camInitialized = true;
    }

    if (this.viewMode === 'cockpit') {
      _scratchForward.set(0, 0, -1).applyQuaternion(currentRot);
      _scratchUp.set(0, 1, 0).applyQuaternion(currentRot);

      if (isPlane) {
        // Cockpit view for Airplane / Glider:
        // Positioned inside canopy looking forward over the nose, showcasing both aerodynamic wings!
        camera.fov = 82;
        camera.updateProjectionMatrix();

        _scratchCamPos
          .copy(currentPos)
          .addScaledVector(_scratchUp, 0.36)
          .addScaledVector(_scratchForward, 0.24);
        camera.position.copy(_scratchCamPos);
        const lookTarget = _scratchCamPos.clone().addScaledVector(_scratchForward, 100);
        camera.up.copy(_scratchUp);
        camera.lookAt(lookTarget);
      } else {
        // FPV cockpit for the multirotor: the camera rides on a mast just above
        // the canopy, ahead of the airframe's centre of mass. From here the two
        // front rotor discs and their duct guards frame the lower corners of the
        // shot while the centre of the view stays clear for flying.
        camera.fov = 88;
        camera.updateProjectionMatrix();

        _scratchRight.set(1, 0, 0).applyQuaternion(currentRot);

        _scratchCamPos
          .copy(currentPos)
          .addScaledVector(_scratchUp, 0.58)
          .addScaledVector(_scratchForward, 0.05);

        // Motor vibration: tiny high-frequency jitter that scales with throttle
        const droneThrottle = this.droneController ? this.droneController.throttle : 0;
        const jitter = 0.0016 + droneThrottle * 0.0042;
        const t = performance.now();
        _scratchCamPos
          .addScaledVector(_scratchRight, Math.sin(t * 0.081) * jitter)
          .addScaledVector(_scratchUp, Math.sin(t * 0.117) * jitter);

        camera.position.copy(_scratchCamPos);

        // Slight downward tilt (~5 deg) so the drop zone stays in view
        _scratchCamTarget
          .copy(_scratchCamPos)
          .addScaledVector(_scratchForward, 100)
          .addScaledVector(_scratchUp, -5.2);
        camera.up.copy(_scratchUp);
        camera.lookAt(_scratchCamTarget);
      }
    } else if (this.viewMode === 'sling') {
      camera.fov = 68;
      camera.updateProjectionMatrix();
      camera.up.set(0, 1, 0);

      const camDirX = -Math.sin(currentYaw);
      const camDirZ = -Math.cos(currentYaw);
      _scratchCamPos.set(currentPos.x - camDirX * 3.4, currentPos.y + 2.2, currentPos.z - camDirZ * 3.4);
      camera.position.lerp(_scratchCamPos, 1.0 - Math.exp(-14.0 * dt));
      const magPos = this.slingSystem.getMagnetWorldPosition(new THREE.Vector3());
      camera.lookAt(magPos);
    } else {
      // Butter-Smooth Rock-Solid Chase Camera (Interpolated Anchor - Zero Stutter/Jitter!)
      camera.fov = 65;
      camera.updateProjectionMatrix();
      camera.up.set(0, 1, 0);

      const followDist = isPlane ? 8.8 : 5.8;
      const heightOffset = isPlane ? 3.0 : 2.4;

      // 1. Responsive smooth focus tracking on interpolated coordinates
      const focusDamp = 1.0 - Math.exp(-24.0 * dt);
      this.smoothFocus.lerp(currentPos, focusDamp);

      // 2. Smooth angle wrapping yaw
      let dyaw = currentYaw - this.smoothYaw;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      this.smoothYaw += dyaw * (1.0 - Math.exp(-10.0 * dt));

      // 3. Exact placement relative to smoothFocus (Zero rubber-banding!)
      const camDirX = -Math.sin(this.smoothYaw);
      const camDirZ = -Math.cos(this.smoothYaw);

      camera.position.set(
        this.smoothFocus.x - camDirX * followDist,
        this.smoothFocus.y + heightOffset,
        this.smoothFocus.z - camDirZ * followDist
      );

      camera.lookAt(this.smoothFocus.x, this.smoothFocus.y + 0.32, this.smoothFocus.z);
    }
  }

  getTelemetry(): FlightTelemetry {
    const pos = this.aircraftBody.translation();
    const vel = this.aircraftBody.linvel();
    const rot = this.aircraftBody.rotation();
    const speedKmh = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) * 3.6;

    _scratchTelemetryQuat.set(rot.x, rot.y, rot.z, rot.w);
    _scratchEuler.setFromQuaternion(_scratchTelemetryQuat, 'YXZ');
    const isPlane = !!this.planeController;
    const ctrl = isPlane ? this.planeController! : this.droneController!;

    return {
      vehicleId: ctrl.specs.id,
      vehicleName: ctrl.specs.name,
      vehicleClass: ctrl.specs.vehicleClass,
      speedKmh,
      altitudeM: pos.y,
      verticalSpeedMs: vel.y,
      throttlePercent: ctrl.throttle,
      batteryPercent: ctrl.battery,
      pitchDeg: (_scratchEuler.x * 180) / Math.PI,
      rollDeg: (_scratchEuler.z * 180) / Math.PI,
      yawDeg: (_scratchEuler.y * 180) / Math.PI,
      isAirborne: ctrl.isAirborne,
      isStalling: isPlane ? this.planeController!.isStalling : false,
      windSpeedMs: this.windSystem.getBaseWindSpeed(),
      windHeadingDeg: this.windSystem.getBaseWindHeadingDeg(),
      inThermalUpdraft: this.windSystem.isInThermal(pos.x, pos.y, pos.z),
      activeWindAlert: this.windSystem.getActiveWindAlert(pos.x, pos.y, pos.z),
      devAssistsEnabled: this.career.devAssistsEnabled,
      magneticLatchArmed: this.slingSystem.isArmed,
      hasCargoAttached: !!this.slingSystem.latchedParcel,
      viewMode: this.viewMode,
    };
  }

  private ensureUIElements(): void {
    if (document.getElementById('ui-layer')) return;

    this.uiRoot = document.createElement('div');
    this.uiRoot.id = 'alpendrop-ui-root';
    this.uiRoot.innerHTML = `
      <div id="fpv-overlay" aria-hidden="true">
        <div class="fpv-lens"></div>
        <div class="fpv-smudge"></div>
        <svg class="fpv-scratches" viewBox="0 0 1600 900" preserveAspectRatio="none">
          <path d="M120 60 C 300 180, 520 240, 760 300" />
          <path d="M1480 120 C 1300 260, 1180 340, 1010 420" />
          <path d="M60 700 C 240 640, 420 600, 610 585" />
          <path d="M1540 760 C 1400 700, 1290 660, 1150 640" />
          <path d="M330 840 C 470 760, 600 720, 780 700" />
          <path d="M900 40 C 940 130, 960 190, 985 260" />
        </svg>
        <div class="fpv-dust">
          <span style="top:22%; left:16%; width:4px; height:4px;"></span>
          <span style="top:71%; left:29%; width:3px; height:3px;"></span>
          <span style="top:38%; left:74%; width:5px; height:5px;"></span>
          <span style="top:83%; left:63%; width:3px; height:3px;"></span>
          <span style="top:12%; left:55%; width:3px; height:3px;"></span>
          <span style="top:58%; left:88%; width:4px; height:4px;"></span>
          <span style="top:47%; left:8%; width:3px; height:3px;"></span>
        </div>
        <div class="fpv-osd">
          <span class="fpv-rec"><i></i>REC</span>
          <span class="fpv-cam">CAM-1 · 4K60</span>
        </div>
        <div class="fpv-reticle">
          <span class="fpv-tick fpv-tick-l"></span>
          <span class="fpv-tick fpv-tick-r"></span>
          <span class="fpv-dot"></span>
        </div>
      </div>

      <div id="notice-stack" aria-live="polite"></div>

      <div id="ui-layer">
        <div class="top-bar">
          <div class="agency-badge interactive" id="btn-open-hangar" title="Open Agency Hangar">
            <div class="agency-logo">🚁</div>
            <div class="agency-info">
              <div class="agency-title">AlpenDrop Airmail</div>
              <div class="agency-stats">
                <span class="stat-francs" id="hud-francs">75 ₣</span>
                <span class="stat-stamps" id="hud-stamps">★ 0</span>
              </div>
            </div>
          </div>

          <div class="top-center-cluster">
            <div class="compass-module">
              <div class="compass-tape-pointer">▼</div>
              <canvas id="compass-tape-canvas" width="360" height="26"></canvas>
              <div class="compass-sub-bar">
                <span class="compass-heading-text" id="compass-heading">N · 000°</span>
                <span class="waypoint-info" id="waypoint-info">📍 Press (H) for Job Board</span>
              </div>
            </div>

            <div class="quest-pill" id="quest-banner" style="display: none;">
              <span class="quest-step-text" id="quest-step-text">📦 STEP 1: Pick up Warm Apfelstrudel</span>
              <span class="quest-subtext" id="quest-subtext">Fly to Grandma Gretel (Bakery Rooftop Pad) & hover close to snap!</span>
            </div>
          </div>

          <div class="top-right-cluster">
            <div class="radar-container">
              <canvas id="radar-canvas" width="132" height="132"></canvas>
            </div>

            <div class="top-controls">
              <button class="hud-pill interactive" id="btn-open-jobs">📬 Jobs (H)</button>
              <button class="hud-pill interactive" id="btn-camera">🎥 View: COCKPIT (C)</button>
              <button class="hud-pill interactive" id="btn-magnet">🧲 Sling: ARMED (F)</button>
              <button class="hud-pill interactive active" id="btn-dev-assist">🧭 Dev Assist: ON (O)</button>
            </div>
          </div>
        </div>

        <div class="bottom-bar">
          <div class="flight-deck">
            <div class="gauges-cluster">
              <div class="gauge-item">
                <div class="gauge-value" id="gauge-speed">0</div>
                <div class="gauge-label">KM/H</div>
              </div>
              <div class="gauge-divider"></div>
              <div class="gauge-item">
                <div class="gauge-value" id="gauge-alt">0m</div>
                <div class="gauge-label">ALTITUDE</div>
              </div>
              <div class="gauge-divider"></div>
              <div class="gauge-item">
                <div class="gauge-value" id="gauge-battery">100%</div>
                <div class="gauge-label">BATTERY</div>
              </div>
            </div>
            <div class="throttle-deck">
              <span class="throttle-label">PWR</span>
              <div class="throttle-bar-container">
                <div class="throttle-fill" id="throttle-fill"></div>
              </div>
            </div>
          </div>

          <div class="postage-ticket" id="postage-ticket" style="display: none;">
            <div class="ticket-header">
              <span class="ticket-title" id="ticket-title">Alpine Delivery</span>
              <span class="ticket-stamp" id="ticket-timer">⏱️ 1:30</span>
            </div>
            <div class="ticket-body" id="ticket-recipient">To: Brother Anselm</div>
            <div class="health-bar-container">
              <div class="health-fill" id="health-fill"></div>
              <div class="health-text" id="health-text">Condition: 100%</div>
            </div>
            <div class="ticket-hint">
              Press <strong>F</strong> to drop parcel onto landing pad
            </div>
          </div>
        </div>
      </div>

      <div class="modal-backdrop" id="modal-backdrop" style="display: none;">
        <div class="modal-card interactive" id="modal-card"></div>
      </div>
    `;

    document.body.appendChild(this.uiRoot);
  }

  dispose(): void {
    for (const fn of this.unbindEvents) fn();
    this.unbindEvents = [];
    if (this.vehicleEntity) {
      this.vehicleEntity.destroy();
      this.vehicleEntity = null;
    }
    if (this.parcelEntity) {
      this.parcelEntity.destroy();
      this.parcelEntity = null;
    }
    if (this.uiRoot) {
      this.uiRoot.remove();
      this.uiRoot = null;
    }
    this.engine.dispose();
  }
}
