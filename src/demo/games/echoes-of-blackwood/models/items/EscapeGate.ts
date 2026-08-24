/**
 * Iron Portcullis Escape Gate + stone pillars/lintel (end of hallway).
 */

import * as THREE from 'three';
import { mesh, model, type EntityInstance } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';
import { createStoneTileTexture } from '../../../../materials.js';

export function buildEscapeGate(engine: RenderoniEngine): EntityInstance {
  const stoneTex = createStoneTileTexture();
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.8, metalness: 0.2 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.35 });

  // Stone pillars + lintel
  engine.add(
    mesh({
      id: 'gate_pillar_left',
      customGeometry: new THREE.BoxGeometry(0.6, 4.4, 0.6),
      material: stoneMat,
      position: [-1.9, 2.2, -29],
      physics: 'static',
      tags: ['gate', 'pillar'],
    })
  );
  engine.add(
    mesh({
      id: 'gate_pillar_right',
      customGeometry: new THREE.BoxGeometry(0.6, 4.4, 0.6),
      material: stoneMat,
      position: [1.9, 2.2, -29],
      physics: 'static',
      tags: ['gate', 'pillar'],
    })
  );
  engine.add(
    mesh({
      id: 'gate_lintel',
      customGeometry: new THREE.BoxGeometry(4.4, 0.6, 0.6),
      material: stoneMat,
      position: [0, 4.4, -29],
      physics: 'static',
      tags: ['gate', 'lintel'],
    })
  );

  // Wrought iron portcullis gate
  const gateGroup = new THREE.Group();
  for (const y of [0.4, 1.8, 3.2]) {
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.06), ironMat);
    hBar.position.y = y;
    gateGroup.add(hBar);
  }
  for (let i = 0; i < 9; i++) {
    const x = -1.4 + i * 0.35;
    const vBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.6, 8), ironMat);
    vBar.position.set(x, 1.8, 0);
    const spear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 8), ironMat);
    spear.position.set(x, 3.69, 0);
    gateGroup.add(vBar, spear);
  }

  return engine.add(
    model({
      id: 'prop_escape_gate',
      object: gateGroup,
      position: [0, 0, -29],
      physics: 'none',
      tags: ['interactive', 'gate', 'exit'],
      state: { unlocked: false },
    })
  );
}
