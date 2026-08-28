/**
 * High-Poly Stylized Alpine Aircraft 3D Models
 * Detailed multi-rotor drones and RC planes featuring carbon-fiber weaves, brushless outrunner motors,
 * cambered airfoil blades, glass canopies, propeller guards, and animated control surfaces.
 */

import * as THREE from 'three';
import type { VehicleId } from './types.js';

export interface VehicleModelHierarchy {
  root: THREE.Group;
  propellers: THREE.Object3D[];
  blurDiscs: THREE.Mesh[];
  slingAnchor: THREE.Object3D;
  /**
   * Axis the rotors spin around. Multirotor discs lie in the XZ plane so they
   * turn around Y; nose-mounted plane propellers stand up in XY and turn around Z.
   */
  propSpinAxis: 'y' | 'z';
  controlSurfaces?: {
    rudder?: THREE.Mesh;
    leftAileron?: THREE.Mesh;
    rightAileron?: THREE.Mesh;
    elevator?: THREE.Mesh;
  };
}

// High-Fidelity PBR Materials
const matCarbonFiber = new THREE.MeshStandardMaterial({
  color: 0x1e293b,
  roughness: 0.3,
  metalness: 0.6,
});
const matCNCAlum = new THREE.MeshStandardMaterial({
  color: 0xe2e8f0,
  roughness: 0.2,
  metalness: 0.9,
});
const matPostalBlue = new THREE.MeshStandardMaterial({
  color: 0x0284c7,
  roughness: 0.28,
  metalness: 0.25,
});
const matWoodDark = new THREE.MeshStandardMaterial({
  color: 0x451a03,
  roughness: 0.65,
  metalness: 0.05,
});
const matWoodVarnish = new THREE.MeshStandardMaterial({
  color: 0xb45309,
  roughness: 0.35,
  metalness: 0.1,
});
const matPostalYellow = new THREE.MeshStandardMaterial({
  color: 0xfacc15,
  roughness: 0.3,
  metalness: 0.2,
});
const matTitaniumDark = new THREE.MeshStandardMaterial({
  color: 0x0f172a,
  roughness: 0.35,
  metalness: 0.75,
});
const matMotorBell = new THREE.MeshStandardMaterial({
  color: 0x0284c7,
  roughness: 0.18,
  metalness: 0.92,
});
const matMotorCopper = new THREE.MeshStandardMaterial({
  color: 0xb45309,
  roughness: 0.25,
  metalness: 0.85,
});
const matPropellerBlade = new THREE.MeshStandardMaterial({
  color: 0x09090b,
  roughness: 0.15,
  metalness: 0.45,
});
const matPropellerBlur = new THREE.MeshBasicMaterial({
  color: 0xdbe4ee,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const matCanopyGlass = new THREE.MeshStandardMaterial({
  color: 0x38bdf8,
  roughness: 0.08,
  metalness: 0.95,
  transparent: true,
  opacity: 0.72,
});
const matChrome = new THREE.MeshStandardMaterial({
  color: 0xf8fafc,
  roughness: 0.1,
  metalness: 0.98,
});
const matLEDGreen = new THREE.MeshBasicMaterial({ color: 0x22c55e });
const matLEDRed = new THREE.MeshBasicMaterial({ color: 0xef4444 });
const matLEDCyan = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
const matRubberTire = new THREE.MeshStandardMaterial({
  color: 0x18181b,
  roughness: 0.92,
  metalness: 0.05,
});

export function createVehicleModel(vehicleId: VehicleId): VehicleModelHierarchy {
  switch (vehicleId) {
    case 'sparrow_tier1':
      return createSparrowModel();
    case 'swallow_tier2':
      return createSwallowModel();
    case 'titan_tier3':
      return createTitanModel();
    case 'zephyr_tier1':
      return createZephyrGliderModel();
    case 'aeolus_tier2':
      return createAeolusBiplaneModel();
    default:
      return createSparrowModel();
  }
}

/** 1. The Sparrow (Tier 1 Rookie Quadcopter) - High Poly with Propeller Duct Guards */
function createSparrowModel(): VehicleModelHierarchy {
  const root = new THREE.Group();
  const propellers: THREE.Object3D[] = [];
  const blurDiscs: THREE.Mesh[] = [];

  // 1. Central Aerodynamic Carbon Core Chassis (24 segments)
  const coreGeo = new THREE.CylinderGeometry(0.36, 0.4, 0.22, 24);
  const core = new THREE.Mesh(coreGeo, matCarbonFiber);
  core.position.y = 0.12;
  core.castShadow = true;
  root.add(core);

  // Top Yellow Molded Aerodynamic Canopy Shell
  const topCover = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    matPostalYellow
  );
  topCover.position.y = 0.23;
  topCover.scale.set(1.0, 0.7, 1.2);
  topCover.castShadow = true;
  root.add(topCover);

  // Status LEDs (Front Green / Rear Red)
  const ledG = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), matLEDGreen);
  ledG.position.set(0.2, 0.26, -0.2);
  const ledR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), matLEDRed);
  ledR.position.set(-0.2, 0.26, 0.2);
  root.add(ledG, ledR);

  // 2. Front 2-Axis FPV Optical Camera Gimbal
  const gimbalArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.14), matCNCAlum);
  gimbalArm.position.set(0, 0.1, -0.38);
  const camHousing = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), matTitaniumDark);
  camHousing.position.set(0, 0.1, -0.46);
  const camLens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 20), matCanopyGlass);
  camLens.rotation.x = Math.PI / 2;
  camLens.position.set(0, 0.1, -0.52);
  root.add(gimbalArm, camHousing, camLens);

  // 3. 4 Tubular Carbon Motor Arms (Twin Spar)
  const armDist = 0.62;
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];

  armAngles.forEach((angle) => {
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.8, 16), matCarbonFiber);
    arm1.rotation.z = Math.PI / 2;
    arm1.rotation.y = angle;
    arm1.position.set(Math.cos(angle) * 0.42, 0.14, Math.sin(angle) * 0.42);

    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.78, 12), matCNCAlum);
    arm2.rotation.z = Math.PI / 2;
    arm2.rotation.y = angle;
    arm2.position.set(Math.cos(angle) * 0.42, 0.09, Math.sin(angle) * 0.42);

    root.add(arm1, arm2);
  });

  // 4. Motors, Propellers & Circular Duct Guards
  const motorCoords: Array<[number, number]> = [
    [armDist, armDist],
    [-armDist, armDist],
    [-armDist, -armDist],
    [armDist, -armDist],
  ];

  motorCoords.forEach(([mx, mz]) => {
    // High-Poly Brushless Motor (Stator + Bell)
    const stator = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 24), matMotorCopper);
    stator.position.set(mx, 0.12, mz);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 24), matMotorBell);
    bell.position.set(mx, 0.19, mz);
    const lockNut = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.07, 16), matCNCAlum);
    lockNut.position.set(mx, 0.26, mz);
    root.add(stator, bell, lockNut);

    // Propeller Duct Safety Ring
    const guardRing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 12, 32), matCarbonFiber);
    guardRing.rotation.x = Math.PI / 2;
    guardRing.position.set(mx, 0.22, mz);
    root.add(guardRing);

    // Curved Twisted Airfoil Propeller
    const propGroup = new THREE.Group();
    propGroup.position.set(mx, 0.24, mz);

    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.08), matPropellerBlade);
    b1.rotation.z = 0.09;
    const bHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), matCNCAlum);
    propGroup.add(b1, bHub);

    root.add(propGroup);
    propellers.push(propGroup);

    // Blur Disc for High Throttle
    const blur = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), matPropellerBlur);
    blur.rotation.x = -Math.PI / 2;
    blur.position.set(mx, 0.25, mz);
    blur.visible = false;
    root.add(blur);
    blurDiscs.push(blur);
  });

  // 5. Curved Composite Landing Skids with Rubber Pads
  for (const sx of [-0.3, 0.3]) {
    const skidStrut1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.38, 12), matCarbonFiber);
    skidStrut1.position.set(sx, -0.04, 0.24);
    skidStrut1.rotation.x = -0.32;

    const skidStrut2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.38, 12), matCarbonFiber);
    skidStrut2.position.set(sx, -0.04, -0.24);
    skidStrut2.rotation.x = 0.32;

    const skidBar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.85), matTitaniumDark);
    skidBar.position.set(sx, -0.22, 0);

    const footF = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.1), matRubberTire);
    footF.position.set(sx, -0.24, 0.35);
    const footB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.1), matRubberTire);
    footB.position.set(sx, -0.24, -0.35);

    root.add(skidStrut1, skidStrut2, skidBar, footF, footB);
  }

  // Under-Chassis Neon Glow Bar
  const neon = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.3), matLEDCyan);
  neon.position.set(0, -0.02, 0);
  root.add(neon);

  // Magnetic Winch Spool & Anchor
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 20), matCNCAlum);
  spool.position.set(0, -0.12, 0);
  root.add(spool);

  const slingAnchor = new THREE.Object3D();
  slingAnchor.position.set(0, -0.24, 0);
  root.add(slingAnchor);

  return { root, propellers, blurDiscs, slingAnchor, propSpinAxis: 'y' };
}

