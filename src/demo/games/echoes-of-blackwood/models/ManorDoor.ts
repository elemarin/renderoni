/**
 * Victorian Paneled Door Model Factory (img2threejs / prompt-to-scene)
 */

import * as THREE from 'three';
import { model, type EntityInstance } from '../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../core/engine.js';
import { createWoodTexture } from '../../../materials.js';

export function createManorDoorGroup(): THREE.Group {
  const group = new THREE.Group();
  const woodTex = createWoodTexture({ base: '#2b1810', dark: '#140a06' });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, metalness: 0.1 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.25 });

  // Outer Door Frame Molding
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.2), woodMat);
  frameL.position.set(-0.9, 1.7, 0);
  const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.2), woodMat);
  frameR.position.set(0.9, 1.7, 0);
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.16, 0.22), woodMat);
  frameTop.position.set(0, 3.48, 0);

  // Door Slab
  const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(1.68, 3.32, 0.08), woodMat);
  doorSlab.position.set(0, 1.66, 0);

  // Recessed Panels (4 Victorian panels)
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a0f0a, roughness: 0.85 });
  for (const xOff of [-0.4, 0.4]) {
    // Upper panel
    const topPanel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.09), panelMat);
    topPanel.position.set(xOff, 2.35, 0);
    // Lower panel
    const botPanel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.09), panelMat);
    botPanel.position.set(xOff, 0.85, 0);
    group.add(topPanel, botPanel);
  }

  // Brass Doorknob & Keyhole Escutcheon
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), brassMat);
  knob.position.set(0.68, 1.5, 0.06);
  const knobBack = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 8), brassMat);
  knobBack.position.set(0.68, 1.5, 0.05);

  group.add(frameL, frameR, frameTop, doorSlab, knob, knobBack);
  return group;
}

export function buildManorDoor(
  engine: RenderoniEngine,
  id: string,
  pos: [number, number, number],
  rotationY: number = 0
): EntityInstance {
  const group = createManorDoorGroup();
  group.rotation.y = rotationY;

  return engine.add(
    model({
      id,
      object: group,
      position: pos,
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [1.9, 3.5, 0.25],
      tags: ['scenery', 'door'],
    })
  );
}
