/**
 * Grandfather Clock & Secret Bookcase Model Generator
 */

import * as THREE from 'three';
import { model, type EntityInstance } from '../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../core/engine.js';
import { createWoodTexture } from '../../../materials.js';

export interface ClockModelResult {
  hourHand: THREE.Mesh;
  minuteHand: THREE.Mesh;
  secretBookcase: EntityInstance;
}

export function buildGrandfatherClockModel(engine: RenderoniEngine, x: number, y: number, z: number): ClockModelResult {
  const woodTex = createWoodTexture();
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, metalness: 0.1 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.25 });

  // 1. Ornate Grandfather Clock Group
  const clockGroup = new THREE.Group();

  // Base plinth
  const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.9), woodMat);
  basePlinth.position.y = 0.2;
  // Mid body trunk
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.0, 0.75), woodMat);
  trunk.position.y = 1.4;
  // Glass pendulum window insert
  const glassBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 1.4, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
  );
  glassBack.position.set(0, 1.4, 0.38);

  // Brass pendulum bob inside
  const pendulumRod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 8), brassMat);
  pendulumRod.position.set(0, 1.5, 0.35);
  const pendulumBob = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 16), brassMat);
  pendulumBob.rotation.x = Math.PI / 2;
  pendulumBob.position.set(0, 0.95, 0.35);

  // Top hood / dial housing
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.2, 0.85), woodMat);
  hood.position.y = 3.0;
  // Carved crown arch on top
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.85, 16, 1, false, 0, Math.PI), woodMat);
  crown.rotation.z = Math.PI / 2;
  crown.rotation.y = Math.PI / 2;
  crown.position.set(0, 3.6, 0);

  // Brass Dial Ring
  const dialRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 24), brassMat);
  dialRing.position.set(0, 2.95, 0.44);

  // Clock Dial Face
  const dial = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 24),
    new THREE.MeshStandardMaterial({ color: 0xfef9c3, roughness: 0.4 })
  );
  dial.position.set(0, 2.95, 0.435);

  // Hour and Minute Hands (Starts at 3:00, turns to 11:45)
  const handMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), handMat);
  hourHand.position.set(0, 2.95 + 0.09, 0.45);
  hourHand.rotation.z = -(3 / 12) * Math.PI * 2;

  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.32, 0.02), handMat);
  minuteHand.position.set(0, 2.95 + 0.14, 0.46);
  minuteHand.rotation.z = 0;

  clockGroup.add(
    basePlinth,
    trunk,
    glassBack,
    pendulumRod,
    pendulumBob,
    hood,
    crown,
    dialRing,
    dial,
    hourHand,
    minuteHand
  );

  engine.add(
    model({
      id: 'grandfather_clock',
      object: clockGroup,
      position: [x, y, z],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [1.3, 3.8, 0.9],
      tags: ['interactive', 'clock', 'puzzle'],
      state: { solved: false },
    })
  );

  // Soft warm spotlight on the clock face
  const clockLight = new THREE.PointLight(0xfef08a, 1.8, 7, 1.4);
  clockLight.position.set(x, y + 2.95, z + 1.2);
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
