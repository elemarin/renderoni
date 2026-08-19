/**
 * Manor Architecture & Lighting Model Generator
 */

import * as THREE from 'three';
import { mesh } from '../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../core/engine.js';
import {
  createWallpaperTexture,
  createStoneTileTexture,
  createCarpetTexture,
} from '../../../materials.js';

export function buildManorArchitecture(engine: RenderoniEngine): void {
  const wallTex = createWallpaperTexture();
  const stoneTex = createStoneTileTexture();
  const carpetTex = createCarpetTexture();

  const opaque = (mat: THREE.MeshStandardMaterial) => {
    mat.transparent = false;
    mat.opacity = 1;
    mat.depthWrite = true;
    mat.depthTest = true;
    mat.side = THREE.FrontSide;
    return mat;
  };
  const floorMat = opaque(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.6, metalness: 0.1 }));
  const wallMat = opaque(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 }));
  const rugMat = opaque(new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.9 }));
  const ceilingMat = opaque(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95 }));

  // 1. Grand Main Hallway (42m depth)
  engine.add(
    mesh({
      id: 'hall_floor',
      customGeometry: new THREE.BoxGeometry(6.6, 0.4, 42),
      material: floorMat,
      position: [0, -0.2, -10],
      physics: 'static',
      tags: ['floor', 'hallway'],
    })
  );

  engine.add(
    mesh({
      id: 'hall_ceiling',
      customGeometry: new THREE.BoxGeometry(6.6, 0.4, 42),
      material: ceilingMat,
      position: [0, 4.8, -10],
      physics: 'static',
      tags: ['ceiling', 'hallway'],
    })
  );

  engine.add(
    mesh({
      id: 'hall_rug',
      customGeometry: new THREE.BoxGeometry(2.2, 0.02, 38),
      material: rugMat,
      position: [0, 0.02, -10],
      physics: 'none',
      tags: ['rug', 'decor'],
    })
  );

  // Main Hall Walls
  engine.add(mesh({ id: 'hall_wall_back', customGeometry: new THREE.BoxGeometry(6.6, 4.8, 0.4), material: wallMat, position: [0, 2.4, 10.8], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_L1', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 8), material: wallMat, position: [-3.3, 2.4, 6.8], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_L2', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 12), material: wallMat, position: [-3.3, 2.4, -6], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_L3', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 12), material: wallMat, position: [-3.3, 2.4, -22], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_R1', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 14), material: wallMat, position: [3.3, 2.4, 3.8], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_R2', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 12), material: wallMat, position: [3.3, 2.4, -14], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_R3', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 6), material: wallMat, position: [3.3, 2.4, -26], physics: 'static', tags: ['wall'] }));

  // Helper for Alcove Rooms
  const buildRoom = (cx: number, cz: number, w: number, d: number) => {
    engine.add(mesh({ customGeometry: new THREE.BoxGeometry(w, 0.4, d), material: floorMat, position: [cx, -0.2, cz], physics: 'static', tags: ['floor', 'room'] }));
    engine.add(mesh({ customGeometry: new THREE.BoxGeometry(w, 0.4, d), material: ceilingMat, position: [cx, 4.8, cz], physics: 'static', tags: ['ceiling', 'room'] }));
    const halfW = w / 2;
    const halfD = d / 2;
    const isLeft = cx < 0;
    engine.add(mesh({ customGeometry: new THREE.BoxGeometry(0.4, 4.8, d), material: wallMat, position: [cx + (isLeft ? -halfW : halfW), 2.4, cz], physics: 'static', tags: ['wall'] }));
    engine.add(mesh({ customGeometry: new THREE.BoxGeometry(w, 4.8, 0.4), material: wallMat, position: [cx, 2.4, cz + halfD], physics: 'static', tags: ['wall'] }));
    engine.add(mesh({ customGeometry: new THREE.BoxGeometry(w, 4.8, 0.4), material: wallMat, position: [cx, 2.4, cz - halfD], physics: 'static', tags: ['wall'] }));
  };

  buildRoom(-8, 2, 8, 8);   // Room 1: Study
  buildRoom(8, -6, 8, 8);   // Room 2: Key
  buildRoom(-8, -14, 8, 8); // Room 3: Clock
  buildRoom(8, -22, 8, 8);  // Room 4: Crest

  // Sconces
  const sconcePositions: Array<[number, number, number]> = [
    [2.9, 2.2, 4],
    [-2.9, 2.2, 4],
    [2.9, 2.2, -4],
    [-2.9, 2.2, -4],
    [2.9, 2.2, -12],
    [-2.9, 2.2, -12],
    [-7.5, 2.2, 2],
    [7.5, 2.2, -6],
    [-6.0, 2.4, -12.5],
    [7.5, 2.2, -22],
  ];

  sconcePositions.forEach((pos, idx) => {
    engine.add(mesh({ id: `sconce_bracket_${idx}`, geometry: 'box', size: [0.15, 0.35, 0.25], position: pos, color: 0x1e293b, physics: 'none', tags: ['scenery', 'sconce'] }));
    engine.add(mesh({ id: `sconce_flame_${idx}`, geometry: 'cone', size: [0.08, 0.2], position: [pos[0], pos[1] + 0.18, pos[2]], color: 0xf97316, physics: 'none', tags: ['flame'] }));
    const pLight = new THREE.PointLight(0xf59e0b, 1.8, 10, 1.6);
    pLight.position.set(pos[0], pos[1] + 0.2, pos[2]);
    engine.native.scene.add(pLight);
  });
}
