/**
 * Open Leather Journal & Candlestick (quest clue item, Room 1)
 */

import * as THREE from 'three';
import { model, type EntityInstance } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';

export function buildJournal(engine: RenderoniEngine): EntityInstance {
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.25 });

  const journalGroup = new THREE.Group();
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.02, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 })
  );
  cover.position.y = 0.01;

  const pageMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5 });
  const leftPage = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.025, 0.33), pageMat);
  leftPage.position.set(-0.115, 0.022, 0);
  leftPage.rotation.z = 0.06;

  const rightPage = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.025, 0.33), pageMat);
  rightPage.position.set(0.115, 0.022, 0);
  rightPage.rotation.z = -0.06;

  const ribbon = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.008, 0.38),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 })
  );
  ribbon.position.set(0, 0.036, 0);

  // Candlestick
  const cBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 12), brassMat);
  cBase.position.set(0.65, 0.015, -0.2);
  const candle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.18, 10),
    new THREE.MeshStandardMaterial({ color: 0xfef9c3, roughness: 0.6 })
  );
  candle.position.set(0.65, 0.11, -0.2);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 8), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
  flame.position.set(0.65, 0.22, -0.2);

  journalGroup.add(cover, leftPage, rightPage, ribbon, cBase, candle, flame);

  return engine.add(
    model({
      id: 'prop_journal',
      object: journalGroup,
      position: [-8, 0.9, 2],
      physics: 'none',
      tags: ['interactive', 'clue', 'journal'],
      state: { clueText: 'Entry #44: The ornate wall clock hides the Blackwood Crest. Turn the hands to 11:45!' },
    })
  );
}
