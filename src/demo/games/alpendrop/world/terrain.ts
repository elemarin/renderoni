/**
 * AlpenDrop High-Fidelity Expansive Alpine Geomorphology Engine (960m x 960m)
 * Features an expansive multi-town valley, crystal mountain lake bay, elevated dry village basin,
 * and sharp Matterhorn arêtes with rich PBR vertex colors.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

function smoothstep(min: number, max: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

function hash2D(x: number, z: number): number {
  const sin = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return sin - Math.floor(sin);
}

function noise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uz = fz * fz * (3.0 - 2.0 * fz);

  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1.0, iz);
  const c = hash2D(ix, iz + 1.0);
  const d = hash2D(ix + 1.0, iz + 1.0);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number, octaves: number = 4): number {
  let val = 0.0;
  let amp = 1.0;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, z * freq) * amp;
    freq *= 2.05;
    amp *= 0.5;
  }
  return val;
}

function ridgedMF(x: number, z: number, octaves: number = 4): number {
  let val = 0.0;
  let amp = 1.0;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    const n = noise2D(x * freq, z * freq);
    const r = 1.0 - Math.abs(n * 2.0 - 1.0);
    val += r * r * amp;
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}

export class AlpineTerrain {
  mesh!: THREE.Mesh;
  collider!: RAPIER.Collider;

  static getRiverCenterZ(x: number): number {
    return -75 + Math.sin(x * 0.012) * 45; // Curving through north canyon
  }

  static getElevation(x: number, z: number): number {
    // 1. Domain Warping for Organic Mountain Massifs
    const qx = fbm(x * 0.0025, z * 0.0025, 3);
    const qz = fbm((x + 80) * 0.0025, (z + 80) * 0.0025, 3);
    const warpedX = x + qx * 55.0;
    const warpedZ = z + qz * 55.0;

    // 2. Base Mountain Ridges & Arêtes
    const ridgeLarge = ridgedMF(warpedX * 0.004, warpedZ * 0.004, 4);
    const detailNoise = fbm(x * 0.018, z * 0.018, 3) * 4.0;

    let elevation = ridgeLarge * 34.0 + detailNoise;

    // 3. Central Village Basin (Alpenburg - Elevated Dry Plateau at y = 3.2m)
    const dTown = Math.hypot(x - 5, z - 10);
    if (dTown < 110) {
      const wTown = 1.0 - smoothstep(35, 110, dTown);
      const townPlateau = 3.2 + Math.sin(x * 0.03) * 0.2;
      elevation = elevation * (1.0 - wTown) + townPlateau * wTown;
    }

    // 4. North-East Lakeside Port (Seeberg at x: 120, z: -75 - Lake shore at y = 3.8m)
    const dLake = Math.hypot(x - 120, z + 75);
    if (dLake < 75) {
      const wLake = 1.0 - smoothstep(25, 75, dLake);
      const lakeShoreH = 3.8 + Math.sin(x * 0.04) * 0.3;
      elevation = elevation * (1.0 - wLake) + lakeShoreH * wLake;
    }

    // 5. Eastern Ski Hamlet (Bergdorf at x: 160, z: 45 - Terrace at y = 24.0m)
    const dHamlet = Math.hypot(x - 160, z - 45);
    if (dHamlet < 65) {
      const wHamlet = 1.0 - smoothstep(20, 65, dHamlet);
      elevation = elevation * (1.0 - wHamlet) + 24.0 * wHamlet;
    }

    // 6. North Monastery Summit Peak (x: 65, z: -205)
    // Monastery perched right ON TOP at y = 62.0m!
    const dMonastery = Math.hypot(x - 65, z + 205);
    if (dMonastery < 200) {
      const pMonastery = 1.0 - smoothstep(0, 200, dMonastery);
      const peakShape = Math.pow(pMonastery, 1.8) * 65.0;
      if (dMonastery < 32) {
        const wSummit = 1.0 - smoothstep(14, 32, dMonastery);
        elevation = Math.max(elevation, peakShape * (1.0 - wSummit) + 62.0 * wSummit);
      } else {
        elevation = Math.max(elevation, peakShape);
      }
    }

    // 7. East Windmill Ridge Crest (x: 180, z: 90)
    // Windmills perched ON TOP at y = 35.5m!
    const distToRidgeAxis = Math.abs(x - (180 + Math.sin(z * 0.02) * 15));
    if (z > 20 && z < 180 && distToRidgeAxis < 90) {
      const wRidgeZ = Math.sin(((z - 20) / 160) * Math.PI);
      const wRidgeX = 1.0 - smoothstep(0, 90, distToRidgeAxis);
      const ridgeHeight = 36.0 * wRidgeZ * Math.pow(wRidgeX, 1.4);
      if (distToRidgeAxis < 18) {
        const wCrest = 1.0 - smoothstep(8, 18, distToRidgeAxis);
        elevation = Math.max(elevation, ridgeHeight * (1.0 - wCrest) + (35.5 + Math.sin(z * 0.05) * 0.5) * wCrest);
      } else {
        elevation = Math.max(elevation, ridgeHeight);
      }
    }

    // 8. South Dairy Meadow Pasture (x: -95, z: 160)
    // High alpine pasture plateau at y = 18.0m
    const dMeadow = Math.hypot(x + 95, z - 160);
    if (dMeadow < 90) {
      const wMeadow = 1.0 - smoothstep(35, 90, dMeadow);
      const meadowH = 18.0 + Math.sin(x * 0.03) * 0.5 + Math.cos(z * 0.03) * 0.5;
      elevation = elevation * (1.0 - wMeadow) + meadowH * wMeadow;
    }

    // 9. North Canyon River Gorge
    const riverCenterZ = AlpineTerrain.getRiverCenterZ(x);
    const riverDist = Math.abs(z - riverCenterZ);
    if (riverDist < 30 && Math.hypot(x, z) > 75) {
      const wCanyon = 1.0 - smoothstep(8, 30, riverDist);
      const riverBed = 0.6 + Math.pow(riverDist / 30, 1.8) * 3.2;
      elevation = elevation * (1.0 - wCanyon) + riverBed * wCanyon;
    }

    // 10. West Gorge Covered Bridge Abutment (x: -150, z: -110)
    const dBridge = Math.hypot(x + 150, z + 110);
    if (dBridge < 55) {
      const wBridge = 1.0 - smoothstep(18, 55, dBridge);
      elevation = elevation * (1.0 - wBridge) + 14.0 * wBridge;
    }

    // 11. Expansive Surrounding High Mountain Horns
    const dPeakNW = Math.hypot(x + 320, z + 340);
    if (dPeakNW < 300) {
      const pNW = 1.0 - smoothstep(0, 300, dPeakNW);
      elevation += Math.pow(pNW, 1.6) * 88.0;
    }

    const dPeakSE = Math.hypot(x - 340, z - 320);
    if (dPeakSE < 280) {
      const pSE = 1.0 - smoothstep(0, 280, dPeakSE);
      elevation += Math.pow(pSE, 1.5) * 68.0;
    }

    const dPeakSW = Math.hypot(x + 340, z - 280);
    if (dPeakSW < 260) {
      const pSW = 1.0 - smoothstep(0, 260, dPeakSW);
      elevation += Math.pow(pSW, 1.5) * 62.0;
    }

    return Math.max(0.8, elevation);
  }

  static isRoad(x: number, z: number): boolean {
    const roads = [
      // Main Town Street
      (px: number, pz: number) => Math.abs(px - 14) < 3.2 && pz > -50 && pz < 45,
      // Airstrip connector road
      (px: number, pz: number) => Math.abs(pz + 16) < 3.0 && px > -65 && px < 40,
      // Town Plaza
      (px: number, pz: number) => Math.hypot(px - 16, pz + 4) < 22 && Math.hypot(px - 16, pz + 4) > 14,
      // Road to Seeberg Lakeside Village (North-East)
      (px: number, pz: number) => {
        if (px < 15 || px > 125) return false;
        const targetZ = -15 + (px - 15) * -0.55 + Math.sin(px * 0.08) * 8;
        return Math.abs(pz - targetZ) < 3.2;
      },
      // Road to Bergdorf Mountain Hamlet (East)
      (px: number, pz: number) => {
        if (px < 20 || px > 165) return false;
        const targetZ = 8 + (px - 20) * 0.25 + Math.sin(px * 0.08) * 9;
        return Math.abs(pz - targetZ) < 3.2;
      },
      // Monastery Trail (North)
      (px: number, pz: number) => {
        if (pz > -40 || pz < -195) return false;
        const targetX = 15 + Math.sin(pz * 0.06) * 26 + (pz + 40) * -0.28;
        return Math.abs(px - targetX) < 3.0;
      },
      // Dairy Meadow Lane (South)
      (px: number, pz: number) => {
        if (pz < 35 || pz > 155) return false;
        const targetX = 14 + (pz - 35) * -0.85 + Math.sin(pz * 0.07) * 10;
        return Math.abs(px - targetX) < 3.2;
      },
    ];
    return roads.some((fn) => fn(x, z));
  }

  build(scene: THREE.Scene, world: RAPIER.World): void {
    const size = 960; // Expansive 960m x 960m Alpine Terrain
    const segments = 280;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const posAttr = geometry.attributes.position;
    const vertexCount = posAttr.count;

    for (let i = 0; i < vertexCount; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = AlpineTerrain.getElevation(vx, vz);
      posAttr.setY(i, vy);
    }

    geometry.computeVertexNormals();

    const colors = new Float32Array(vertexCount * 3);
    const normAttr = geometry.attributes.normal;

    const colMeadowValley = new THREE.Color(0x16a34a);
    const colMeadowLush = new THREE.Color(0x15803d);
    const colMeadowPasture = new THREE.Color(0x22c55e);
    const colRockGranite = new THREE.Color(0x64748b);
    const colRockSlate = new THREE.Color(0x334155);
    const colRockDark = new THREE.Color(0x1e293b);
    const colSnow = new THREE.Color(0xf8fafc);
    const colSnowIce = new THREE.Color(0xe2e8f0);
    const colRoadCobble = new THREE.Color(0x78716c);
    const colRiverSand = new THREE.Color(0xa8a29e);

    const tempCol = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const ny = normAttr.getY(i);

      const slope = 1.0 - ny;
      const isRoad = AlpineTerrain.isRoad(x, z) && y < 62;

      const riverCenterZ = AlpineTerrain.getRiverCenterZ(x);
      const riverDist = Math.abs(z - riverCenterZ);
      const isRiverBank = riverDist < 18 && y < 4.5 && Math.hypot(x, z) > 75;

      const dMeadow = Math.hypot(x + 95, z - 160);
      const isDairyPasture = dMeadow < 75;

      if (isRoad) {
        tempCol.copy(colRoadCobble);
      } else if (isRiverBank) {
        tempCol.lerpColors(colRiverSand, colRockDark, Math.min(1.0, (4.5 - y) / 3.0));
      } else if (isDairyPasture && slope < 0.35) {
        const buttercup = (Math.sin(x * 0.15) * Math.cos(z * 0.15) + 1) * 0.5;
        tempCol.lerpColors(colMeadowValley, colMeadowPasture, buttercup * 0.7);
      } else if (slope > 0.45) {
        const rockFactor = Math.min(1.0, (slope - 0.45) / 0.35);
        if (y > 48) {
          tempCol.lerpColors(colRockSlate, colRockDark, rockFactor);
        } else {
          tempCol.lerpColors(colRockGranite, colRockDark, rockFactor);
        }
      } else if (y > 46) {
        const snowFactor = Math.min(1.0, (y - 46) / 16.0);
        if (slope < 0.35) {
          tempCol.lerpColors(colRockSlate, colSnow, snowFactor);
        } else {
          tempCol.lerpColors(colRockDark, colSnowIce, snowFactor * 0.7);
        }
      } else {
        const grassVar = (Math.sin(x * 0.04) * Math.cos(z * 0.04) + 1) * 0.5;
        tempCol.lerpColors(colMeadowLush, colMeadowValley, grassVar);
        if (y > 22 && slope > 0.22) {
          const tRock = Math.min(1.0, ((y - 22) / 24.0) * (slope / 0.45));
          tempCol.lerp(colRockGranite, tRock);
        }
      }

      colors[i * 3] = tempCol.r;
      colors[i * 3 + 1] = tempCol.g;
      colors[i * 3 + 2] = tempCol.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.04,
      flatShading: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // 100% Exact 1:1 Physical Trimesh Collider (Every mountain peak, cliff & slope is 100% solid!)
    const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    const groundBody = world.createRigidBody(groundBodyDesc);

    const vertices = new Float32Array(posAttr.array);
    const indices = new Uint32Array(geometry.index!.array);

    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.2)
      .setRestitution(0.0);

    this.collider = world.createCollider(colliderDesc, groundBody);
  }
}
