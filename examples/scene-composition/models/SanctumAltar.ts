import * as THREE from 'three';

export function createSanctumAltar(): THREE.Object3D {
  const group = new THREE.Group();
  const baseGeo = new THREE.BoxGeometry(2, 1, 2);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  group.add(baseMesh);

  const crystalGeo = new THREE.OctahedronGeometry(0.5, 0);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.6,
    roughness: 0.1,
  });
  const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
  crystalMesh.position.y = 1.0;
  group.add(crystalMesh);

  return group;
}
