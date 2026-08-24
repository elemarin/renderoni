/**
 * Ancestor Portrait Painting Factory (img2threejs / prompt-to-scene)
 */

import * as THREE from 'three';
import { model, type EntityInstance } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';
import { createPortraitTexture } from '../../../../materials.js';

export function createAncestorPortraitGroup(variant: number = 0): THREE.Group {
  const group = new THREE.Group();

  // Ornate Dark Walnut Frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x22130c, roughness: 0.6, metalness: 0.2 });
  const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.4, metalness: 0.7 });

  const outerFrame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.08), frameMat);
  const innerGoldBevel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.02, 0.09), goldTrimMat);

  // Portrait Canvas
  const canvasTex = createPortraitTexture(variant);
  const canvasMat = new THREE.MeshStandardMaterial({
    map: canvasTex,
    roughness: 0.85,
    metalness: 0.0,
  });
  const portraitCanvas = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.94), canvasMat);
  portraitCanvas.position.z = 0.046;

  group.add(outerFrame, innerGoldBevel, portraitCanvas);
  return group;
}

export function buildAncestorPortrait(
  engine: RenderoniEngine,
  id: string,
  pos: [number, number, number],
  rotationY: number = 0,
  variant: number = 0
): EntityInstance {
  const group = createAncestorPortraitGroup(variant);
  group.rotation.y = rotationY;

  return engine.add(
    model({
      id,
      object: group,
      position: pos,
      physics: 'none',
      tags: ['decor', 'portrait', 'painting'],
    })
  );
}