/** 2. Alpine Swallow (Tier 2 Fast Delivery Quad) - High Poly */
function createSwallowModel(): VehicleModelHierarchy {
  const root = new THREE.Group();
  const propellers: THREE.Object3D[] = [];
  const blurDiscs: THREE.Mesh[] = [];

  // Streamlined Racing Monocoque Shell (32 segments)
  const bodyGeo = new THREE.CylinderGeometry(0.26, 0.42, 1.25, 32);
  bodyGeo.rotateX(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, matPostalBlue);
  body.position.y = 0.16;
  body.scale.set(1.0, 0.85, 1.0);
  body.castShadow = true;
  root.add(body);

  // Aerodynamic Racing Spoiler & Stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 1.26), matPostalYellow);
  stripe.position.set(0, 0.28, 0);
  root.add(stripe);

  // Glazed Teardrop Canopy
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    matCanopyGlass
  );
  canopy.position.set(0, 0.28, -0.2);
  canopy.scale.set(0.9, 0.85, 1.8);
  root.add(canopy);

  // Swept Wing Arms with Airfoil Profile
  const armDist = 0.76;
  const armCoords: Array<[number, number]> = [
    [armDist, armDist * 0.82],
    [-armDist, armDist * 0.82],
    [-armDist * 1.15, -armDist * 0.82],
    [armDist * 1.15, -armDist * 0.82],
  ];

  armCoords.forEach(([mx, mz], i) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.72), matCarbonFiber);
    arm.position.set(mx * 0.55, 0.16, mz * 0.55);
    arm.rotation.y = Math.atan2(-mx, -mz) + Math.PI / 2;
    root.add(arm);

    // Motor Pod
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 24), matTitaniumDark);
    motor.position.set(mx, 0.19, mz);
    root.add(motor);

    // Tri-Blade Racing Propeller (3 blades at 120 deg)
    const propGroup = new THREE.Group();
    propGroup.position.set(mx, 0.28, mz);

    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.07), matPropellerBlade);
      blade.rotation.y = (b * Math.PI * 2) / 3;
      blade.rotation.z = 0.1;
      blade.position.x = Math.cos((b * Math.PI * 2) / 3) * 0.2;
      blade.position.z = Math.sin((b * Math.PI * 2) / 3) * 0.2;
      propGroup.add(blade);
    }
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.09, 20), matPostalYellow);
    spinner.position.y = 0.04;
    propGroup.add(spinner);

    root.add(propGroup);
    propellers.push(propGroup);

    const blur = new THREE.Mesh(new THREE.CircleGeometry(0.48, 24), matPropellerBlur);
    blur.rotation.x = -Math.PI / 2;
    blur.position.set(mx, 0.3, mz);
    blur.visible = false;
    root.add(blur);
    blurDiscs.push(blur);

    // Wingtip LED Strobe
    const navLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 12),
      i === 0 || i === 3 ? matLEDGreen : matLEDRed
    );
    navLed.position.set(mx * 1.1, 0.19, mz);
    root.add(navLed);
  });

  const slingAnchor = new THREE.Object3D();
  slingAnchor.position.set(0, -0.26, 0);
  root.add(slingAnchor);

  return { root, propellers, blurDiscs, slingAnchor, propSpinAxis: 'y' };
}

