/**
 * Blackwood Crest — the heraldic shield pickup (Room 4).
 */

import * as THREE from 'three';
import { model, type EntityInstance } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';

export function buildBlackwoodCrest(engine: RenderoniEngine): EntityInstance {
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.3 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.25 });

  const crestGroup = new THREE.Group();
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.08), goldMat);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.1), brassMat);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.1), brassMat);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14),
    new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.1, roughness: 0.05 })
  );
  gem.position.z = 0.1;
  crestGroup.add(shield, crossH, crossV, gem);

  const crestEntity = engine.add(
    model({
      id: 'prop_crest',
      object: crestGroup,
      position: [8, 1.45, -22],
      physics: 'none',
      tags: ['interactive', 'item', 'crest'],
      state: { acquired: false },
    })
  );

  const crestGlow = new THREE.PointLight(0xf59e0b, 2.5, 8, 1.4);
  crestGlow.position.set(8, 1.9, -22);
  engine.native.scene.add(crestGlow);

  return crestEntity;
}
