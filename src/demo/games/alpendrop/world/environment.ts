/**
 * Atmospheric Alpine Sky, Sun, Volumetric Clouds & Realistic Procedural Mountain Range Panorama
 * Expansive 1350m panoramic mountain ring with natural couloirs, slate cliffs, and glacier snowfields.
 */

import * as THREE from 'three';

export class AlpineEnvironment {
  sunLight!: THREE.DirectionalLight;
  hemiLight!: THREE.HemisphereLight;
  sunDisc!: THREE.Mesh;
  waterMesh!: THREE.Mesh;
  clouds: THREE.Group[] = [];
  backdropMesh!: THREE.Mesh;

  setup(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    // 1. Sky & Atmospheric Fog
    scene.background = new THREE.Color(0x70a6ff); // Clear high-altitude alpine sky
    scene.fog = new THREE.FogExp2(0xa3c8f8, 0.0011); // Expansive panoramic visibility
    camera.far = 3200;
    camera.updateProjectionMatrix();

    // 2. Radiant Morning Alpine Sun in the South-East
    const sunPos = new THREE.Vector3(260, 320, 160);

    this.sunLight = new THREE.DirectionalLight(0xfff7ed, 3.2);
    this.sunLight.position.copy(sunPos);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 950;
    this.sunLight.shadow.camera.left = -380;
    this.sunLight.shadow.camera.right = 380;
    this.sunLight.shadow.camera.top = 380;
    this.sunLight.shadow.camera.bottom = -380;
    this.sunLight.shadow.bias = -0.0003;
    scene.add(this.sunLight);

    // Glowing Sun Disc in the sky
    const matSun = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(36, 24, 16), matSun);
    this.sunDisc.position.copy(sunPos.clone().multiplyScalar(3.6));
    scene.add(this.sunDisc);

    // Soft Sun Corona Glow
    const matCorona = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.3,
    });
    const corona = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), matCorona);
    corona.position.copy(this.sunDisc.position);
    scene.add(corona);

    // 3. Ambient Light (Sky Blue + Alpine Grass Bounce)
    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x166534, 1.05);
    scene.add(this.hemiLight);

    // 4. Winding Mountain River Water Surface
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.08,
      metalness: 0.85,
    });
    this.waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), waterMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = 0.95;
    scene.add(this.waterMesh);

    // 5. Volumetric Multi-Sphere Cumulus Cloud Banks
    this.buildVolumetricClouds(scene);

    // 6. Realistic Procedural Alpine Mountain Range
    this.buildProceduralMountainRange(scene);
  }

  private buildVolumetricClouds(scene: THREE.Scene): void {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: false,
    });

    const cloudClusterCenters: Array<[number, number, number]> = [
      [-160, 145, 80],
      [240, 155, -180],
      [-320, 165, -150],
      [160, 150, 260],
      [-220, 175, 290],
      [310, 160, 95],
      [60, 185, -340],
      [-100, 200, -420],
      [380, 170, -280],
      [-420, 190, 180],
    ];

    for (const [cx, cy, cz] of cloudClusterCenters) {
      const cluster = new THREE.Group();
      cluster.position.set(cx, cy, cz);

      const sphereCount = 7 + Math.floor(Math.random() * 4);
      for (let s = 0; s < sphereCount; s++) {
        const radius = 18 + Math.random() * 22;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), cloudMat);
        const offsetX = (s - sphereCount / 2) * 16 + (Math.random() - 0.5) * 12;
        const offsetY = (Math.random() - 0.5) * 8;
        const offsetZ = (Math.random() - 0.5) * 16;
        puff.position.set(offsetX, offsetY, offsetZ);
        puff.scale.set(1.4, 0.75, 1.1);
        puff.castShadow = true;
        cluster.add(puff);
      }

      scene.add(cluster);
      this.clouds.push(cluster);
    }
  }

  private buildProceduralMountainRange(scene: THREE.Scene): void {
    const ringRadiusInner = 460;
    const ringRadiusOuter = 1350;
    const radialSegments = 160;
    const heightSegments = 32;

    const geometry = new THREE.RingGeometry(ringRadiusInner, ringRadiusOuter, radialSegments, heightSegments);
    geometry.rotateX(-Math.PI / 2);

    const posAttr = geometry.attributes.position;
    const vertexCount = posAttr.count;

    const colors = new Float32Array(vertexCount * 3);
    const colSnow = new THREE.Color(0xf8fafc);
    const colSlate = new THREE.Color(0x334155);
    const colGranite = new THREE.Color(0x64748b);
    const colPineGreen = new THREE.Color(0x1e3a29);
    const tempCol = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const dist = Math.hypot(x, z);
      const angle = Math.atan2(z, x);

      // Multi-frequency fractal ridgeline noise
      const ridge1 = Math.abs(Math.sin(angle * 6.0) * Math.cos(angle * 3.0 + 0.8));
      const ridge2 = Math.abs(Math.sin(angle * 14.0 + 1.2) * Math.sin(angle * 7.0));
      const ridge3 = Math.sin(angle * 28.0) * 0.5 + 0.5;

      const combinedRidge = ridge1 * 0.6 + ridge2 * 0.3 + ridge3 * 0.1;

      // Distance bell curve peaking in middle of ring
      const ringT = (dist - ringRadiusInner) / (ringRadiusOuter - ringRadiusInner);
      const radialProfile = Math.sin(ringT * Math.PI);

      let cardinalMult = 1.0;
      if (z < -100) {
        cardinalMult = 1.75 + Math.sin(angle * 3.0) * 0.3;
      } else if (x > 100) {
        cardinalMult = 1.45;
      } else if (x < -100) {
        cardinalMult = 1.55;
      } else {
        cardinalMult = 1.2;
      }

      const peakHeight = Math.pow(combinedRidge, 1.6) * 260.0 * radialProfile * cardinalMult;
      const finalY = Math.max(2.0, peakHeight);
      posAttr.setY(i, finalY);

      // Realistic Mountain Rock & Glacier Snow Shading
      if (finalY > 140) {
        const snowT = Math.min(1.0, (finalY - 140) / 70.0);
        tempCol.lerpColors(colSlate, colSnow, snowT);
      } else if (finalY > 70) {
        const rockT = (finalY - 70) / 70.0;
        tempCol.lerpColors(colGranite, colSlate, rockT);
      } else {
        const footT = finalY / 70.0;
        tempCol.lerpColors(colPineGreen, colGranite, footT);
      }

      colors[i * 3] = tempCol.r;
      colors[i * 3 + 1] = tempCol.g;
      colors[i * 3 + 2] = tempCol.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const matBackdrop = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.05,
      flatShading: false,
    });

    this.backdropMesh = new THREE.Mesh(geometry, matBackdrop);
    scene.add(this.backdropMesh);
  }

  update(dt: number): void {
    for (const cloud of this.clouds) {
      cloud.position.x += 1.4 * dt;
      if (cloud.position.x > 550) {
        cloud.position.x = -550;
      }
    }
  }
}
