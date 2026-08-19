/**
 * 6-Checkpoint Aerobatic Slalom Ring Course
 */

import * as THREE from 'three';
import type { RenderoniEngine } from '../../../../core/engine.js';
import { model, type EntityInstance } from '../../../../presets/index.js';

export interface RingData {
  entity: EntityInstance;
  pos: THREE.Vector3;
  radius: number;
  cleared: boolean;
  mesh: THREE.Mesh;
}

export function buildWaypointRings(engine: RenderoniEngine): RingData[] {
  const ringCoords: Array<{ pos: [number, number, number]; rotY: number }> = [
    { pos: [0, 48, -320], rotY: 0 },
    { pos: [180, 85, -380], rotY: Math.PI / 6 },
    { pos: [320, 110, -100], rotY: Math.PI / 2.5 },
    { pos: [220, 95, 200], rotY: (Math.PI * 3) / 4 },
    { pos: [-120, 75, 280], rotY: Math.PI },
    { pos: [-240, 50, 40], rotY: -Math.PI / 3 },
  ];

  const rings: RingData[] = [];

  ringCoords.forEach((coord, idx) => {
    const ringGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.5,
      roughness: 0.2,
    });
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(12, 0.8, 12, 32), mat);
    ringGroup.add(ringMesh);
    ringGroup.position.set(coord.pos[0], coord.pos[1], coord.pos[2]);
    ringGroup.rotation.y = coord.rotY;

    const entity = engine.add(
      model({
        id: `nav_ring_${idx + 1}`,
        object: ringGroup,
        position: coord.pos,
        physics: 'none',
        tags: ['waypoint', 'ring', 'checkpoint'],
        state: { ringNumber: idx + 1, cleared: false },
      })
    );

    rings.push({
      entity,
      pos: new THREE.Vector3(coord.pos[0], coord.pos[1], coord.pos[2]),
      radius: 12,
      cleared: false,
      mesh: ringMesh,
    });
  });

  return rings;
}
