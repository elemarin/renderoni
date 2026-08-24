/**
 * Manor Floor & Ceiling Terrain
 *
 * Conceptually "terrain": the ground/ceiling shape the level sits inside,
 * as opposed to `structure/` (walls, doorframes) or `decor/`/`items/`
 * (placed set-dressing and quest props). See docs/architecture/levels.md.
 */

import * as THREE from 'three';
import { mesh } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';
import { createWoodTexture, createCarpetTexture } from '../../../../materials.js';

export interface ManorFloorResult {
  floorMat: THREE.MeshStandardMaterial;
  ceilingMat: THREE.MeshStandardMaterial;
}

const opaque = (mat: THREE.MeshStandardMaterial) => {
  mat.transparent = false;
  mat.opacity = 1;
  mat.depthWrite = true;
  mat.depthTest = true;
  mat.side = THREE.FrontSide;
  return mat;
};

/** Builds the main hallway floor, ceiling, and carpet runner. Returns the
 * shared floor/ceiling materials so `structure/` room shells can reuse them. */
export function buildManorFloor(engine: RenderoniEngine): ManorFloorResult {
  const woodFloorTex = createWoodTexture({ base: '#26160e', dark: '#100805' });
  const carpetTex = createCarpetTexture();

  const floorMat = opaque(new THREE.MeshStandardMaterial({ map: woodFloorTex, roughness: 0.75, metalness: 0.05 }));
  const rugMat = opaque(new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.9 }));
  const ceilingMat = opaque(new THREE.MeshStandardMaterial({ color: 0x0a0604, roughness: 0.95 }));

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

  // Worn Frayed Crimson Carpet Runner
  engine.add(
    mesh({
      id: 'hall_rug',
      customGeometry: new THREE.BoxGeometry(2.4, 0.02, 38),
      material: rugMat,
      position: [0, 0.02, -10],
      physics: 'none',
      tags: ['rug', 'decor'],
    })
  );

  return { floorMat, ceilingMat };
}

/**
 * Standalone Victorian geometric-tile terrain factory (img2threejs style,
 * zero-arg, previewable in the editor). Not currently wired into the manor
 * hallway, but available as an alternate floor look for a future room.
 */
export function createVictorianGeometricTilingTerrain(): THREE.Object3D {
  const group = new THREE.Group();
  const width = 12;
  const length = 22;
  const tileHeight = 0.025;

  const materials = {
    black: new THREE.MeshStandardMaterial({ color: 0x171719, roughness: 0.72 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xd8c79b, roughness: 0.68 }),
    terracotta: new THREE.MeshStandardMaterial({ color: 0x71352a, roughness: 0.72 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x405c70, roughness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe5dcc3, roughness: 0.65 }),
  };

  const base = new THREE.Mesh(new THREE.PlaneGeometry(width, length), materials.black);
  base.rotation.x = -Math.PI / 2;
  base.receiveShadow = true;
  group.add(base);

  const addTile = (
    x: number,
    z: number,
    size: number,
    material: THREE.MeshStandardMaterial,
    rotation = 0,
  ) => {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    tile.rotation.x = -Math.PI / 2;
    tile.rotation.z = rotation;
    tile.position.set(x, tileHeight, z);
    tile.receiveShadow = true;
    group.add(tile);
  };

  const addDiamond = (
    x: number,
    z: number,
    size: number,
    material: THREE.MeshStandardMaterial,
  ) => addTile(x, z, size, material, Math.PI / 4);

  const addBorder = (
    x: number,
    z: number,
    borderWidth: number,
    borderLength: number,
    material: THREE.MeshStandardMaterial,
  ) => {
    const border = new THREE.Mesh(new THREE.PlaneGeometry(borderWidth, borderLength), material);
    border.rotation.x = -Math.PI / 2;
    border.position.set(x, tileHeight + 0.005, z);
    border.receiveShadow = true;
    group.add(border);
  };

  addBorder(-5.55, 0, 0.22, length - 0.4, materials.cream);
  addBorder(5.55, 0, 0.22, length - 0.4, materials.cream);
  addBorder(-5.2, 0, 0.18, length - 0.8, materials.terracotta);
  addBorder(5.2, 0, 0.18, length - 0.8, materials.terracotta);
  addBorder(0, -10.55, width - 0.4, 0.22, materials.cream);
  addBorder(0, 10.55, width - 0.4, 0.22, materials.cream);
  addBorder(0, -10.2, width - 0.8, 0.18, materials.terracotta);
  addBorder(0, 10.2, width - 0.8, 0.18, materials.terracotta);

  for (let row = 0; row < 20; row += 1) {
    const z = -9.5 + row;
    for (let column = 0; column < 10; column += 1) {
      const x = -4.5 + column;
      const alternate = (row + column) % 2 === 0;

      addTile(x, z, 0.82, alternate ? materials.cream : materials.black);

      if ((row + column) % 4 === 0) {
        addDiamond(x, z, 0.48, materials.blue);
        addDiamond(x, z, 0.24, materials.white);
      } else if ((row * 3 + column) % 5 === 0) {
        addDiamond(x, z, 0.42, materials.terracotta);
        addDiamond(x, z, 0.2, materials.cream);
      }
    }
  }

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const x = -4 + column * 2;
      const z = -8 + row * 4;
      addDiamond(x, z, 0.74, materials.terracotta);
      addDiamond(x, z, 0.52, materials.black);
      addDiamond(x, z, 0.3, materials.cream);
      addDiamond(x, z, 0.14, materials.blue);
    }
  }

  return group;
}
