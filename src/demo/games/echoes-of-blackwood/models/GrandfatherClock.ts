/**
 * Grandfather Clock & Secret Bookcase Model Generator
 */

import * as THREE from 'three';
import { model, type EntityInstance } from '../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../core/engine.js';
import { createWoodTexture } from '../../../materials.js';
import { createVictorianWallClockModel } from './VictorianWallClock.js';

export interface ClockModelResult {
  hourHand: THREE.Group;
  minuteHand: THREE.Group;
  secretBookcase: EntityInstance;
}

export function buildGrandfatherClockModel(engine: RenderoniEngine, x: number, y: number, z: number): ClockModelResult {
  const woodTex = createWoodTexture();
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, metalness: 0.1 });
  const { root: clockGroup, hourHand, minuteHand } = createVictorianWallClockModel();

  engine.add(
    model({
      id: 'grandfather_clock',
      object: clockGroup,
      position: [x, y + 2.6, z],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [1.65, 2.45, 0.35],
      tags: ['interactive', 'clock', 'puzzle'],
      state: { solved: false },
    })
  );

  // Soft warm spotlight on the clock face
  const clockLight = new THREE.PointLight(0xfef08a, 1.8, 7, 1.4);
  clockLight.position.set(x, y + 2.6, z + 1.2);
  engine.native.scene.add(clockLight);

  // 2. Secret Hidden Bookcase Door
  const bookcaseGroup = new THREE.Group();
  const bcFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.6, 0.5), woodMat);
  bookcaseGroup.add(bcFrame);

  // Bookshelf shelves with books
  const bookColors = [0x991b1b, 0x166534, 0x1e3a8a, 0x854d0e, 0x581c87];
  for (let row = 0; row < 4; row++) {
    const yOff = -1.2 + row * 0.8;
    for (let b = 0; b < 7; b++) {
      const bColor = bookColors[(row * 5 + b) % bookColors.length];
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.62, 0.38),
        new THREE.MeshStandardMaterial({ color: bColor, roughness: 0.7 })
      );
      book.position.set(-0.55 + b * 0.185, yOff, 0.08);
      bookcaseGroup.add(book);
    }
  }

  const secretBookcase = engine.add(
    model({
      id: 'prop_secret_bookcase',
      object: bookcaseGroup,
      position: [x + 2.8, y + 1.8, z],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [1.6, 3.6, 0.5],
      tags: ['door', 'secret_passage'],
      state: { open: false },
    })
  );

  return { hourHand, minuteHand, secretBookcase };
}
