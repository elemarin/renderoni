/**
 * Stone Key Pedestal (Room 2) — antique pedestal stand variant for the winding key.
 */

import * as THREE from 'three';
import { model } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';
import { createStoneTileTexture } from '../../../../materials.js';

export function buildKeyPedestal(engine: RenderoniEngine): void {
  const woodTex = createStoneTileTexture();
  woodTex.repeat.set(2, 2);

  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: new THREE.Color('#8a5a33'),
    roughness: 0.7,
    metalness: 0.08,
  });

  const darkWoodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: new THREE.Color('#5f3b24'),
    roughness: 0.75,
    metalness: 0.06,
  });

  const keyPedGroup = new THREE.Group();

  // Scalloped serving top
  const trayTop = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.04, 32), woodMat);
  trayTop.position.y = 1.26;
  const trayLip = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 10, 32), darkWoodMat);
  trayLip.rotation.x = Math.PI / 2;
  trayLip.position.y = 1.28;

  // Upper spindle details
  const neckA = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.09, 20), darkWoodMat);
  neckA.position.y = 1.15;
  const neckB = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 20), darkWoodMat);
  neckB.rotation.x = Math.PI / 2;
  neckB.position.y = 1.1;

  // Main turned column
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.9, 18), woodMat);
  shaft.position.y = 0.62;

  // Lower collar + urn transition
  const lowerRing = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.015, 8, 20), darkWoodMat);
  lowerRing.rotation.x = Math.PI / 2;
  lowerRing.position.y = 0.18;
  const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.06, 0.16, 20), woodMat);
  urn.position.y = 0.1;

  // Central hub for tripod feet
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.14, 12), darkWoodMat);
  hub.position.y = -0.02;

  keyPedGroup.add(trayTop, trayLip, neckA, neckB, shaft, lowerRing, urn, hub);

  // Three curved legs arranged 120 degrees apart
  const legGeom = new THREE.BoxGeometry(0.08, 0.34, 0.12);
  for (let i = 0; i < 3; i += 1) {
    const legRoot = new THREE.Group();
    const angle = (i / 3) * Math.PI * 2;
    legRoot.position.set(Math.cos(angle) * 0.06, -0.1, Math.sin(angle) * 0.06);
    legRoot.rotation.y = angle;

    const upper = new THREE.Mesh(legGeom, woodMat);
    upper.position.set(0, -0.08, 0.17);
    upper.rotation.x = -0.45;

    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.11), woodMat);
    lower.position.set(0, -0.28, 0.28);
    lower.rotation.x = 0.55;

    const footCurl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), darkWoodMat);
    footCurl.position.set(0, -0.33, 0.35);
    footCurl.scale.set(1.1, 0.7, 1.0);

    legRoot.add(upper, lower, footCurl);
    keyPedGroup.add(legRoot);
  }

  // Scale down so the tray sits at a comfortable, desk-like height (~0.89)
  // instead of towering above the player's eye line.
  keyPedGroup.scale.setScalar(0.5);

  engine.add(
    model({
      id: 'pedestal_key',
      object: keyPedGroup,
      // Tripod feet bottom out at local y ≈ -0.26 after the 0.5 scale; lifting
      // the group so the feet rest flush on the hallway floor (world y = 0).
      position: [8, 0.26, -6],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [0.5, 0.7, 0.5],
      tags: ['pedestal'],
    })
  );
}