/** 3. Matterhorn Titan (Tier 3 Heavy Hexacopter) - High Poly */
function createTitanModel(): VehicleModelHierarchy {
  const root = new THREE.Group();
  const propellers: THREE.Object3D[] = [];
  const blurDiscs: THREE.Mesh[] = [];

  // Heavy Industrial Hexagonal Hub Core
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.76, 0.32, 6), matTitaniumDark);
  hub.position.y = 0.2;
  hub.castShadow = true;
  root.add(hub);

  // Dual Heavy LiPo Battery Blocks with LED Status
  for (const bx of [-0.22, 0.22]) {
    const bat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.65), matPostalYellow);
    bat.position.set(bx, 0.42, 0);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), matLEDGreen);
    led.position.set(bx * 1.5, 0.42, 0);
    root.add(bat, led);
  }

  // 6 Radial Heavy Truss Arms
  const armRadius = 1.12;
  for (let a = 0; a < 6; a++) {
    const angle = (a * Math.PI) / 3;
    const mx = Math.cos(angle) * armRadius;
    const mz = Math.sin(angle) * armRadius;

    const armUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, armRadius, 16), matCarbonFiber);
    armUpper.rotation.z = Math.PI / 2;
    armUpper.rotation.y = angle;
    armUpper.position.set(mx * 0.5, 0.22, mz * 0.5);

    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 24), matCNCAlum);
    motor.position.set(mx, 0.26, mz);

    const propGroup = new THREE.Group();
    propGroup.position.set(mx, 0.37, mz);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.035, 0.1), matPropellerBlade);
    prop.rotation.z = 0.08;
    propGroup.add(prop);

    const blur = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), matPropellerBlur);
    blur.rotation.x = -Math.PI / 2;
    blur.position.set(mx, 0.38, mz);
    blur.visible = false;

    root.add(armUpper, motor, propGroup, blur);
    propellers.push(propGroup);
    blurDiscs.push(blur);
  }

  // Heavy Duty Shock Landing Gear
  for (let s = 0; s < 4; s++) {
    const angle = (s * Math.PI) / 2 + Math.PI / 4;
    const lx = Math.cos(angle) * 0.6;
    const lz = Math.sin(angle) * 0.6;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.55, 16), matTitaniumDark);
    strut.position.set(lx, -0.06, lz);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 16), matRubberTire);
    foot.position.set(lx * 1.25, -0.34, lz * 1.25);
    root.add(strut, foot);
  }

  const slingAnchor = new THREE.Object3D();
  slingAnchor.position.set(0, -0.36, 0);
  root.add(slingAnchor);

  return { root, propellers, blurDiscs, slingAnchor, propSpinAxis: 'y' };
}

