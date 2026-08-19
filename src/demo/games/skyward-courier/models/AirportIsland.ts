/**
 * 600m Paved Runway, Airport Island, Tower, Hangars & Archipelago
 */

import * as THREE from 'three';
import type { RenderoniEngine } from '../../../../core/engine.js';
import { mesh } from '../../../../presets/index.js';

export function buildAirportIsland(engine: RenderoniEngine): void {
  const scene = engine.native.scene;

  // 1. Turquoise Ocean Plane
  const oceanMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.8 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.5;
  scene.add(ocean);

  // 2. Main Airport Island Ground
  const islandMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
  engine.add(
    mesh({
      id: 'airport_island_base',
      customGeometry: new THREE.BoxGeometry(280, 4, 750),
      material: islandMat,
      position: [0, -2, -250],
      physics: 'static',
      tags: ['terrain', 'island'],
    })
  );

  // Sandy Beach Rim
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.9 });
  const beach = new THREE.Mesh(new THREE.BoxGeometry(320, 3.8, 790), sandMat);
  beach.position.set(0, -2.1, -250);
  scene.add(beach);

  // 3. 600m Paved Runway 36 / 18
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
  engine.add(
    mesh({
      id: 'runway_36_18',
      customGeometry: new THREE.BoxGeometry(45, 0.15, 600),
      material: asphaltMat,
      position: [0, 0.08, -250],
      physics: 'static',
      tags: ['runway'],
    })
  );

  // Runway Threshold & Centerline Markings
  const paintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

  for (let z = -520; z <= 20; z += 40) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 20), yellowMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.17, z);
    scene.add(dash);
  }

  // Threshold Stripes (North & South)
  [-535, 35].forEach((zPos) => {
    for (let x = -16; x <= 16; x += 4) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2, 24), paintMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.17, zPos);
      scene.add(stripe);
    }
  });

  // 4. Control Tower & Hangars
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1 });
  const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 28, 12), towerMat);
  towerBase.position.set(55, 14, 0);
  const towerCab = new THREE.Mesh(new THREE.CylinderGeometry(7, 5, 6, 12), glassMat);
  towerCab.position.set(55, 31, 0);
  scene.add(towerBase, towerCab);

  // Hangar
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 });
  const hangar = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 50), hangarMat);
  hangar.position.set(70, 8, -80);
  scene.add(hangar);

  // 5. Archipelago Outlying Islands
  const islandCoords: Array<[number, number, number, number]> = [
    [400, -2, -600, 180],
    [-450, -2, -400, 220],
    [550, -2, 100, 200],
    [-380, -2, 350, 160],
  ];

  islandCoords.forEach(([x, y, z, size]) => {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(size, 80, 16), islandMat);
    hill.position.set(x, y + 40, z);
    scene.add(hill);
  });
}
