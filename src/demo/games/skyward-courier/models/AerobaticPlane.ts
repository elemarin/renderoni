/**
 * Stylized Aerobatic Monoplane 3D Model Hierarchy
 */

import * as THREE from 'three';

export interface AircraftRig {
  root: THREE.Group;
  propeller: THREE.Mesh;
  cockpitPos: THREE.Object3D;
  tailCameraPos: THREE.Object3D;
}

export function buildAerobaticPlane(): AircraftRig {
  const root = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.25, metalness: 0.3 }); // Skyward Cyan
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.3 }); // Crimson Red trim
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.65 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });

  // 1. Fuselage
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.28, 6.2, 16), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  root.add(fuselage);

  // Nose Cowling & Spinner
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 16), trimMat);
  nose.position.z = -3.5;
  nose.rotation.x = -Math.PI / 2;
  root.add(nose);

  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 16), chromeMat);
  spinner.position.z = -4.2;
  spinner.rotation.x = -Math.PI / 2;
  root.add(spinner);

  // 2. 3-Blade Propeller
  const propGroup = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.05), chromeMat);
  propGroup.position.z = -4.15;
  root.add(propGroup);

  // 3. Canopy & Cockpit
  const canopy = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.4, 8, 16), glassMat);
  canopy.position.set(0, 0.45, -0.6);
  canopy.rotation.x = Math.PI / 2;
  root.add(canopy);

  // 4. Wings with Dihedral & Wingtips
  const mainWing = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.1, 1.5), wingMat);
  mainWing.position.set(0, 0, -0.8);
  root.add(mainWing);

  // Red Wingtip Stripes
  const wingtipL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.52), trimMat);
  wingtipL.position.set(-4.4, 0, -0.8);
  const wingtipR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.52), trimMat);
  wingtipR.position.set(4.4, 0, -0.8);
  root.add(wingtipL, wingtipR);

  // 5. Tail Stabilizers & Vertical Fin
  const vertFin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 1.2), trimMat);
  vertFin.position.set(0, 0.9, 2.7);
  vertFin.rotation.x = -0.2;
  const horizStab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.8), wingMat);
  horizStab.position.set(0, 0.25, 2.8);
  root.add(vertFin, horizStab);

  // 6. Tricycle Landing Gear with Rubber Tires
  const gearL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), chromeMat);
  gearL.position.set(-1.1, -0.5, -0.8);
  const tireL = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.1, 8, 16), tireMat);
  tireL.position.set(-1.1, -0.9, -0.8);
  tireL.rotation.y = Math.PI / 2;

  const gearR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), chromeMat);
  gearR.position.set(1.1, -0.5, -0.8);
  const tireR = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.1, 8, 16), tireMat);
  tireR.position.set(1.1, -0.9, -0.8);
  tireR.rotation.y = Math.PI / 2;

  const noseGear = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7), chromeMat);
  noseGear.position.set(0, -0.45, -2.4);
  const noseTire = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.08, 8, 16), tireMat);
  noseTire.position.set(0, -0.8, -2.4);
  noseTire.rotation.y = Math.PI / 2;

  root.add(gearL, tireL, gearR, tireR, noseGear, noseTire);

  // Camera Mount Points
  const cockpitPos = new THREE.Object3D();
  cockpitPos.position.set(0, 0.48, -0.5);
  root.add(cockpitPos);

  const tailCameraPos = new THREE.Object3D();
  tailCameraPos.position.set(0, 2.4, 7.5);
  root.add(tailCameraPos);

  return { root, propeller: propGroup, cockpitPos, tailCameraPos };
}
