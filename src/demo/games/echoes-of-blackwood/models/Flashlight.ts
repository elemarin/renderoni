/**
 * 1st-Person Vintage Lantern Viewmodel & Warm Lighting
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

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    metalness: 0.9,
    roughness: 0.35
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d0d,
    metalness: 0.85,
    roughness: 0.5
  });
  const bezelMat = new THREE.MeshStandardMaterial({
    color: 0x080808,
    metalness: 0.95,
    roughness: 0.28
  });
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.04,
    transmission: 0.9,
    transparent: true,
    opacity: 0.35,
    thickness: 0.01
  });
  const reflectorMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8e8,
    metalness: 1,
    roughness: 0.12
  });
  const buttonMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    metalness: 0.65,
    roughness: 0.55
  });

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.34, 28),
    gripMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.02);

  const tailCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.031, 0.033, 0.05, 24),
    bodyMat
  );
  tailCap.rotation.x = Math.PI / 2;
  tailCap.position.set(0, 0, 0.175);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.037, 0.11, 24),
    bodyMat
  );
  neck.rotation.x = Math.PI / 2;
  neck.position.set(0, 0, -0.205);

  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(0.062, 0.054, 0.09, 32),
    bezelMat
  );
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0, -0.305);

  const bezelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.059, 0.004, 10, 32),
    bodyMat
  );
  bezelRing.position.set(0, 0, -0.35);

  const reflector = new THREE.Mesh(
    new THREE.ConeGeometry(0.05, 0.05, 24, 1, true),
    reflectorMat
  );
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, 0, -0.327);

  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.052, 32),
    lensMat
  );
  lens.position.set(0, 0, -0.35);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.6,
      roughness: 0.2
    })
  );
  bulb.position.set(0, 0, -0.304);

  const switchButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.009, 0.018, 16),
    buttonMat
  );
  switchButton.rotation.z = Math.PI / 2;
  switchButton.position.set(0, 0.037, -0.13);

  group.add(
    barrel,
    tailCap,
    neck,
    head,
    bezelRing,
    reflector,
    lens,
    bulb,
    switchButton
  );

  group.rotation.x = -0.12;
  group.rotation.y = 0.08;
  group.rotation.z = -0.04;
  group.position.set(0.28, -0.22, -0.45);

  const spot = new THREE.SpotLight(
    0xffffff,
    8.5,
    38,
    Math.PI / 8,
    0.32,
    1.1
  );
  spot.position.set(0, 0, -0.305);
  spot.target.position.set(0, 0, -8);
  group.add(spot, spot.target);

  const ambient = new THREE.PointLight(0xffffff, 0.12, 1.6);
  ambient.position.set(0, 0, -0.28);
  group.add(ambient);

  const setVisible = (visible: boolean) => {
    spot.visible = visible;
    ambient.visible = visible;
    bulb.visible = visible;
  };

  return { group, spot, ambient, setVisible };
}