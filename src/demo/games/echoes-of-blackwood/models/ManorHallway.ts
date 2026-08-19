/**
 * Manor Architecture, Sconces, Portraits & Atmosphere Generator
 * Reconstructed directly from Victorian Manor reference artwork
 */

import * as THREE from 'three';
import { mesh } from '../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../core/engine.js';
import {
  createWallpaperTexture,
  createWoodTexture,
  createCarpetTexture,
} from '../../../materials.js';
import { buildAncestorPortrait } from './AncestorPortrait.js';
import { buildCobweb } from './Cobweb.js';
import { buildManorDoor } from './ManorDoor.js';

export function buildManorArchitecture(engine: RenderoniEngine): void {
  const wallTex = createWallpaperTexture();
  const woodFloorTex = createWoodTexture({ base: '#26160e', dark: '#100805' });
  const carpetTex = createCarpetTexture();

  const opaque = (mat: THREE.MeshStandardMaterial) => {
    mat.transparent = false;
    mat.opacity = 1;
    mat.depthWrite = true;
    mat.depthTest = true;
    mat.side = THREE.FrontSide;
    return mat;
  };
  const floorMat = opaque(new THREE.MeshStandardMaterial({ map: woodFloorTex, roughness: 0.75, metalness: 0.05 }));
  const wallMat = opaque(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 }));
  const rugMat = opaque(new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.9 }));
  const ceilingMat = opaque(new THREE.MeshStandardMaterial({ color: 0x0a0604, roughness: 0.95 }));

  // 1. Grand Main Hallway Floor & Ceiling (42m depth)
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

  // 2. Main Hall Walls with Doorways & Alcove Openings
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

  // 3. Ancestor Portrait Paintings along Hallway (Left & Right Walls)
  const portraitConfigs: Array<{ id: string; pos: [number, number, number]; rotY: number; variant: number }> = [
    { id: 'portrait_left_1', pos: [-3.05, 2.7, 7.5], rotY: Math.PI / 2, variant: 0 },
    { id: 'portrait_left_2', pos: [-3.05, 2.7, 5.0], rotY: Math.PI / 2, variant: 1 },
    { id: 'portrait_left_3', pos: [-3.05, 2.7, -4.0], rotY: Math.PI / 2, variant: 2 },
    { id: 'portrait_left_4', pos: [-3.05, 2.7, -8.0], rotY: Math.PI / 2, variant: 0 },
    { id: 'portrait_left_5', pos: [-3.05, 2.7, -20.0], rotY: Math.PI / 2, variant: 1 },
    { id: 'portrait_right_1', pos: [3.05, 2.7, 6.0], rotY: -Math.PI / 2, variant: 1 },
    { id: 'portrait_right_2', pos: [3.05, 2.7, 1.0], rotY: -Math.PI / 2, variant: 0 },
    { id: 'portrait_right_3', pos: [3.05, 2.7, -12.0], rotY: -Math.PI / 2, variant: 2 },
    { id: 'portrait_right_4', pos: [3.05, 2.7, -16.0], rotY: -Math.PI / 2, variant: 0 },
    { id: 'portrait_back_1', pos: [-1.8, 2.7, 10.55], rotY: 0, variant: 2 },
    { id: 'portrait_back_2', pos: [1.8, 2.7, 10.55], rotY: 0, variant: 1 },
  ];

  portraitConfigs.forEach((p) => {
    buildAncestorPortrait(engine, p.id, p.pos, p.rotY, p.variant);
  });

  // 4. Victorian Paneled Doors at Alcoves & End of Hall
  buildManorDoor(engine, 'door_study', [-3.25, 0, 2], Math.PI / 2);
  buildManorDoor(engine, 'door_key', [3.25, 0, -6], -Math.PI / 2);
  buildManorDoor(engine, 'door_clock', [-3.25, 0, -14], Math.PI / 2);
  buildManorDoor(engine, 'door_crest', [3.25, 0, -22], -Math.PI / 2);

  // 5. Cobwebs in High Corners & Archways
  buildCobweb(engine, 'cobweb_1', [-3.1, 4.6, 9.5], [0, Math.PI / 4, 0]);
  buildCobweb(engine, 'cobweb_2', [3.1, 4.6, 9.5], [0, -Math.PI / 4, 0]);
  buildCobweb(engine, 'cobweb_3', [-3.1, 4.6, -10.0], [0, Math.PI / 4, 0]);
  buildCobweb(engine, 'cobweb_4', [3.1, 4.6, -18.0], [0, -Math.PI / 4, 0]);
  buildCobweb(engine, 'cobweb_5', [-7.6, 4.6, 5.8], [0, Math.PI / 2, 0]);

  // 6. Cast Iron Gas/Torch Wall Sconces with Warm Flames
  const sconcePositions: Array<[number, number, number]> = [
    [2.95, 2.4, 4],
    [-2.95, 2.4, 4],
    [2.95, 2.4, -4],
    [-2.95, 2.4, -4],
    [2.95, 2.4, -12],
    [-2.95, 2.4, -12],
    [2.95, 2.4, -20],
    [-2.95, 2.4, -20],
    [-7.5, 2.4, 2],
    [7.5, 2.4, -6],
    [-6.0, 2.4, -12.5],
    [7.5, 2.4, -22],
  ];

  sconcePositions.forEach((pos, idx) => {
    // Cast iron ornate wall mount bracket
    engine.add(
      mesh({
        id: `sconce_bracket_${idx}`,
        geometry: 'box',
        size: [0.18, 0.45, 0.28],
        position: pos,
        color: 0x18100c,
        physics: 'none',
        tags: ['scenery', 'sconce'],
      })
    );

    // Amber torch flame
    engine.add(
      mesh({
        id: `sconce_flame_${idx}`,
        geometry: 'cone',
        size: [0.09, 0.24],
        position: [pos[0], pos[1] + 0.2, pos[2]],
        color: 0xf59e0b,
        physics: 'none',
        tags: ['flame'],
      })
    );

    // Warm flickering point light
    const pLight = new THREE.PointLight(0xf59e0b, 2.4, 9, 1.4);
    pLight.position.set(pos[0], pos[1] + 0.22, pos[2]);
    engine.native.scene.add(pLight);
  });
}
