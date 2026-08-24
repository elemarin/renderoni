/**
 * Cast Iron Gas/Torch Wall Sconce (bracket + flame + flickering point light)
 */

import * as THREE from 'three';
import { mesh } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';

export function buildWallSconce(engine: RenderoniEngine, id: string, pos: [number, number, number]): void {
  // Cast iron ornate wall mount bracket
  engine.add(
    mesh({
      id: `${id}_bracket`,
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
      id: `${id}_flame`,
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
}
