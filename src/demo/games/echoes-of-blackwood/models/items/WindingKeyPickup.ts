/**
 * Places the spinning Victorian winding key pickup on its pedestal (Room 2),
 * with a warm point light. The key's visual shape lives in
 * `createVictorianWindingKeyModel()` (VictorianWindingKey.ts).
 */

import * as THREE from 'three';
import { model, type EntityInstance } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';
import { createVictorianWindingKeyModel } from './VictorianWindingKey.js';

export function buildWindingKeyPickup(engine: RenderoniEngine): EntityInstance {
  const keyGroup = createVictorianWindingKeyModel();
  // Unscaled key spans ~1.83 world units in x; tray is only ~0.47 across
  // (pedestal scaled to 0.5), so scale the key down to comfortably fit on it.
  keyGroup.scale.setScalar(0.18);
  // Lay the key flat on its side (like it's resting on the tray) instead of
  // standing on edge and spinning through the pedestal.
  keyGroup.rotation.x = Math.PI / 2;

  const keyEntity = engine.add(
    model({
      id: 'prop_key',
      object: keyGroup,
      // Tray top surface sits at world y ≈ 0.90 (pedestal scaled to desk
      // height); rest the key just above it so it renders on top of the wood
      // instead of embedded inside it.
      position: [8, 0.94, -6],
      physics: 'none',
      tags: ['interactive', 'item', 'key'],
      state: { collected: false },
    })
  );

  const keyLight = new THREE.PointLight(0xfacc15, 2.0, 6, 1.5);
  keyLight.position.set(8, 1.1, -6);
  engine.native.scene.add(keyLight);

  return keyEntity;
}
