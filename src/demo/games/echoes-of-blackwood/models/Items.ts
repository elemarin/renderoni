/**
 * Interactive Quest Props (Journal, Key, Crest, Escape Gate)
 */

import * as THREE from 'three';
import { mesh, model, type EntityInstance } from '../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../core/engine.js';
import { createWoodTexture } from '../../../materials.js';

export interface QuestItemsResult {
  journalEntity: EntityInstance;
  keyEntity: EntityInstance;
  crestEntity: EntityInstance;
  gateEntity: EntityInstance;
}

export function buildQuestItems(engine: RenderoniEngine): QuestItemsResult {
  const woodTex = createWoodTexture();
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, metalness: 0.1 });

  // 1. Study Desk & Secret Journal (Room 1, [-8, 0, 2])
  engine.add(
    mesh({
      id: 'study_desk',
      customGeometry: new THREE.BoxGeometry(2.4, 0.9, 1.4),
      material: woodMat,
      position: [-8, 0.45, 2],
      physics: 'static',
      tags: ['furniture', 'desk'],
    })
  );

  const journalEntity = engine.add(
    mesh({
      id: 'prop_journal',
      geometry: 'box',
      size: [0.45, 0.08, 0.35],
      position: [-8, 0.94, 2],
      color: 0xf59e0b,
      physics: 'none',
      tags: ['interactive', 'clue', 'journal'],
      state: { clueText: 'Entry #44: The Grandfather clock hides the Blackwood Crest. Turn the hands to 11:45!' },
    })
  );

  // Desk Lamp Glow
  const deskLamp = new THREE.PointLight(0xf59e0b, 2.2, 8, 1.5);
  deskLamp.position.set(-8, 1.5, 2);
  engine.native.scene.add(deskLamp);

  engine.add(
    mesh({
      id: 'study_bookshelf',
      customGeometry: new THREE.BoxGeometry(0.6, 3.8, 2.8),
      material: woodMat,
      position: [-11.2, 1.9, 2],
      physics: 'static',
      tags: ['furniture', 'bookshelf'],
    })
  );

  // 2. Key Pedestal & Spinning Gold Key (Room 2, [8, 0, -6])
  engine.add(
    mesh({
      id: 'pedestal_key',
      geometry: 'cylinder',
      size: [0.4, 0.4, 1.0],
      position: [8, 0.5, -6],
      color: 0x475569,
      physics: 'static',
      tags: ['pedestal'],
    })
  );

  const keyGroup = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 16), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 }));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 }));
  shaft.position.y = -0.18;
  keyGroup.add(ring, shaft);

  const keyEntity = engine.add(
    model({
      id: 'prop_key',
      object: keyGroup,
      position: [8, 1.3, -6],
      physics: 'none',
      tags: ['interactive', 'item', 'key'],
      state: { collected: false },
    })
  );

  // 3. Blackwood Crest on Pedestal (Room 4, [8, 0, -22])
  engine.add(
    mesh({
      id: 'pedestal_crest',
      geometry: 'box',
      size: [0.8, 1.0, 0.8],
      position: [8, 0.5, -22],
      color: 0x334155,
      physics: 'static',
      tags: ['pedestal'],
    })
  );

  const crestGroup = new THREE.Group();
  const shield = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.65, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.3 })
  );
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12),
    new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.2, roughness: 0.1 })
  );
  gem.position.z = 0.08;
  crestGroup.add(shield, gem);

  const crestEntity = engine.add(
    model({
      id: 'prop_crest',
      object: crestGroup,
      position: [8, 1.35, -22],
      physics: 'none',
      tags: ['interactive', 'item', 'crest'],
      state: { acquired: false },
    })
  );

  // Crest Pedestal Glow
  const crestGlow = new THREE.PointLight(0xf59e0b, 2.4, 8, 1.5);
  crestGlow.position.set(8, 1.8, -22);
  engine.native.scene.add(crestGlow);

  // 4. Escape Iron Gate (Z = -29)
  engine.add(mesh({ geometry: 'box', size: [0.4, 4.4, 0.4], position: [-1.8, 2.2, -29], color: 0x1e293b, physics: 'static', tags: ['gate'] }));
  engine.add(mesh({ geometry: 'box', size: [0.4, 4.4, 0.4], position: [1.8, 2.2, -29], color: 0x1e293b, physics: 'static', tags: ['gate'] }));
  engine.add(mesh({ geometry: 'box', size: [4.0, 0.4, 0.4], position: [0, 4.2, -29], color: 0x1e293b, physics: 'static', tags: ['gate'] }));

  const gateGroup = new THREE.Group();
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.3 });
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.8, 0.1), ironMat);
  doorL.position.x = -0.8;
  gateGroup.add(doorL);

  const gateEntity = engine.add(
    model({
      id: 'prop_escape_gate',
      object: gateGroup,
      position: [0, 1.9, -29],
      physics: 'static',
      colliderShape: 'box',
      colliderSize: [3.2, 3.8, 0.2],
      tags: ['interactive', 'gate', 'exit'],
      state: { unlocked: false },
    })
  );

  return { journalEntity, keyEntity, crestEntity, gateEntity };
}
