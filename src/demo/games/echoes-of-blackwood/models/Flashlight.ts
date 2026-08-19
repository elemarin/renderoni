/**
 * 1st-Person Flashlight Viewmodel & Volumetric Lighting
 */

import * as THREE from 'three';

export interface FlashlightRig {
  group: THREE.Group;
  spot: THREE.SpotLight;
  ambient: THREE.PointLight;
  setVisible: (visible: boolean) => void;
}

export function buildFlashlightRig(): FlashlightRig {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 12), bodyMat);
  barrel.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.08, 12), bodyMat);
  head.position.set(0, 0, -0.15);
  head.rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), lensMat);
  lens.position.set(0, 0, -0.191);

  group.add(barrel, head, lens);
  group.position.set(0.3, -0.22, -0.45);

  // Focused Volumetric Spot Light (Bright & atmospheric)
  const spot = new THREE.SpotLight(0xfffbeb, 8.5, 36, Math.PI / 5.5, 0.35, 1.0);
  spot.position.set(0, 0, -0.2);
  spot.target.position.set(0, 0, -8);
  group.add(spot, spot.target);

  // Ambient Hand Bounce
  const ambient = new THREE.PointLight(0xfef08a, 0.6, 6);
  ambient.position.set(0, 0, -0.2);
  group.add(ambient);

  const setVisible = (visible: boolean) => {
    spot.visible = visible;
    ambient.visible = visible;
  };

  return { group, spot, ambient, setVisible };
}
