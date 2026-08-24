/**
 * Manor Level Assembler
 *
 * Composes the terrain (floor/ceiling), structure (walls, room shells,
 * doors), and decor (portraits, cobwebs, sconces) factories into the full
 * manor level. Kept thin on purpose — this is the "level script" that wires
 * small, independently-editable pieces together, not the place geometry is
 * authored. See docs/architecture/levels.md.
 */

import { buildManorFloor } from './terrain/ManorFloor.js';
import { buildHallwayWalls, buildManorRoom } from './structure/ManorWalls.js';
import { buildInteractiveManorDoor, type ManorDoorInstance } from './structure/ManorDoor.js';
import { buildAncestorPortrait } from './decor/AncestorPortrait.js';
import { buildCobweb } from './decor/Cobweb.js';
import { buildWallSconce } from './decor/WallSconce.js';
import type { RenderoniEngine } from '../../../../core/engine.js';

export interface ManorArchitectureResult {
  doorStudy: ManorDoorInstance;
  doorKey: ManorDoorInstance;
  doorClock: ManorDoorInstance;
  doorCrest: ManorDoorInstance;
}

export function buildManorArchitecture(engine: RenderoniEngine): ManorArchitectureResult {
  // 1. Terrain: hallway floor, ceiling, carpet runner.
  const { floorMat, ceilingMat } = buildManorFloor(engine);

  // 2. Structure: hallway walls/lintels, then the 4 alcove room shells.
  const { wallMat } = buildHallwayWalls(engine);
  buildManorRoom(engine, 'room_study', -8, 2, 8, 8, floorMat, ceilingMat, wallMat);   // Room 1: Study
  buildManorRoom(engine, 'room_key', 8, -6, 8, 8, floorMat, ceilingMat, wallMat);     // Room 2: Key
  buildManorRoom(engine, 'room_clock', -8, -14, 8, 8, floorMat, ceilingMat, wallMat); // Room 3: Clock
  buildManorRoom(engine, 'room_crest', 8, -22, 8, 8, floorMat, ceilingMat, wallMat);  // Room 4: Crest

  // 3. Structure: interactive doors at each room entrance.
  const doorStudy = buildInteractiveManorDoor(engine, {
    id: 'door_study',
    position: [-3.3, 0, 2.0],
    rotationY: Math.PI / 2,
    openAngle: -Math.PI / 2,
    locked: false,
  });

  const doorKey = buildInteractiveManorDoor(engine, {
    id: 'door_key',
    position: [3.3, 0, -6.0],
    rotationY: -Math.PI / 2,
    openAngle: Math.PI / 2,
    locked: false,
  });

  const doorClock = buildInteractiveManorDoor(engine, {
    id: 'door_clock',
    position: [-3.3, 0, -14.0],
    rotationY: Math.PI / 2,
    openAngle: -Math.PI / 2,
    locked: false,
  });

  const doorCrest = buildInteractiveManorDoor(engine, {
    id: 'door_crest',
    position: [3.3, 0, -22.0],
    rotationY: -Math.PI / 2,
    openAngle: Math.PI / 2,
    locked: false,
  });

  // 4. Decor: ancestor portraits along the hallway walls.
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

  // 5. Decor: cobwebs in high corners & archways.
  buildCobweb(engine, 'cobweb_1', [-3.1, 4.6, 9.5], [0, Math.PI / 4, 0]);
  buildCobweb(engine, 'cobweb_2', [3.1, 4.6, 9.5], [0, -Math.PI / 4, 0]);
  buildCobweb(engine, 'cobweb_3', [-3.1, 4.6, -10.0], [0, Math.PI / 4, 0]);
  buildCobweb(engine, 'cobweb_4', [3.1, 4.6, -18.0], [0, -Math.PI / 4, 0]);
  buildCobweb(engine, 'cobweb_5', [-7.6, 4.6, 5.8], [0, Math.PI / 2, 0]);

  // 6. Decor: cast iron gas/torch wall sconces.
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
    buildWallSconce(engine, `sconce_${idx}`, pos);
  });

  return { doorStudy, doorKey, doorClock, doorCrest };
}