/** 4. Zephyr Glider (RC Plane / Sailplane) - High Poly */
function createZephyrGliderModel(): VehicleModelHierarchy {
  const root = new THREE.Group();
  const propellers: THREE.Object3D[] = [];
  const blurDiscs: THREE.Mesh[] = [];

  // Streamlined Sailplane Fuselage (32 segments)
  const fuseGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.8, 32);
  fuseGeo.rotateX(Math.PI / 2);
  const fuse = new THREE.Mesh(fuseGeo, matPostalYellow);
  fuse.position.y = 0.22;
  fuse.scale.set(0.9, 1.15, 1.0);
  fuse.castShadow = true;
  root.add(fuse);

  // Tinted Glass Aerodynamic Cockpit Canopy
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    matCanopyGlass
  );
  canopy.position.set(0, 0.38, -0.45);
  canopy.scale.set(0.85, 0.95, 2.0);
  root.add(canopy);

  // High-Aspect Ratio NACA Cambered Wings (3.8m Wingspan)
  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.045, 0.48), matPostalYellow);
  leftWing.position.set(-0.95, 0.28, -0.22);
  leftWing.rotation.z = -0.05; // Dihedral angle

  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.045, 0.48), matPostalYellow);
  rightWing.position.set(0.95, 0.28, -0.22);
  rightWing.rotation.z = 0.05;

  root.add(leftWing, rightWing);

  // Aerodynamic Wingtip Winglets
  const wlL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.32), matPostalBlue);
  wlL.position.set(-1.85, 0.42, -0.22);
  const wlR = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.32), matPostalBlue);
  wlR.position.set(1.85, 0.42, -0.22);
  root.add(wlL, wlR);

  // T-Tail Empennage
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.7, 0.45), matPostalBlue);
  fin.position.set(0, 0.62, 1.2);
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.035, 0.32), matPostalBlue);
  hStab.position.set(0, 0.95, 1.25);
  root.add(fin, hStab);

  // Folding Carbon Propeller Spinner on Nose
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 24), matCNCAlum);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.set(0, 0.22, -1.52);
  root.add(spinner);

  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.025, 0.085), matPropellerBlade);
  prop.position.set(0, 0.22, -1.48);
  root.add(prop);
  propellers.push(prop);

  const blur = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24), matPropellerBlur);
  blur.position.set(0, 0.22, -1.5);
  blur.visible = false;
  root.add(blur);
  blurDiscs.push(blur);

  // Centerline Landing Wheel
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 16, 24), matRubberTire);
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(0, -0.06, -0.2);
  root.add(wheel);

  const slingAnchor = new THREE.Object3D();
  slingAnchor.position.set(0, -0.08, 0.1);
  root.add(slingAnchor);

  return { root, propellers, blurDiscs, slingAnchor, propSpinAxis: 'z' };
}

