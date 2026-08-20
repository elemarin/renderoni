import * as THREE from 'three';

export interface VictorianWallClockModel {
  root: THREE.Group;
  hourHand: THREE.Group;
  minuteHand: THREE.Group;
  pendulum: THREE.Group;
}

export function clockHandRotations(hours: number, minutes: number): {
  hour: number;
  minute: number;
} {
  return {
    hour: -(((hours % 12) + minutes / 60) / 12) * Math.PI * 2,
    minute: -((minutes % 60) / 60) * Math.PI * 2,
  };
}

function createDialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create Victorian clock dial texture');

  const paper = ctx.createRadialGradient(512, 470, 80, 512, 512, 510);
  paper.addColorStop(0, '#f4e8c8');
  paper.addColorStop(0.72, '#d8c394');
  paper.addColorStop(1, '#8a6937');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = '#3b2a18';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(512, 512, 455, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#241a12';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 92px Georgia, serif';
  for (let value = 1; value <= 12; value++) {
    const angle = (value / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(String(value), 512 + Math.cos(angle) * 355, 512 + Math.sin(angle) * 355);
  }

  ctx.strokeStyle = 'rgba(60, 39, 19, 0.5)';
  ctx.lineWidth = 5;
  for (let value = 0; value < 60; value++) {
    const angle = (value / 60) * Math.PI * 2;
    const inner = value % 5 === 0 ? 414 : 430;
    ctx.beginPath();
    ctx.moveTo(512 + Math.sin(angle) * inner, 512 - Math.cos(angle) * inner);
    ctx.lineTo(512 + Math.sin(angle) * 445, 512 - Math.cos(angle) * 445);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createHand(length: number, width: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.55, -0.08);
  shape.lineTo(-width, length * 0.58);
  shape.lineTo(0, length);
  shape.lineTo(width, length * 0.58);
  shape.lineTo(width * 0.55, -0.08);
  shape.closePath();
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
}

function addScroll(
  target: THREE.Group,
  points: Array<[number, number]>,
  material: THREE.Material,
  radius = 0.022
): void {
  const path = new THREE.CatmullRomCurve3(
    points.map(([x, y]) => new THREE.Vector3(x, y, 0.01)),
    false,
    'centripetal'
  );
  target.add(new THREE.Mesh(new THREE.TubeGeometry(path, 24, radius, 7, false), material));
}

export function createVictorianWallClockModel(): VictorianWallClockModel {
  const root = new THREE.Group();
  root.name = 'victorian_wall_clock';

  const bronze = new THREE.MeshStandardMaterial({
    color: 0x8b5a19,
    metalness: 0.84,
    roughness: 0.28,
  });
  const antiqueGold = new THREE.MeshStandardMaterial({
    color: 0xc08a32,
    metalness: 0.9,
    roughness: 0.22,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x1c1712,
    metalness: 0.72,
    roughness: 0.32,
  });

  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.16, 48), darkMetal);
  back.rotation.x = Math.PI / 2;
  back.position.z = -0.015;

  const bezelOuter = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.075, 12, 64), bronze);
  bezelOuter.position.z = 0.08;
  const bezelInner = new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.026, 10, 64), antiqueGold);
  bezelInner.position.z = 0.125;

  const dial = new THREE.Mesh(
    new THREE.CircleGeometry(0.615, 64),
    new THREE.MeshStandardMaterial({
      map: createDialTexture(),
      roughness: 0.52,
      metalness: 0.04,
    })
  );
  dial.position.z = 0.11;

  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.605, 64),
    new THREE.MeshPhongMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.1,
      shininess: 120,
      specular: 0xffffff,
      depthWrite: false,
    })
  );
  glass.position.z = 0.145;

  const ornament = new THREE.Group();
  ornament.position.z = 0.02;

  for (const side of [-1, 1]) {
    addScroll(ornament, [
      [side * 0.67, 0.48],
      [side * 0.9, 0.63],
      [side * 0.96, 0.42],
      [side * 0.78, 0.3],
      [side * 0.92, 0.15],
      [side * 0.82, -0.08],
      [side * 0.68, -0.28],
    ], bronze, 0.026);
    addScroll(ornament, [
      [side * 0.5, 0.69],
      [side * 0.58, 0.9],
      [side * 0.37, 1.01],
      [side * 0.2, 0.9],
    ], antiqueGold, 0.024);
    addScroll(ornament, [
      [side * 0.56, -0.58],
      [side * 0.7, -0.78],
      [side * 0.49, -0.91],
      [side * 0.28, -0.75],
    ], bronze, 0.024);
  }

  addScroll(ornament, [[-0.44, 0.88], [-0.2, 1.08], [0, 0.96], [0.2, 1.08], [0.44, 0.88]], bronze, 0.032);
  addScroll(ornament, [[-0.38, -0.7], [-0.18, -0.96], [0, -0.84], [0.18, -0.96], [0.38, -0.7]], bronze, 0.03);

  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 5), antiqueGold);
  crown.position.set(0, 1.11, 0.02);
  const crownGem = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), bronze);
  crownGem.position.set(0, 0.94, 0.03);

  const hourHand = new THREE.Group();
  hourHand.name = 'clock_hour_hand';
  hourHand.position.z = 0.175;
  hourHand.add(createHand(0.31, 0.045, darkMetal));

  const minuteHand = new THREE.Group();
  minuteHand.name = 'clock_minute_hand';
  minuteHand.position.z = 0.185;
  minuteHand.add(createHand(0.46, 0.03, darkMetal));

  const initialTime = clockHandRotations(3, 0);
  hourHand.rotation.z = initialTime.hour;
  minuteHand.rotation.z = initialTime.minute;

  const centerPin = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 10), antiqueGold);
  centerPin.position.z = 0.205;

  const pendulum = new THREE.Group();
  pendulum.name = 'clock_pendulum';
  pendulum.position.set(0, -0.74, 0.02);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 10), antiqueGold);
  rod.position.y = -0.34;
  const bobRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 10, 32), bronze);
  bobRing.position.y = -0.72;
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.055, 24), antiqueGold);
  bob.rotation.x = Math.PI / 2;
  bob.position.set(0, -0.72, 0);
  const bobGem = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), darkMetal);
  bobGem.position.set(0, -0.72, 0.055);
  pendulum.add(rod, bobRing, bob, bobGem);

  root.add(
    back,
    ornament,
    crown,
    crownGem,
    bezelOuter,
    bezelInner,
    dial,
    glass,
    hourHand,
    minuteHand,
    centerPin,
    pendulum
  );

  return { root, hourHand, minuteHand, pendulum };
}
