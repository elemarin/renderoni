/**
 * Interactive Quest Props (Study Desk, Open Journal, Clock Key, Crest, Escape Gate)
 */

import * as THREE from 'three';
import { mesh, model, type EntityInstance } from '../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../core/engine.js';
import { createWoodTexture, createStoneTileTexture } from '../../../materials.js';
import { createVictorianWindingKeyModel } from './VictorianWindingKey.js';

export interface QuestItemsResult {
  journalEntity: EntityInstance;
  keyEntity: EntityInstance;
  crestEntity: EntityInstance;
  gateEntity: EntityInstance;
}

export function buildQuestItems(engine: RenderoniEngine): QuestItemsResult {
  const woodTex = createWoodTexture();
  const stoneTex = createStoneTileTexture();
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, metalness: 0.1 });
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.8, metalness: 0.2 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.25 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.3 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.35 });

  // 1. Study Desk & Secret Journal (Room 1, [-8, 0, 2])
  const deskGroup = new THREE.Group();
  // Desktop surface
  const desktop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.3), woodMat);
  desktop.position.y = 0.86;
  // Left drawer pedestal
  const leftPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.82, 1.2), woodMat);
  leftPedestal.position.set(-0.75, 0.41, 0);
  // Right drawer pedestal
  const rightPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.82, 1.2), woodMat);
  rightPedestal.position.set(0.75, 0.41, 0);
  // Back modesty panel
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.04), woodMat);
  backPanel.position.set(0, 0.57, -0.52);

  // Brass drawer handles
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

  // Open Leather Journal & Candlestick
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

  const journalEntity = engine.add(
    model({
      id: 'prop_journal',
      object: journalGroup,
      position: [-8, 0.9, 2],
      physics: 'none',
      tags: ['interactive', 'clue', 'journal'],
      state: { clueText: 'Entry #44: The ornate wall clock hides the Blackwood Crest. Turn the hands to 11:45!' },
    })
  );

  // Desk Warm Candle Glow
  const deskLamp = new THREE.PointLight(0xf59e0b, 2.4, 8, 1.4);
  deskLamp.position.set(-7.35, 1.35, 1.8);
  engine.native.scene.add(deskLamp);

  // Bookshelf with books
  const bookshelfGroup = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.8, 2.8), woodMat);
  bookshelfGroup.add(frame);

  // Book rows
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

  // 2. Key Pedestal & Spinning Gold Key (Room 2, [8, 0, -6])
  const keyPedGroup = new THREE.Group();
  const kpBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.9), stoneMat);
  const kpCol = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.8, 16), stoneMat);
  kpCol.position.y = 0.48;
  const kpTop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.8), stoneMat);
  kpTop.position.y = 0.93;
  keyPedGroup.add(kpBase, kpCol, kpTop);

  engine.add(
    model({
      id: 'pedestal_key',
      object: keyPedGroup,
      position: [8, 0.08, -6],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [0.9, 1.0, 0.9],
      tags: ['pedestal'],
    })
  );

  const keyGroup = createVictorianWindingKeyModel();
  keyGroup.scale.setScalar(0.65);

  const keyEntity = engine.add(
    model({
      id: 'prop_key',
      object: keyGroup,
      position: [8, 1.35, -6],
      physics: 'none',
      tags: ['interactive', 'item', 'key'],
      state: { collected: false },
    })
  );

  const keyLight = new THREE.PointLight(0xfacc15, 2.0, 6, 1.5);
  keyLight.position.set(8, 1.8, -6);
  engine.native.scene.add(keyLight);

  // 3. Blackwood Crest on Stone Altar (Room 4, [8, 0, -22])
  const altarGroup = new THREE.Group();
  const altBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), stoneMat);
  const altPillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), stoneMat);
  altPillar.position.y = 0.45;
  const altTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 1.1), stoneMat);
  altTop.position.y = 0.85;
  altarGroup.add(altBase, altPillar, altTop);

  engine.add(
    model({
      id: 'pedestal_crest',
      object: altarGroup,
      position: [8, 0.1, -22],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [1.2, 1.0, 1.2],
      tags: ['pedestal', 'altar'],
    })
  );

  // Crest Heraldic Shield
  const crestGroup = new THREE.Group();
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.08), goldMat);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.1), brassMat);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.1), brassMat);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14),
    new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.1, roughness: 0.05 })
  );
  gem.position.z = 0.1;
  crestGroup.add(shield, crossH, crossV, gem);

  const crestEntity = engine.add(
    model({
      id: 'prop_crest',
      object: crestGroup,
      position: [8, 1.45, -22],
      physics: 'none',
      tags: ['interactive', 'item', 'crest'],
      state: { acquired: false },
    })
  );

  const crestGlow = new THREE.PointLight(0xf59e0b, 2.5, 8, 1.4);
  crestGlow.position.set(8, 1.9, -22);
  engine.native.scene.add(crestGlow);

  // 4. Escape Iron Gate (Z = -29)
  // Stone pillars
  engine.add(
    mesh({
      customGeometry: new THREE.BoxGeometry(0.6, 4.4, 0.6),
      material: stoneMat,
      position: [-1.9, 2.2, -29],
      physics: 'static',
      tags: ['gate', 'pillar'],
    })
  );
  engine.add(
    mesh({
      customGeometry: new THREE.BoxGeometry(0.6, 4.4, 0.6),
      material: stoneMat,
      position: [1.9, 2.2, -29],
      physics: 'static',
      tags: ['gate', 'pillar'],
    })
  );
  engine.add(
    mesh({
      customGeometry: new THREE.BoxGeometry(4.4, 0.6, 0.6),
      material: stoneMat,
      position: [0, 4.4, -29],
      physics: 'static',
      tags: ['gate', 'lintel'],
    })
  );

  // Wrought Iron Portcullis Gate
  const gateGroup = new THREE.Group();
  // Horizontal bars
  for (const y of [0.4, 1.8, 3.2]) {
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.06), ironMat);
    hBar.position.y = y;
    gateGroup.add(hBar);
  }
  // Vertical iron bars with spear tips
  for (let i = 0; i < 9; i++) {
    const x = -1.4 + i * 0.35;
    const vBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.6, 8), ironMat);
    vBar.position.set(x, 1.8, 0);
    const spear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 8), ironMat);
    spear.position.set(x, 3.69, 0);
    gateGroup.add(vBar, spear);
  }

  const gateEntity = engine.add(
    model({
      id: 'prop_escape_gate',
      object: gateGroup,
      position: [0, 0, -29],
      physics: 'none',
      tags: ['interactive', 'gate', 'exit'],
      state: { unlocked: false },
    })
  );

  return { journalEntity, keyEntity, crestEntity, gateEntity };
}
