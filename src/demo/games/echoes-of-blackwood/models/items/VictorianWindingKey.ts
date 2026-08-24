import * as THREE from 'three';

function addFiligree(
  target: THREE.Group,
  points: Array<[number, number]>,
  material: THREE.Material,
  radius = 0.014
): void {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    false,
    'centripetal'
  );
  target.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, radius, 6, false), material));
}

export function createVictorianWindingKeyModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'victorian_winding_key';

  const agedBrass = new THREE.MeshStandardMaterial({
    color: 0x9a6a2f,
    metalness: 0.88,
    roughness: 0.3,
  });
  const polishedEdges = new THREE.MeshStandardMaterial({
    color: 0xd0a45c,
    metalness: 0.92,
    roughness: 0.2,
  });
  const recess = new THREE.MeshStandardMaterial({
    color: 0x332417,
    metalness: 0.72,
    roughness: 0.38,
  });

  const bow = new THREE.Group();
  bow.position.x = -0.48;

  const outerBow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 9, 48), agedBrass);
  const innerBow = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.018, 8, 40), polishedEdges);
  const hub = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.025, 8, 24), agedBrass);
  bow.add(outerBow, innerBow, hub);

  for (const side of [-1, 1]) {
    addFiligree(bow, [
      [side * 0.03, 0.04],
      [side * 0.13, 0.18],
      [side * 0.24, 0.13],
      [side * 0.18, 0.02],
      [side * 0.08, 0.08],
    ], agedBrass, 0.018);
    addFiligree(bow, [
      [side * 0.03, -0.04],
      [side * 0.14, -0.18],
      [side * 0.25, -0.13],
      [side * 0.18, -0.02],
      [side * 0.08, -0.08],
    ], agedBrass, 0.018);
  }

  addFiligree(bow, [[-0.12, 0.28], [0, 0.36], [0.12, 0.28]], polishedEdges, 0.021);
  addFiligree(bow, [[-0.12, -0.28], [0, -0.36], [0.12, -0.28]], polishedEdges, 0.021);

  for (const [x, y] of [[-0.29, 0], [0.29, 0], [0, 0.29], [0, -0.29]] as const) {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), polishedEdges);
    bead.position.set(x, y, 0);
    bow.add(bead);
  }

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 16), agedBrass);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.25;

  const shaftInset = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.78, 10), recess);
  shaftInset.rotation.z = Math.PI / 2;
  shaftInset.position.set(0.27, 0.027, 0.026);

  const collars = new THREE.Group();
  for (const x of [-0.18, -0.12, -0.06, 0.56, 0.62]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 7, 18), polishedEdges);
    collar.rotation.y = Math.PI / 2;
    collar.position.x = x;
    collars.add(collar);
  }

  const bitShape = new THREE.Shape();
  bitShape.moveTo(0, 0.065);
  bitShape.lineTo(0.12, 0.065);
  bitShape.lineTo(0.12, -0.18);
  bitShape.lineTo(0.2, -0.18);
  bitShape.lineTo(0.2, -0.08);
  bitShape.lineTo(0.3, -0.08);
  bitShape.lineTo(0.3, 0.065);
  bitShape.lineTo(0, 0.065);

  const bitGeometry = new THREE.ExtrudeGeometry(bitShape, {
    depth: 0.075,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.01,
  });
  bitGeometry.translate(0, 0, -0.0375);
  const bit = new THREE.Mesh(bitGeometry, agedBrass);
  bit.position.x = 0.69;

  const bitRosette = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 8, 20), polishedEdges);
  bitRosette.position.set(0.83, -0.04, 0.045);
  addFiligree(root, [[0.72, -0.03], [0.77, -0.12], [0.83, -0.04], [0.89, -0.12], [0.94, -0.03]], recess, 0.012);

  root.add(bow, shaft, shaftInset, collars, bit, bitRosette);
  root.rotation.z = -0.03;
  return root;
}
