/**
 * Victorian Paneled Door Model Factory (img2threejs / prompt-to-scene)
 * Supports Hinged Rotation, Lock States, and Interaction
 */

import * as THREE from 'three';
import { model, type EntityInstance } from '../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../core/engine.js';
import { createWoodTexture } from '../../../materials.js';
import { horrorSfx } from '../audio.js';

export interface ManorDoorInstance {
  id: string;
  entity: EntityInstance;
  hinge: THREE.Group;
  doorLeaf: THREE.Group;
  open: boolean;
  locked: boolean;
  targetAngle: number;
  currentAngle: number;
  openAngle: number;
  toggle: () => boolean;
  unlock: () => void;
  update: (dt: number) => void;
}

export function createManorDoorModel(options: {
  width?: number;
  height?: number;
  openAngle?: number;
  initOpen?: boolean;
  locked?: boolean;
}): {
  root: THREE.Group;
  hinge: THREE.Group;
  doorLeaf: THREE.Group;
} {
  const width = options.width ?? 2.0;
  const height = options.height ?? 3.5;
  const woodTex = createWoodTexture({ base: '#2b1810', dark: '#140a06' });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, metalness: 0.1 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.25 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x180d08, roughness: 0.85 });

  const root = new THREE.Group();

  // 1. Outer Door Frame Molding
  const frameThickness = 0.14;
  const frameDepth = 0.35;
  const postL = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, height, frameDepth), woodMat);
  postL.position.set(-width / 2, height / 2, 0);

  const postR = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, height, frameDepth), woodMat);
  postR.position.set(width / 2, height / 2, 0);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + frameThickness * 2, frameThickness * 1.5, frameDepth + 0.04), woodMat);
  lintel.position.set(0, height + (frameThickness * 1.5) / 2, 0);

  root.add(postL, postR, lintel);

  // 2. Hinge Pivot Group (Positioned at inside edge of left post)
  const hinge = new THREE.Group();
  hinge.position.set(-width / 2 + frameThickness / 2, 0, 0);

  // 3. Door Leaf Group (Pivoting from hinge)
  const doorLeaf = new THREE.Group();
  const leafWidth = width - frameThickness;
  const leafHeight = height - 0.05;
  const leafThickness = 0.09;

  // Position door slab relative to hinge
  const slab = new THREE.Mesh(new THREE.BoxGeometry(leafWidth, leafHeight, leafThickness), woodMat);
  slab.position.set(leafWidth / 2, leafHeight / 2, 0);

  // 4 Victorian Recessed Panels
  for (const xRatio of [0.28, 0.72]) {
    const px = xRatio * leafWidth;
    // Top tall panel
    const topP = new THREE.Mesh(new THREE.BoxGeometry(leafWidth * 0.36, leafHeight * 0.42, leafThickness + 0.015), panelMat);
    topP.position.set(px, leafHeight * 0.72, 0);

    // Bottom square panel
    const botP = new THREE.Mesh(new THREE.BoxGeometry(leafWidth * 0.36, leafHeight * 0.28, leafThickness + 0.015), panelMat);
    botP.position.set(px, leafHeight * 0.25, 0);

    doorLeaf.add(topP, botP);
  }

  // Brass Doorknobs (Both sides of door)
  for (const zSide of [leafThickness / 2 + 0.03, -leafThickness / 2 - 0.03]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), brassMat);
    knob.position.set(leafWidth - 0.16, leafHeight * 0.45, zSide);
    const escutcheon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.01), brassMat);
    escutcheon.position.set(leafWidth - 0.16, leafHeight * 0.45, zSide * 0.85);
    doorLeaf.add(knob, escutcheon);
  }

  doorLeaf.add(slab);
  hinge.add(doorLeaf);
  root.add(hinge);

  return { root, hinge, doorLeaf };
}

export function buildInteractiveManorDoor(
  engine: RenderoniEngine,
  options: {
    id: string;
    position: [number, number, number];
    rotationY?: number;
    openAngle?: number;
    locked?: boolean;
    lockPrompt?: string;
  }
): ManorDoorInstance {
  const openAngle = options.openAngle ?? -Math.PI / 2;
  const { root, hinge, doorLeaf } = createManorDoorModel({
    width: 2.0,
    height: 3.5,
    openAngle,
  });

  root.rotation.y = options.rotationY ?? 0;

  const entity = engine.add(
    model({
      id: options.id,
      object: root,
      position: options.position,
      physics: 'none',
      tags: ['interactive', 'door', 'manor_door'],
      state: { open: false, locked: !!options.locked },
    })
  );

  const instance: ManorDoorInstance = {
    id: options.id,
    entity,
    hinge,
    doorLeaf,
    open: false,
    locked: !!options.locked,
    targetAngle: 0,
    currentAngle: 0,
    openAngle,

    toggle(): boolean {
      if (this.locked) {
        horrorSfx.playFlashlightClick();
        return false;
      }
      this.open = !this.open;
      this.targetAngle = this.open ? this.openAngle : 0;
      this.entity.state.open = this.open;
      horrorSfx.playDoorCreak();
      return true;
    },

    unlock(): void {
      this.locked = false;
      this.entity.state.locked = false;
    },

    update(dt: number): void {
      if (Math.abs(this.currentAngle - this.targetAngle) > 0.005) {
        this.currentAngle += (this.targetAngle - this.currentAngle) * Math.min(1.0, dt * 8.0);
        this.hinge.rotation.y = this.currentAngle;
      }
    },
  };

  return instance;
}
