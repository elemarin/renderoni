/**
 * Stone Crest Altar (Room 4) — the plinth the Blackwood Crest rests on.
 */

import * as THREE from 'three';
import { model } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';
import { createStoneTileTexture } from '../../../../materials.js';

export function buildCrestAltar(engine: RenderoniEngine): void {
  const stoneTex = createStoneTileTexture();
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.8, metalness: 0.2 });

  const altarGroup = new THREE.Group();
  const altBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), stoneMat);
  const altPillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), stoneMat);
  altPillar.position.y = 0.45;
  const altTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 1.1), stoneMat);
  altTop.position.y = 0.85;
  altarGroup.add(altBase, altPillar, altTop);

  engine.add(
    model({
      id: 'pedestal_crest',
      object: altarGroup,
      position: [8, 0.1, -22],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [1.2, 1.0, 1.2],
      tags: ['pedestal', 'altar'],
    })
  );
}