/** 5. Aeolus Express (Twin-Engine Biplane) - High Poly */
function createAeolusBiplaneModel(): VehicleModelHierarchy {
  const root = new THREE.Group();
  const propellers: THREE.Object3D[] = [];
  const blurDiscs: THREE.Mesh[] = [];

  // Streamlined Vintage Mail Fuselage (32 segments)
  const fuseGeo = new THREE.CylinderGeometry(0.32, 0.48, 3.2, 32);
  fuseGeo.rotateX(Math.PI / 2);
  const fuse = new THREE.Mesh(fuseGeo, matPostalBlue);
  fuse.position.y = 0.38;
  fuse.castShadow = true;
  root.add(fuse);

  // Dual Staggered Airfoil Biplane Wings
  const topWing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.07, 0.58), matPostalYellow);
  topWing.position.set(0, 0.92, -0.22);
  topWing.castShadow = true;

  const botWing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.07, 0.58), matPostalYellow);
  botWing.position.set(0, 0.22, -0.18);
  botWing.castShadow = true;

  root.add(topWing, botWing);

  // Wooden Interplane Struts
  for (const sx of [-1.3, 1.3]) {
    const strut1 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.72, 0.045), matWoodDark);
    strut1.position.set(sx, 0.57, -0.02);
    const strut2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.72, 0.045), matWoodDark);
    strut2.position.set(sx, 0.57, -0.42);
    root.add(strut1, strut2);
  }

  // Twin Radial Engines with Chrome Cowlings & Wood Propellers
  for (const nx of [-0.9, 0.9]) {
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.55, 24), matChrome);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(nx, 0.22, -0.55);
    root.add(cowl);

    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.09), matWoodVarnish);
    prop.position.set(nx, 0.22, -0.85);
    root.add(prop);
    propellers.push(prop);

    const blur = new THREE.Mesh(new THREE.CircleGeometry(0.48, 24), matPropellerBlur);
    blur.position.set(nx, 0.22, -0.87);
    blur.visible = false;
    root.add(blur);
    blurDiscs.push(blur);
  }

  // Open Cockpit with Curved Windscreen
  const windscreen = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16, 1, true, 0, Math.PI), matCanopyGlass);
  windscreen.position.set(0, 0.62, -0.45);
  root.add(windscreen);

  // Vintage Spoked Undercarriage Wheels with Rubber Tires
  for (const wx of [-0.55, 0.55]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 16), matCNCAlum);
    leg.position.set(wx, 0.06, -0.45);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.075, 16, 24), matRubberTire);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(wx, -0.24, -0.45);
    root.add(leg, wheel);
  }

  const slingAnchor = new THREE.Object3D();
  slingAnchor.position.set(0, 0.06, 0.2);
  root.add(slingAnchor);

  return { root, propellers, blurDiscs, slingAnchor, propSpinAxis: 'z' };
}
