/**
 * High-Detail Alpine Mountain Archipelago: 3 Bustling Towns, Perched Peak-Top Landmarks & High-Density Spruce Forests
 * Towns:
 * 1. Alpenburg (Central Market Town & Aviation Hub)
 * 2. Seeberg (Lakeside Port & Fishing Village)
 * 3. Bergdorf (Eastern High Mountain Ski Hamlet)
 * Peaks:
 * - Monk's Peak Clifftop Lookout (Summit Helipad at [65, 71.0, -190.5] with 100% unobstructed clearance)
 * - Windmill Ridge Observatory Crest ([180, 42.5, 90])
 * - Dairy Pasture Barn & Silo ([-95, 26.5, 160])
 * - Canyon Gorge Covered Bridge ([-150, 21.8, -126])
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { AlpineTerrain } from './terrain.js';

export interface LandmarkLocations {
  hangarHelipad: [number, number, number];
  airstripRunway: [number, number, number];
  townSquare: [number, number, number];
  bakeryBalcony: [number, number, number];
  monasteryTerrace: [number, number, number];
  windmillRidge: [number, number, number];
  dairyMeadow: [number, number, number];
  gorgeBridge: [number, number, number];
  seebergLakeside: [number, number, number];
  bergdorfHamlet: [number, number, number];
}

// Rich Architectural PBR Materials
const matWoodDark = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.75 });
const matWoodWarm = new THREE.MeshStandardMaterial({ color: 0x8d4925, roughness: 0.65 });
const matPlasterWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85 });
const matGraniteStone = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 });
const matDarkSlate = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 });
const matRoofTerracotta = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 });
const matRoofMansard = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.5 });
const matSteelFrame = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.85 });
const matPadDeck = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.3 });
const matWindowGlass = new THREE.MeshStandardMaterial({
  color: 0xfef08a,
  roughness: 0.2,
  metalness: 0.2,
  emissive: 0xca8a04,
  emissiveIntensity: 0.6,
});
const matFlowerBloom = new THREE.MeshBasicMaterial({ color: 0xef4444 });
const matBronzeBell = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.85 });
const matLedAmber = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
const matLedCyan = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
const matLedRed = new THREE.MeshBasicMaterial({ color: 0xef4444 });
const matWindsockRed = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
const matWindsockWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });

export class AlpineLandmarks {
  readonly locations: LandmarkLocations = {
    hangarHelipad: [0, 4.2, 8],
    airstripRunway: [-22, 3.4, 20],
    townSquare: [16, 4.2, -4],
    bakeryBalcony: [35, 11.2, 28],
    monasteryTerrace: [65, 71.0, -190.5], // Completely open cantilever clifftop terrace!
    windmillRidge: [158, 42.8, 88],       // Unobstructed side terrace overlooking the valley
    dairyMeadow: [-95, 26.5, 160],
    gorgeBridge: [-150, 21.8, -126],
    seebergLakeside: [120, 4.8, -75],    // Town #2: Lakeside Port Village
    bergdorfHamlet: [160, 24.8, 45],     // Town #3: High Mountain Ski Hamlet
  };

  private windmillBlades: THREE.Mesh[] = [];
  private windsocks: THREE.Group[] = [];
  private beaconLeds: THREE.Mesh[] = [];
  private cows: Array<{ group: THREE.Group; head: THREE.Group; baseAngle: number }> = [];

  build(scene: THREE.Scene, world: RAPIER.World): void {
    // 1. Post Office Aviation Depot & Hangar Bay
    this.buildAgencyHQ(scene, world);

    // 2. High-Precision Airstrip Runway for RC Planes
    this.buildAirstrip(scene, world);

    // 3. Town #1: Alpenburg (Central Market Town)
    this.buildChurchClocktower(scene, world);
    this.buildBustlingTownVillage(scene, world);
    this.buildBakery(scene, world);

    // 4. Town #2: Seeberg (Lakeside Port Village)
    this.buildSeebergLakeside(scene, world);

    // 5. Town #3: Bergdorf (Eastern High Mountain Ski Hamlet)
    this.buildBergdorfHamlet(scene, world);

    // 6. Peak-Top Monastery Sanctuary (Perched on highest summit)
    this.buildMonastery(scene, world);

    // 7. Razor-Ridge Windmills (Perched on ridge crest)
    this.buildWindmills(scene, world);

    // 8. Dairy Meadow Farm Barn & Silo
    this.buildDairyMeadow(scene, world);

    // 9. River Canyon Covered Bridge
    this.buildWoodenBridge(scene, world);

    // 10. Multi-Tier High-Density Alpine Spruce Forests (850+ Trees!)
    this.buildInstancedPineForest(scene, world);
  }

  update(dt: number): void {
    for (const blade of this.windmillBlades) {
      blade.rotation.z += 1.6 * dt;
    }

    const time = performance.now() * 0.002;

    for (let i = 0; i < this.windsocks.length; i++) {
      const sock = this.windsocks[i];
      sock.rotation.y = Math.sin(time * 0.7 + i) * 0.35 - 0.4;
      sock.rotation.z = Math.sin(time * 2.5 + i * 2.0) * 0.1 - 0.15;
    }

    const pulse = (Math.sin(time * 8.0) + 1.0) * 0.5;
    matLedAmber.color.setRGB(0.98 * pulse + 0.1, 0.75 * pulse + 0.1, 0.14 * pulse);
    matLedCyan.color.setRGB(0.22 * pulse + 0.1, 0.74 * pulse + 0.1, 0.97 * pulse + 0.2);
    matLedRed.color.setRGB(0.95 * pulse + 0.1, 0.1, 0.1);

    for (let i = 0; i < this.cows.length; i++) {
      const cow = this.cows[i];
      cow.head.rotation.x = Math.sin(time + i * 1.6) * 0.15;
      cow.head.rotation.z = Math.cos(time * 0.7 + i) * 0.1;
    }
  }

  createRooftopLandingPad(
    scene: THREE.Scene,
    world: RAPIER.World,
    x: number,
    y: number,
    z: number,
    size: number = 7.0,
    symbol: 'H' | '📦' | '🎯' = 'H'
  ): void {
    const padGroup = new THREE.Group();
    padGroup.position.set(x, y, z);

    // 1. Octagonal Landing Deck
    const deckGeo = new THREE.CylinderGeometry(size * 0.58, size * 0.62, 0.25, 16);
    const deck = new THREE.Mesh(deckGeo, matPadDeck);
    deck.castShadow = true;
    deck.receiveShadow = true;
    padGroup.add(deck);

    // 2. Steel Perimeter Safety Netting
    const netGeo = new THREE.RingGeometry(size * 0.58, size * 0.72, 16);
    const netMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      wireframe: true,
      roughness: 0.5,
      metalness: 0.8,
    });
    const net = new THREE.Mesh(netGeo, netMat);
    net.rotation.x = -Math.PI / 2;
    net.position.y = -0.04;
    padGroup.add(net);

    // 3. Yellow/Black Hazard Border Ring
    const borderRing = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.48, size * 0.56, 32),
      new THREE.MeshBasicMaterial({ color: 0xeab308, side: THREE.DoubleSide })
    );
    borderRing.rotation.x = -Math.PI / 2;
    borderRing.position.y = 0.13;
    padGroup.add(borderRing);

    // Concentric Inner Target Circle
    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.24, size * 0.28, 32),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide })
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.135;
    padGroup.add(innerRing);

    // Center Landing Symbol ('H' or '🎯' or '📦')
    if (symbol === 'H') {
      const hMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
      const hLeft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, size * 0.32), hMat);
      hLeft.position.set(-size * 0.1, 0.14, 0);
      const hRight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, size * 0.32), hMat);
      hRight.position.set(size * 0.1, 0.14, 0);
      const hCross = new THREE.Mesh(new THREE.BoxGeometry(size * 0.2, 0.02, 0.28), hMat);
      hCross.position.set(0, 0.14, 0);
      padGroup.add(hLeft, hRight, hCross);
    }

    // 4. Perimeter LED Strobes
    const beaconOffsets = [
      [-size * 0.48, -size * 0.48],
      [size * 0.48, -size * 0.48],
      [size * 0.48, size * 0.48],
      [-size * 0.48, size * 0.48],
    ];

    beaconOffsets.forEach(([bx, bz], i) => {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.45, 8), matSteelFrame);
      pylon.position.set(bx, 0.22, bz);

      const lampGeo = new THREE.SphereGeometry(0.12, 12, 12);
      const lampMat = i % 2 === 0 ? matLedAmber : matLedCyan;
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(bx, 0.48, bz);

      padGroup.add(pylon, lamp);
      this.beaconLeds.push(lamp);
    });

    // 5. Wind Sock Station
    const sockGroup = new THREE.Group();
    sockGroup.position.set(-size * 0.55, 0.15, -size * 0.45);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 12), matSteelFrame);
    mast.position.y = 0.9;
    sockGroup.add(mast);

    const coneGroup = new THREE.Group();
    coneGroup.position.y = 1.7;

    const segCount = 4;
    for (let s = 0; s < segCount; s++) {
      const r1 = 0.18 - s * 0.03;
      const r2 = 0.15 - s * 0.03;
      const segGeo = new THREE.CylinderGeometry(r2, r1, 0.25, 12, 1, true);
      segGeo.rotateZ(Math.PI / 2);
      const segMat = s % 2 === 0 ? matWindsockRed : matWindsockWhite;
      const segMesh = new THREE.Mesh(segGeo, segMat);
      segMesh.position.x = s * 0.24 + 0.12;
      coneGroup.add(segMesh);
    }

    sockGroup.add(coneGroup);
    padGroup.add(sockGroup);
    this.windsocks.push(coneGroup);

    scene.add(padGroup);
    this.addStaticBox(world, x, y - 0.05, z, size * 0.55, 0.15, size * 0.55);
  }

  private buildAgencyHQ(scene: THREE.Scene, world: RAPIER.World): void {
    const groundY = AlpineTerrain.getElevation(0, -14);
    const group = new THREE.Group();
    group.position.set(0, groundY, -14);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(16.5, 2.5, 14.5), matGraniteStone);
    plinth.position.y = -1.25;
    group.add(plinth);

    const base = new THREE.Mesh(new THREE.BoxGeometry(16, 7.5, 14), matPlasterWhite);
    base.position.y = 3.75;
    base.castShadow = true;
    group.add(base);

    const roofGeo = new THREE.CylinderGeometry(8.5, 8.5, 16.5, 24, 1, false, 0, Math.PI);
    roofGeo.rotateZ(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeo, matRoofMansard);
    roof.position.set(0, 7.5, 0);
    roof.castShadow = true;
    group.add(roof);

    const hangarDoor = new THREE.Mesh(new THREE.BoxGeometry(10, 5.5, 0.3), matWindowGlass);
    hangarDoor.position.set(0, 2.75, 7.1);
    group.add(hangarDoor);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 18, 12), matSteelFrame);
    mast.position.set(-7.5, 13.5, -6.0);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), matLedRed);
    beacon.position.set(-7.5, 22.8, -6.0);
    group.add(mast, beacon);
    this.beaconLeds.push(beacon);

    scene.add(group);
    this.addStaticBox(world, 0, groundY + 4, -14, 8, 5, 7);

    this.createRooftopLandingPad(
      scene,
      world,
      this.locations.hangarHelipad[0],
      this.locations.hangarHelipad[1],
      this.locations.hangarHelipad[2],
      7.0,
      'H'
    );
  }

  private buildAirstrip(scene: THREE.Scene, world: RAPIER.World): void {
    const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
    const matWhitePaint = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    const groundY = AlpineTerrain.getElevation(-22, 60);
    const runway = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 140), matAsphalt);
    runway.position.set(-22, groundY + 0.1, 60);
    runway.receiveShadow = true;
    scene.add(runway);
    this.addStaticBox(world, -22, groundY, 60, 8, 0.15, 70);

    for (let z = 0; z < 120; z += 12) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 6.0), matWhitePaint);
      stripe.position.set(-22, groundY + 0.22, z);
      scene.add(stripe);
    }
  }

  private buildChurchClocktower(scene: THREE.Scene, world: RAPIER.World): void {
    const groundY = AlpineTerrain.getElevation(16, -18);
    const churchGroup = new THREE.Group();
    churchGroup.position.set(16, groundY, -18);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(18, 2.5, 22), matGraniteStone);
    plinth.position.set(3, -1.25, 0);
    churchGroup.add(plinth);

    const nave = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 20), matGraniteStone);
    nave.position.set(6, 4.5, 0);
    nave.castShadow = true;
    churchGroup.add(nave);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(12, 5.5, 4), matDarkSlate);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(6, 11.5, 0);
    roof.castShadow = true;
    churchGroup.add(roof);

    const tower = new THREE.Mesh(new THREE.BoxGeometry(6.8, 22, 6.8), matGraniteStone);
    tower.position.set(0, 11, 0);
    tower.castShadow = true;
    churchGroup.add(tower);

    const belfry = new THREE.Mesh(new THREE.BoxGeometry(5.8, 5, 5.8), matWoodDark);
    belfry.position.set(0, 23.5, 0);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 1.4, 20), matBronzeBell);
    bell.position.set(0, 23.5, 0);
    churchGroup.add(belfry, bell);

    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const clockFace = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), matWindowGlass);
      clockFace.rotation.y = angle;
      clockFace.position.set(0, 18, 0);
      clockFace.translateZ(3.5);
      churchGroup.add(clockFace);
    }

    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.4, 16, 16), matRoofMansard);
    spire.position.set(0, 33, 0);
    churchGroup.add(spire);

    scene.add(churchGroup);
    this.addStaticBox(world, 19, groundY + 5, -18, 8, 6, 10);
    this.addStaticBox(world, 16, groundY + 11, -18, 3.4, 12, 3.4);

    const plazaY = AlpineTerrain.getElevation(16, -4) + 0.8;
    this.createRooftopLandingPad(scene, world, 16, plazaY, -4, 6.8, '🎯');
  }

  private buildBustlingTownVillage(scene: THREE.Scene, world: RAPIER.World): void {
    const villageChalets: Array<[number, number, number, number, number, number, boolean]> = [
      [32, -38, 9.5, 7.0, 8.5, 0.2, false],
      [-30, -26, 12.0, 8.5, 12.0, 0, true], // Hotel Alpenrose
      [44, -12, 10.5, 7.2, 9.0, 0.6, false],
      [-16, -42, 9.0, 6.5, 8.5, 0.1, false],
      [8, -40, 9.5, 7.0, 9.0, -0.3, false],
      [-48, -8, 9.0, 6.5, 8.5, 0.5, false],
      [-38, 22, 10.0, 7.0, 9.0, 0.4, false],
      [28, 48, 9.5, 6.8, 8.5, -0.2, false],
      [-14, 45, 9.0, 6.5, 8.0, 0.1, false],
      [42, -48, 10.0, 7.5, 9.0, 0.35, false],
      [-52, -30, 9.5, 7.0, 8.5, -0.4, false],
      [-45, -45, 9.0, 6.5, 8.0, 0.2, false],
      [48, -25, 10.5, 7.2, 9.5, -0.5, false],
      [20, 42, 9.5, 6.8, 8.5, 0.3, false],
    ];

    for (const [x, z, w, h, d, rot, flat] of villageChalets) {
      const y = AlpineTerrain.getElevation(x, z);
      this.createDetailedChalet(scene, world, x, y, z, w, h, d, rot, flat);
    }

    const hotelGroundY = AlpineTerrain.getElevation(-30, -26);
    this.createRooftopLandingPad(scene, world, -30, hotelGroundY + 8.6, -26, 6.6, '🎯');

    // Fountain
    const fountainY = AlpineTerrain.getElevation(16, -4);
    const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 0.9, 16), matGraniteStone);
    fountainBase.position.set(16, fountainY + 0.45, -4);
    const fountainWater = new THREE.Mesh(
      new THREE.CylinderGeometry(3.1, 3.1, 0.8, 16),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.8 })
    );
    fountainWater.position.set(16, fountainY + 0.5, -4);
    const fountainSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.8, 12), matBronzeBell);
    fountainSpire.position.set(16, fountainY + 1.8, -4);
    scene.add(fountainBase, fountainWater, fountainSpire);

    const lampSpots: Array<[number, number]> = [
      [14, -10],
      [14, 12],
      [14, 34],
      [-5, -16],
      [-25, -16],
      [30, 20],
      [-15, 35],
    ];

    for (const [lx, lz] of lampSpots) {
      const ly = AlpineTerrain.getElevation(lx, lz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 8), matSteelFrame);
      pole.position.set(lx, ly + 1.8, lz);
      const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), matWindowGlass);
      lampHead.position.set(lx, ly + 3.6, lz);
      scene.add(pole, lampHead);
    }
  }

  /** Town #2: Seeberg Lakeside Port Village */
  private buildSeebergLakeside(scene: THREE.Scene, world: RAPIER.World): void {
    const lakesideChalets: Array<[number, number, number, number, number, number, boolean]> = [
      [105, -68, 9.5, 7.0, 8.5, 0.4, false],
      [135, -72, 10.0, 7.2, 9.0, -0.2, false],
      [122, -92, 9.0, 6.5, 8.0, 0.1, false],
      [95, -85, 9.5, 6.8, 8.5, 0.6, false],
      [145, -88, 9.0, 6.5, 8.5, -0.5, false],
    ];

    for (const [x, z, w, h, d, rot, flat] of lakesideChalets) {
      const y = AlpineTerrain.getElevation(x, z);
      this.createDetailedChalet(scene, world, x, y, z, w, h, d, rot, flat);
    }

    // Wooden Boat Dock extending onto water
    const dockGroundY = AlpineTerrain.getElevation(120, -75);
    const dock = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 24), matWoodDark);
    dock.position.set(120, dockGroundY + 0.3, -75);
    scene.add(dock);
    this.addStaticBox(world, 120, dockGroundY + 0.3, -75, 8, 0.3, 12);

    // Stone Lighthouse / Beacon Tower
    const lhGroundY = AlpineTerrain.getElevation(138, -62);
    const lhTower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 14, 16), matPlasterWhite);
    lhTower.position.set(138, lhGroundY + 7.0, -62);
    const lhCap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 16), matRoofMansard);
    lhCap.position.set(138, lhGroundY + 15.6, -62);
    const lhLamp = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 12), matLedAmber);
    lhLamp.position.set(138, lhGroundY + 14.2, -62);
    scene.add(lhTower, lhCap, lhLamp);
    this.beaconLeds.push(lhLamp);
    this.addStaticBox(world, 138, lhGroundY + 7.0, -62, 2.5, 7.5, 2.5);

    // Lakeside Landing Pad
    this.createRooftopLandingPad(scene, world, 120, dockGroundY + 0.6, -75, 7.2, '📦');
  }

  /** Town #3: Bergdorf High Mountain Ski Hamlet */
  private buildBergdorfHamlet(scene: THREE.Scene, world: RAPIER.World): void {
    const hamletChalets: Array<[number, number, number, number, number, number, boolean]> = [
      [150, 35, 10.0, 7.5, 9.0, 0.3, false],
      [172, 38, 9.5, 7.0, 8.5, -0.4, false],
      [162, 58, 11.0, 8.0, 10.0, 0.1, true], // Mountain Lodge with Flat Rooftop
      [145, 52, 9.0, 6.5, 8.0, 0.5, false],
      [178, 55, 9.0, 6.5, 8.5, -0.2, false],
    ];

    for (const [x, z, w, h, d, rot, flat] of hamletChalets) {
      const y = AlpineTerrain.getElevation(x, z);
      this.createDetailedChalet(scene, world, x, y, z, w, h, d, rot, flat);
    }

    // Rustic Mountain Chapel
    const chGroundY = AlpineTerrain.getElevation(185, 42);
    const chNave = new THREE.Mesh(new THREE.BoxGeometry(8.5, 6.5, 12), matGraniteStone);
    chNave.position.set(185, chGroundY + 3.25, 42);
    const chRoof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 4.2, 4), matDarkSlate);
    chRoof.rotation.y = Math.PI / 4;
    chRoof.position.set(185, chGroundY + 8.5, 42);
    scene.add(chNave, chRoof);
    this.addStaticBox(world, 185, chGroundY + 3.5, 42, 4.5, 4.5, 6.5);

    // Bergdorf Overlook Landing Deck
    const lodgeGroundY = AlpineTerrain.getElevation(162, 58);
    this.createRooftopLandingPad(scene, world, 162, lodgeGroundY + 8.2, 58, 6.8, '🎯');
  }

  private buildBakery(scene: THREE.Scene, world: RAPIER.World): void {
    const groundY = AlpineTerrain.getElevation(35, 28);
    const group = new THREE.Group();
    group.position.set(35, groundY, 28);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(12.5, 2.5, 12.5), matGraniteStone);
    plinth.position.y = -1.25;
    group.add(plinth);

    const groundFloor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.0, 11.5), matPlasterWhite);
    groundFloor.position.y = 2.0;
    groundFloor.castShadow = true;
    group.add(groundFloor);

    const secondFloor = new THREE.Mesh(new THREE.BoxGeometry(12.0, 3.8, 12.0), matWoodWarm);
    secondFloor.position.y = 5.9;
    secondFloor.castShadow = true;
    group.add(secondFloor);

    const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.4, 12.4), matWoodDark);
    roofDeck.position.y = 7.9;
    roofDeck.receiveShadow = true;
    group.add(roofDeck);

    const railMat = matWoodDark;
    const rN = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.9, 0.2), railMat);
    rN.position.set(0, 8.45, 6.1);
    const rS = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.9, 0.2), railMat);
    rS.position.set(0, 8.45, -6.1);
    const rE = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 12.4), railMat);
    rE.position.set(6.1, 8.45, 0);
    const rW = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 12.4), railMat);
    rW.position.set(-6.1, 8.45, 0);
    group.add(rN, rS, rE, rW);

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9.5, 1.4), matGraniteStone);
    chimney.position.set(-5.5, 4.75, -4.5);
    group.add(chimney);

    const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 12), matSteelFrame);
    signPole.rotation.z = Math.PI / 2;
    signPole.position.set(6.0, 3.8, 2.0);
    const signBoard = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 12, 24), matBronzeBell);
    signBoard.position.set(7.0, 3.2, 2.0);
    group.add(signPole, signBoard);

    scene.add(group);
    this.addStaticBox(world, 35, groundY + 4.0, 28, 6.0, 5.0, 6.0);

    this.createRooftopLandingPad(scene, world, 35, groundY + 8.1, 28, 6.4, '📦');
  }

  /**
   * Monk's Peak Monastery Sanctuary (Summit Perched Peak [65, 62m, -205])
   * Landing pad is placed on the wide open-air cantilever lookout terrace at [65, 71.0m, -190.5m]
   * with 100% unobstructed vertical airspace!
   */
  private buildMonastery(scene: THREE.Scene, world: RAPIER.World): void {
    const pos = [65, 62.0, -205] as const;
    const monasteryGroup = new THREE.Group();
    monasteryGroup.position.set(pos[0], pos[1], pos[2]);

    // Deep Plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(24, 6.0, 22), matGraniteStone);
    plinth.position.y = -3.0;
    monasteryGroup.add(plinth);

    // Abbey Fortress (centered at z: -205)
    const abbey = new THREE.Mesh(new THREE.BoxGeometry(22, 18, 20), matGraniteStone);
    abbey.position.set(0, 9.0, 0);
    abbey.castShadow = true;
    monasteryGroup.add(abbey);

    // Main Gothic Cathedral Spire (centered at z: -205, NOT on the terrace!)
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5.5, 18, 8), matDarkSlate);
    spire.position.set(0, 27.0, 0);
    spire.castShadow = true;
    monasteryGroup.add(spire);

    // Golden Cross
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), matBronzeBell);
    crossV.position.set(0, 36.5, 0);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.25), matBronzeBell);
    crossH.position.set(0, 36.8, 0);
    monasteryGroup.add(crossV, crossH);

    // Four Corner Turrets
    for (const [tx, tz] of [
      [-10.5, -9.5],
      [10.5, -9.5],
      [-10.5, 9.5],
      [10.5, 9.5],
    ]) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 16, 12), matGraniteStone);
      turret.position.set(tx, 8.0, tz);
      const tCone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.5, 12), matDarkSlate);
      tCone.position.set(tx, 18.5, tz);
      monasteryGroup.add(turret, tCone);
    }

    // Wide Cantilevered Panoramic Clifftop Lookout Terrace (extending forward to z: -190.5!)
    const terraceDeck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8, 14), matWoodDark);
    terraceDeck.position.set(0, 8.5, 14.5);
    monasteryGroup.add(terraceDeck);

    scene.add(monasteryGroup);
    this.addStaticBox(world, pos[0], pos[1] + 9.0, pos[2], 11, 12.0, 10);
    this.addStaticBox(world, pos[0], pos[1] + 8.5, pos[2] + 14.5, 8, 0.5, 7);

    // Clear, Unobstructed Landing Pad on the Lookout Terrace at z = -190.5
    this.createRooftopLandingPad(scene, world, 65, 71.0, -190.5, 9.0, '🎯');
  }

  private buildWindmills(scene: THREE.Scene, world: RAPIER.World): void {
    const matCloth = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.55 });
    const windmillSpots: Array<[number, number]> = [
      [180, 90],
      [195, 115],
      [165, 65],
    ];

    for (const [x, z] of windmillSpots) {
      const y = AlpineTerrain.getElevation(x, z);

      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.5, 4.0, 16), matGraniteStone);
      plinth.position.set(x, y - 2.0, z);
      scene.add(plinth);

      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 4.6, 16, 24), matGraniteStone);
      tower.position.set(x, y + 8.0, z);
      tower.castShadow = true;
      scene.add(tower);
      this.addStaticBox(world, x, y + 8.0, z, 3.4, 10.0, 3.4);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 3.8, 16), matRoofTerracotta);
      cap.position.set(x, y + 17.5, z);
      cap.castShadow = true;
      scene.add(cap);

      const bladeGroup = new THREE.Group();
      bladeGroup.position.set(x, y + 15.5, z - 3.2);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 16), matWoodDark);
      hub.rotation.x = Math.PI / 2;
      bladeGroup.add(hub);

      for (let b = 0; b < 4; b++) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 12, 0.18), matWoodDark);
        arm.position.y = 6.0;
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 11, 0.05), matCloth);
        cloth.position.set(1.1, 6.0, 0.05);

        const blade = new THREE.Group();
        blade.rotation.z = (b * Math.PI) / 2;
        blade.add(arm, cloth);
        bladeGroup.add(blade);
      }

      scene.add(bladeGroup);
      this.windmillBlades.push(bladeGroup as unknown as THREE.Mesh);
    }

    // Side Observation Terrace (positioned safely to the side with 100% open airspace)
    const deckX = 158;
    const deckZ = 88;
    const groundDeckY = AlpineTerrain.getElevation(deckX, deckZ);
    const deckY = groundDeckY + 2.5;

    const deckGroup = new THREE.Group();
    deckGroup.position.set(deckX, deckY, deckZ);

    const supportMat = matWoodDark;
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.0, 0.8), supportMat);
    s1.position.set(-4.2, -4.0, -4.2);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.0, 0.8), supportMat);
    s2.position.set(4.2, -4.0, -4.2);
    const s3 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.0, 0.8), supportMat);
    s3.position.set(-4.2, -4.0, 4.2);
    const s4 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.0, 0.8), supportMat);
    s4.position.set(4.2, -4.0, 4.2);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.6, 11.0), matWoodDark);
    platform.receiveShadow = true;
    deckGroup.add(s1, s2, s3, s4, platform);

    scene.add(deckGroup);
    this.addStaticBox(world, deckX, deckY, deckZ, 5.5, 0.3, 5.5);

    this.createRooftopLandingPad(scene, world, deckX, deckY + 0.35, deckZ, 7.8, '📦');
  }

  private buildDairyMeadow(scene: THREE.Scene, world: RAPIER.World): void {
    const groundY = AlpineTerrain.getElevation(-95, 160);
    const barnGroup = new THREE.Group();
    barnGroup.position.set(-95, groundY, 160);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(16.0, 3.0, 14.0), matGraniteStone);
    plinth.position.y = -1.5;
    barnGroup.add(plinth);

    const matBarnRed = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.65 });
    const barnBody = new THREE.Mesh(new THREE.BoxGeometry(15, 8.0, 13), matBarnRed);
    barnBody.position.y = 4.0;
    barnBody.castShadow = true;
    barnGroup.add(barnBody);

    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 14, 16), matGraniteStone);
    silo.position.set(10.5, 7.0, 0);
    const siloDome = new THREE.Mesh(new THREE.SphereGeometry(2.8, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), matRoofMansard);
    siloDome.position.set(10.5, 14.0, 0);
    barnGroup.add(silo, siloDome);

    const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.4, 13.4), matWoodDark);
    roofDeck.position.y = 8.2;
    barnGroup.add(roofDeck);

    scene.add(barnGroup);
    this.addStaticBox(world, -95, groundY + 4.0, 160, 7.5, 5.5, 6.5);
    this.addStaticBox(world, -84.5, groundY + 7.0, 160, 2.8, 8.5, 2.8);

    this.createRooftopLandingPad(scene, world, -95, groundY + 8.5, 160, 7.8, '🎯');

    // Grazing Cows
    const matCowWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
    const matCowBlack = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    const cowPositions: Array<[number, number, number]> = [
      [-78, 148, 0.4],
      [-110, 172, 1.8],
      [-85, 180, -1.2],
      [-120, 145, 2.6],
    ];

    for (const [x, z, angle] of cowPositions) {
      const cy = AlpineTerrain.getElevation(x, z);
      const cowRoot = new THREE.Group();
      cowRoot.position.set(x, cy + 0.9, z);
      cowRoot.rotation.y = angle;

      const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 2.0), matCowWhite);
      const spot = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.7, 0.9), matCowBlack);
      spot.position.set(0, 0.1, 0.1);
      cowRoot.add(torso, spot);

      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.4, 1.2);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.9), matCowWhite);
      headGroup.add(head);
      cowRoot.add(headGroup);

      for (const [lx, lz] of [
        [-0.5, -0.75],
        [0.5, -0.75],
        [-0.5, 0.75],
        [0.5, 0.75],
      ]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.0, 12), matCowBlack);
        leg.position.set(lx, -0.8, lz);
        cowRoot.add(leg);
      }

      scene.add(cowRoot);
      this.cows.push({ group: cowRoot, head: headGroup, baseAngle: angle });
      this.addStaticBox(world, x, cy + 0.9, z, 0.8, 0.9, 1.1);
    }
  }

  private buildWoodenBridge(scene: THREE.Scene, world: RAPIER.World): void {
    const bridgeY = AlpineTerrain.getElevation(-150, -110);

    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(38, 0.8, 7.5), matWoodDark);
    bridgeDeck.position.set(-150, bridgeY + 0.4, -110);
    scene.add(bridgeDeck);
    this.addStaticBox(world, -150, bridgeY + 0.4, -110, 19, 0.5, 3.75);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(39, 0.6, 9.5), matRoofTerracotta);
    roof.position.set(-150, bridgeY + 4.9, -110);
    scene.add(roof);

    for (const px of [-162, -138]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(4.5, 16.0, 7.0), matGraniteStone);
      pier.position.set(px, bridgeY - 7.0, -110);
      scene.add(pier);
      this.addStaticBox(world, px, bridgeY - 7.0, -110, 2.25, 8.0, 3.5);
    }

    const chaletGroundY = AlpineTerrain.getElevation(-150, -126);
    this.createDetailedChalet(scene, world, -150, chaletGroundY, -126, 10.0, 7.5, 9.0, 0, true);
    this.createRooftopLandingPad(scene, world, -150, chaletGroundY + 7.8, -126, 7.0, '🎯');
  }

  private buildInstancedPineForest(scene: THREE.Scene, world: RAPIER.World): void {
    const treeCount = 850; // Expansive 850+ Multi-Tier Spruce Forest

    const trunk = new THREE.CylinderGeometry(0.35, 0.55, 4.5, 10);
    trunk.translate(0, 2.25, 0);

    const foliage1 = new THREE.ConeGeometry(3.6, 4.2, 10);
    foliage1.translate(0, 4.8, 0);

    const foliage2 = new THREE.ConeGeometry(2.8, 3.8, 10);
    foliage2.translate(0, 7.2, 0);

    const foliage3 = new THREE.ConeGeometry(1.9, 3.2, 10);
    foliage3.translate(0, 9.4, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.95 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x0f4a24, roughness: 0.8 });

    const instTrunks = new THREE.InstancedMesh(trunk, trunkMat, treeCount);
    const instLeaves1 = new THREE.InstancedMesh(foliage1, leavesMat, treeCount);
    const instLeaves2 = new THREE.InstancedMesh(foliage2, leavesMat, treeCount);
    const instLeaves3 = new THREE.InstancedMesh(foliage3, leavesMat, treeCount);

    instTrunks.castShadow = true;
    instLeaves1.castShadow = true;
    instLeaves2.castShadow = true;
    instLeaves3.castShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;

    for (let i = 0; i < 3000 && placed < treeCount; i++) {
      const rx = (Math.sin(i * 17.3 + 0.4) * 0.5 + 0.5) * 880 - 440;
      const rz = (Math.cos(i * 23.9 + 0.8) * 0.5 + 0.5) * 880 - 440;

      // Exclude town centers & clearings
      if (Math.hypot(rx, rz) < 70) continue;
      if (Math.hypot(rx - 120, rz + 75) < 45) continue; // Seeberg Village
      if (Math.hypot(rx - 160, rz - 45) < 40) continue; // Bergdorf Hamlet
      if (Math.abs(rx + 22) < 26 && rz > -15 && rz < 140) continue;
      if (Math.hypot(rx - 65, rz + 205) < 36) continue;
      if (Math.hypot(rx - 180, rz - 90) < 30) continue;
      if (Math.hypot(rx + 95, rz - 160) < 38) continue;

      const ry = AlpineTerrain.getElevation(rx, rz);
      if (ry > 52 || ry < 2.0) continue;

      const scale = 0.75 + (i % 6) * 0.12;
      dummy.position.set(rx, ry, rz);
      dummy.scale.setScalar(scale);
      dummy.rotation.y = (i * 0.85) % (Math.PI * 2);
      dummy.rotation.x = Math.sin(i * 3.1) * 0.05;
      dummy.updateMatrix();

      instTrunks.setMatrixAt(placed, dummy.matrix);
      instLeaves1.setMatrixAt(placed, dummy.matrix);
      instLeaves2.setMatrixAt(placed, dummy.matrix);
      instLeaves3.setMatrixAt(placed, dummy.matrix);

      this.addStaticBox(world, rx, ry + 2.2 * scale, rz, 0.45 * scale, 2.2 * scale, 0.45 * scale);
      placed++;
    }

    instTrunks.instanceMatrix.needsUpdate = true;
    instLeaves1.instanceMatrix.needsUpdate = true;
    instLeaves2.instanceMatrix.needsUpdate = true;
    instLeaves3.instanceMatrix.needsUpdate = true;

    scene.add(instTrunks, instLeaves1, instLeaves2, instLeaves3);
  }

  private createDetailedChalet(
    scene: THREE.Scene,
    world: RAPIER.World,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rotY: number,
    hasFlatRoof: boolean = false
  ): void {
    const group = new THREE.Group();
    group.position.set(x, y + h / 2, z);
    group.rotation.y = rotY;

    const foundation = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 2.5, d * 1.02), matGraniteStone);
    foundation.position.y = -h * 0.5 - 0.5;
    foundation.castShadow = true;
    group.add(foundation);

    const stoneBase = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.44, d), matPlasterWhite);
    stoneBase.position.y = -h * 0.28;
    stoneBase.castShadow = true;
    group.add(stoneBase);

    const timberFloor = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, h * 0.56, d * 1.04), matWoodWarm);
    timberFloor.position.y = h * 0.22;
    timberFloor.castShadow = true;
    group.add(timberFloor);

    const balconyDeck = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.18, 1.5), matWoodDark);
    balconyDeck.position.set(0, h * 0.05, d * 0.52 + 0.75);
    const flowers = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.2, 0.25), matFlowerBloom);
    flowers.position.set(0, h * 0.42, d * 0.52 + 1.3);
    group.add(balconyDeck, flowers);

    if (hasFlatRoof) {
      const flatDeck = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, 0.4, d * 1.08), matWoodDark);
      flatDeck.position.y = h * 0.52;
      group.add(flatDeck);
    } else {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.88, h * 0.7, 4), matRoofTerracotta);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = h * 0.78;
      roof.castShadow = true;
      group.add(roof);
    }

    const winGeo = new THREE.BoxGeometry(1.3, 1.3, 0.12);
    const win1 = new THREE.Mesh(winGeo, matWindowGlass);
    win1.position.set(-w * 0.26, h * 0.25, d * 0.53);
    const win2 = new THREE.Mesh(winGeo, matWindowGlass);
    win2.position.set(w * 0.26, h * 0.25, d * 0.53);
    group.add(win1, win2);

    scene.add(group);
    this.addStaticBox(world, x, y + h / 2, z, w / 2, h / 2 + 1.2, d / 2);
  }

  private addStaticBox(
    world: RAPIER.World,
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number
  ): void {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.1);
    world.createCollider(colliderDesc, body);
  }
}
