import * as THREE from 'three';

export function createStoneFloor(): THREE.Object3D {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(10, 0.2, 10);
  const mat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);
  return group;
}

export function createKeyPickup(): THREE.Object3D {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.z = Math.PI / 2;
  group.add(mesh);
  return group;
}
