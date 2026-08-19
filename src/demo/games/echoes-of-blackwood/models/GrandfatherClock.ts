/**
 * Grandfather Clock & Secret Bookcase Model Generator
 */

import * as THREE from 'three';
import { mesh, model, type EntityInstance } from '../../../../presets/index.js';
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

  // Clock Case Body
  engine.add(
    mesh({
      id: 'grandfather_clock_case',
      customGeometry: new THREE.BoxGeometry(1.2, 3.6, 0.8),
      material: woodMat,
      position: [x, y + 1.8, z],
      physics: 'static',
      tags: ['clock', 'puzzle'],
    })
  );

  // Clock Face Dial
  const faceGroup = new THREE.Group();
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), new THREE.MeshStandardMaterial({ color: 0xfef9c3, roughness: 0.4 }));
  faceGroup.add(dial);

  // Hour and Minute Hands (Starts at 3:00 so player winds it to 11:45)
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
  hourHand.position.set(0, 0.09, 0.02);
  hourHand.rotation.z = -(3 / 12) * Math.PI * 2;

  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.32, 0.02), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
  minuteHand.position.set(0, 0.14, 0.03);
  minuteHand.rotation.z = 0;

  faceGroup.add(hourHand, minuteHand);

  engine.add(
    model({
      id: 'prop_clock_face',
      object: faceGroup,
      position: [x, y + 2.8, z + 0.41],
      physics: 'none',
      tags: ['interactive', 'puzzle', 'clock_face'],
      state: { solved: false },
    })
  );

  // Soft warm illumination on the clock face
  const clockLight = new THREE.PointLight(0xfef08a, 1.2, 6, 1.5);
  clockLight.position.set(x, y + 2.8, z + 0.8);
  engine.native.scene.add(clockLight);

  // Secret Hidden Bookcase Door
  const bookcaseObj = new THREE.Group();
  const bcMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 0.5), woodMat);
  bookcaseObj.add(bcMesh);

  const secretBookcase = engine.add(
    model({
      id: 'prop_secret_bookcase',
      object: bookcaseObj,
      position: [x + 2.8, y + 1.7, z],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [1.4, 3.4, 0.5],
      tags: ['door', 'secret_passage'],
      state: { open: false },
    })
  );

  return { hourHand, minuteHand, secretBookcase };
}
