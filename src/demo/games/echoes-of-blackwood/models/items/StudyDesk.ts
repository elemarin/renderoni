/**
 * Study Desk & Bookshelf (Room 1)
 */

import * as THREE from 'three';
import { model } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';
import { createWoodTexture } from '../../../../materials.js';

/** Builds the desk, drawer knobs, and bookshelf. Placement is fixed to Room 1
 * ([-8, 0, 2]) to match the manor layout; call once per level. */
export function buildStudyDesk(engine: RenderoniEngine): void {
  const woodTex = createWoodTexture();
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, metalness: 0.1 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.25 });

  const deskGroup = new THREE.Group();
  const desktop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.3), woodMat);
  desktop.position.y = 0.86;
  const leftPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.82, 1.2), woodMat);
  leftPedestal.position.set(-0.75, 0.41, 0);
  const rightPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.82, 1.2), woodMat);
  rightPedestal.position.set(0.75, 0.41, 0);
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.04), woodMat);
  backPanel.position.set(0, 0.57, -0.52);

  for (const xOff of [-0.75, 0.75]) {
    for (const yOff of [0.22, 0.45, 0.68]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), brassMat);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(xOff, yOff, 0.62);
      deskGroup.add(knob);
    }
  }
  deskGroup.add(desktop, leftPedestal, rightPedestal, backPanel);

  engine.add(
    model({
      id: 'study_desk',
      object: deskGroup,
      position: [-8, 0, 2],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [2.4, 0.9, 1.3],
      tags: ['furniture', 'desk'],
    })
  );

  // Desk warm candle glow (from the journal candlestick)
  const deskLamp = new THREE.PointLight(0xf59e0b, 2.4, 8, 1.4);
  deskLamp.position.set(-7.35, 1.35, 1.8);
  engine.native.scene.add(deskLamp);

  // Bookshelf with books
  const bookshelfGroup = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.8, 2.8), woodMat);
  bookshelfGroup.add(frame);

  const bookColors = [0x991b1b, 0x166534, 0x1e3a8a, 0x854d0e, 0x581c87];
  for (let row = 0; row < 4; row++) {
    const y = -1.2 + row * 0.85;
    for (let b = 0; b < 12; b++) {
      const bColor = bookColors[(row * 7 + b) % bookColors.length];
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.65, 0.18),
        new THREE.MeshStandardMaterial({ color: bColor, roughness: 0.7 })
      );
      book.position.set(0.12, y, -1.0 + b * 0.185);
      bookshelfGroup.add(book);
    }
  }

  engine.add(
    model({
      id: 'study_bookshelf',
      object: bookshelfGroup,
      position: [-11.2, 1.9, 2],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [0.6, 3.8, 2.8],
      tags: ['furniture', 'bookshelf'],
    })
  );
}
