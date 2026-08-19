/**
 * Cobweb Model Factory (img2threejs / prompt-to-scene)
 */

import * as THREE from 'three';
import { model, type EntityInstance } from '../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../core/engine.js';

export function createCobwebGroup(): THREE.Group {
  const group = new THREE.Group();

  // Create spiderweb geometric struts
  const webMat = new THREE.MeshBasicMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const geo = new THREE.BufferGeometry();
  const vertices: number[] = [];

  // Radial web strands emanating from corner (0,0,0)
  const radials = 7;
  const rings = 4;
  const maxSpan = 1.1;

  for (let r = 1; r <= rings; r++) {
    const radius = (r / rings) * maxSpan;
    for (let a = 0; a < radials; a++) {
      const angle = (a / (radials - 1)) * (Math.PI / 2);
      const nextAngle = ((a + 1) / (radials - 1)) * (Math.PI / 2);

      const x1 = Math.cos(angle) * radius;
      const y1 = -Math.sin(angle) * radius * 0.9;
      const x2 = Math.cos(nextAngle) * radius;
      const y2 = -Math.sin(nextAngle) * radius * 0.9;

      if (a < radials - 1) {
        // Strand segment
        vertices.push(x1, y1, 0, x2, y2, 0, x1, y1, 0.01);
      }
      if (r === rings) {
        // Radial spine to corner
        vertices.push(0, 0, 0, x1, y1, 0, 0, 0, 0.01);
      }
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const mesh = new THREE.Mesh(geo, webMat);
  group.add(mesh);

  return group;
}

export function buildCobweb(
  engine: RenderoniEngine,
  id: string,
  pos: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0]
): EntityInstance {
  const group = createCobwebGroup();
  group.rotation.set(...rotation);

  return engine.add(
    model({
      id,
      object: group,
      position: pos,
      physics: 'none',
      tags: ['decor', 'cobweb'],
    })
  );
}
