/**
 * Manor Hallway Walls, Lintels & Room Shells
 *
 * Conceptually "structure": architectural framing (walls, doorway headers,
 * per-room shells) as opposed to `terrain/` (floor/ceiling shape) or
 * `decor/`/`items/` (placed set-dressing and quest props).
 * See docs/architecture/levels.md.
 */

import * as THREE from 'three';
import { mesh } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';
import { createWallpaperTexture } from '../../../../materials.js';

/** Builds the main hallway's wall segments and doorway lintels. */
export function buildHallwayWalls(engine: RenderoniEngine): { wallMat: THREE.MeshStandardMaterial } {
  const wallTex = createWallpaperTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 });
  wallMat.transparent = false;
  wallMat.side = THREE.FrontSide;

  // Back wall
  engine.add(mesh({ id: 'hall_wall_back', customGeometry: new THREE.BoxGeometry(6.6, 4.8, 0.4), material: wallMat, position: [0, 2.4, 10.8], physics: 'static', tags: ['wall'] }));

  // Left Wall (X = -3.3)
  engine.add(mesh({ id: 'hall_wall_L1', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 7.8), material: wallMat, position: [-3.3, 2.4, 6.9], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_lintel_L1', customGeometry: new THREE.BoxGeometry(0.4, 1.3, 2.0), material: wallMat, position: [-3.3, 4.15, 2.0], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_L2', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 14.0), material: wallMat, position: [-3.3, 2.4, -6.0], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_lintel_L2', customGeometry: new THREE.BoxGeometry(0.4, 1.3, 2.0), material: wallMat, position: [-3.3, 4.15, -14.0], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_L3', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 13.0), material: wallMat, position: [-3.3, 2.4, -21.5], physics: 'static', tags: ['wall'] }));

  // Right Wall (X = 3.3)
  engine.add(mesh({ id: 'hall_wall_R1', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 15.8), material: wallMat, position: [3.3, 2.4, 2.9], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_lintel_R1', customGeometry: new THREE.BoxGeometry(0.4, 1.3, 2.0), material: wallMat, position: [3.3, 4.15, -6.0], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_R2', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 14.0), material: wallMat, position: [3.3, 2.4, -14.0], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_lintel_R2', customGeometry: new THREE.BoxGeometry(0.4, 1.3, 2.0), material: wallMat, position: [3.3, 4.15, -22.0], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: 'hall_wall_R3', customGeometry: new THREE.BoxGeometry(0.4, 4.8, 5.0), material: wallMat, position: [3.3, 2.4, -25.5], physics: 'static', tags: ['wall'] }));

  return { wallMat };
}

/** Builds one alcove room shell (floor + ceiling + 3 walls, open on the
 * hallway-facing side). Reused per-room by the level assembler so each room
 * is independently identifiable/editable instead of baked into one
 * monolithic function. */
export function buildManorRoom(
  engine: RenderoniEngine,
  id: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  floorMat: THREE.MeshStandardMaterial,
  ceilingMat: THREE.MeshStandardMaterial,
  wallMat: THREE.MeshStandardMaterial
): void {
  const halfW = w / 2;
  const halfD = d / 2;
  const isLeft = cx < 0;

  // The room's floor/ceiling box (centered on cx, width w) falls short of the
  // hallway floor/walls at x = ±3.3, leaving an uncovered gap at the doorway
  // threshold. Stretch the floor & ceiling only (not the walls) on the
  // hallway-facing side so they overlap the hallway floor by `overlap`,
  // closing that gap without changing the room's wall footprint.
  const hallwayHalfWidth = 3.3;
  const overlap = 0.3;
  let floorWidth = w;
  let floorCx = cx;
  if (isLeft) {
    const targetInnerEdge = -hallwayHalfWidth + overlap;
    const extension = targetInnerEdge - (cx + halfW);
    if (extension > 0) {
      floorWidth = w + extension;
      floorCx = cx + extension / 2;
    }
  } else {
    const targetInnerEdge = hallwayHalfWidth - overlap;
    const extension = (cx - halfW) - targetInnerEdge;
    if (extension > 0) {
      floorWidth = w + extension;
      floorCx = cx - extension / 2;
    }
  }

  engine.add(mesh({ id: `${id}_floor`, customGeometry: new THREE.BoxGeometry(floorWidth, 0.4, d), material: floorMat, position: [floorCx, -0.2, cz], physics: 'static', tags: ['floor', 'room'] }));
  engine.add(mesh({ id: `${id}_ceiling`, customGeometry: new THREE.BoxGeometry(floorWidth, 0.4, d), material: ceilingMat, position: [floorCx, 4.8, cz], physics: 'static', tags: ['ceiling', 'room'] }));
  engine.add(mesh({ id: `${id}_wall_outer`, customGeometry: new THREE.BoxGeometry(0.4, 4.8, d), material: wallMat, position: [cx + (isLeft ? -halfW : halfW), 2.4, cz], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: `${id}_wall_far`, customGeometry: new THREE.BoxGeometry(w, 4.8, 0.4), material: wallMat, position: [cx, 2.4, cz + halfD], physics: 'static', tags: ['wall'] }));
  engine.add(mesh({ id: `${id}_wall_near`, customGeometry: new THREE.BoxGeometry(w, 4.8, 0.4), material: wallMat, position: [cx, 2.4, cz - halfD], physics: 'static', tags: ['wall'] }));
}
