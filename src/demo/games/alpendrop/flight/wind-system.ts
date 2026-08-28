/**
 * Cozy Alpine Breeze & Flowing Soft White Wind Streamers
 * Smooth, undulating, semi-transparent white air currents that billow gracefully through the valley,
 * accompanied by gentle drifting alpine pollen/snow flecks and physical drift forces.
 */

import * as THREE from 'three';

export interface WindCurrentZone {
  name: string;
  type: 'crosswind' | 'thermal' | 'shear';
  center: [number, number, number];
  size: [number, number, number];
  velocity: [number, number, number];
  turbulence: number;
  alertText: string;
}

// Reusable module-level scratch variable (Zero GC in simulation & render loop)
const _scratchWindResult = new THREE.Vector3();

export class WindSystem {
  private baseWindDir: THREE.Vector3 = new THREE.Vector3(1, 0, 0.25).normalize();
  private baseWindSpeed: number = 3.8;
  private gustTimer: number = 0;
  private currentGust: number = 0;

  readonly currentZones: WindCurrentZone[] = [
    {
      name: 'River Gorge Wind Jet',
      type: 'crosswind',
      center: [-150, 14, -110],
      size: [80, 35, 200],
      velocity: [-12.0, 0.0, 3.0],
      turbulence: 0.6,
      alertText: '💨 GORGE CROSSWIND JET: 45 KM/H',
    },
    {
      name: 'Windmill Ridge Gale',
      type: 'shear',
      center: [180, 36, 90],
      size: [70, 35, 90],
      velocity: [10.5, 0.5, -4.0],
      turbulence: 0.65,
      alertText: '⚠️ RIDGE PASS GALE: 40 KM/H',
    },
    {
      name: 'Monastery Peak Updraft',
      type: 'thermal',
      center: [65, 62, -195],
      size: [70, 50, 70],
      velocity: [3.5, 5.0, -2.5],
      turbulence: 0.35,
      alertText: '🔥 CLIFF THERMAL UPDRAFT: +5.0 M/S',
    },
    {
      name: 'South Valley Pasture Breeze',
      type: 'crosswind',
      center: [-95, 18, 160],
      size: [85, 35, 85],
      velocity: [-6.5, 0.0, -5.5],
      turbulence: 0.3,
      alertText: '💨 MEADOW BREEZE: 30 KM/H',
    },
    {
      name: 'Lake Seeberg Shore Winds',
      type: 'crosswind',
      center: [120, 8, -75],
      size: [80, 30, 80],
      velocity: [7.0, 0.0, -6.0],
      turbulence: 0.3,
      alertText: '🌊 LAKESIDE BREEZE: 32 KM/H',
    },
  ];

  // Cozy Billowing Soft White Wind Ribbons (Mesh-based wide smooth ribbons)
  private ribbonGroup!: THREE.Group;
  private ribbonMesh!: THREE.Mesh;
  private ribbonGeo!: THREE.BufferGeometry;
  private ribbonPositions!: Float32Array;
  private ribbonColors!: Float32Array;
  private ribbonIndices!: Uint32Array;

  // Drifting Cozy Alpine Dust / Pollen Flecks
  private particleMesh!: THREE.Points;
  private particlePositions!: Float32Array;

  private streamSeeds: Array<{
    zoneIdx: number;
    baseX: number;
    baseY: number;
    baseZ: number;
    speed: number;
    length: number;
    width: number;
    freq: number;
    phase: number;
    progress: number;
  }> = [];

  private streamCount: number = 60; // 60 smooth curving ribbon streamers
  private particleCount: number = 180; // 180 cozy floating pollen flecks

  initVisuals(scene: THREE.Scene): void {
    this.ribbonGroup = new THREE.Group();
    const count = this.streamCount;
    const segs = 10; // 10 smooth curved spine points per ribbon

    // Each ribbon has (segs) pairs of vertices = segs * 2 vertices
    const totalVertices = count * segs * 2;
    const totalQuads = count * (segs - 1);

    this.ribbonPositions = new Float32Array(totalVertices * 3);
    this.ribbonColors = new Float32Array(totalVertices * 3);
    this.ribbonIndices = new Uint32Array(totalQuads * 6);

    // Build static quad index buffer
    let iOffset = 0;
    for (let r = 0; r < count; r++) {
      const rBase = r * segs * 2;
      for (let s = 0; s < segs - 1; s++) {
        const v0 = rBase + s * 2;
        const v1 = rBase + s * 2 + 1;
        const v2 = rBase + (s + 1) * 2;
        const v3 = rBase + (s + 1) * 2 + 1;

        this.ribbonIndices[iOffset++] = v0;
        this.ribbonIndices[iOffset++] = v2;
        this.ribbonIndices[iOffset++] = v1;

        this.ribbonIndices[iOffset++] = v1;
        this.ribbonIndices[iOffset++] = v2;
        this.ribbonIndices[iOffset++] = v3;
      }
    }

    for (let i = 0; i < count; i++) {
      const zoneIdx = i % this.currentZones.length;
      const zone = this.currentZones[zoneIdx];

      this.streamSeeds.push({
        zoneIdx,
        baseX: zone.center[0] + (Math.random() - 0.5) * zone.size[0] * 1.6,
        baseY: zone.center[1] + (Math.random() - 0.5) * zone.size[1] * 1.0,
        baseZ: zone.center[2] + (Math.random() - 0.5) * zone.size[2] * 1.6,
        speed: 0.85 + Math.random() * 0.4,
        length: 28.0 + Math.random() * 18.0, // 28m - 46m long flowing wisps
        width: 0.35 + Math.random() * 0.3,   // Soft 0.35m - 0.65m wide ribbons
        freq: 0.12 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
        progress: Math.random(),
      });
    }

    this.ribbonGeo = new THREE.BufferGeometry();
    this.ribbonGeo.setAttribute('position', new THREE.BufferAttribute(this.ribbonPositions, 3));
    this.ribbonGeo.setAttribute('color', new THREE.BufferAttribute(this.ribbonColors, 3));
    this.ribbonGeo.setIndex(new THREE.BufferAttribute(this.ribbonIndices, 1));

    const matRibbon = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });

    this.ribbonMesh = new THREE.Mesh(this.ribbonGeo, matRibbon);
    this.ribbonGroup.add(this.ribbonMesh);

    // 2. Cozy Drifting Pollen Particles
    this.particlePositions = new Float32Array(this.particleCount * 3);
    for (let p = 0; p < this.particleCount; p++) {
      const zone = this.currentZones[p % this.currentZones.length];
      this.particlePositions[p * 3] = zone.center[0] + (Math.random() - 0.5) * zone.size[0] * 2;
      this.particlePositions[p * 3 + 1] = zone.center[1] + (Math.random() - 0.5) * zone.size[1] * 1.5;
      this.particlePositions[p * 3 + 2] = zone.center[2] + (Math.random() - 0.5) * zone.size[2] * 2;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    const matParticle = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.55,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    this.particleMesh = new THREE.Points(particleGeo, matParticle);
    this.ribbonGroup.add(this.particleMesh);

    scene.add(this.ribbonGroup);
  }

  update(dt: number): void {
    this.gustTimer += dt;
    this.currentGust = Math.sin(this.gustTimer * 0.7) * 2.0 + Math.sin(this.gustTimer * 1.5) * 1.0;

    if (!this.ribbonPositions || !this.streamSeeds) return;

    let vIdx = 0;
    const segs = 10;

    for (let i = 0; i < this.streamCount; i++) {
      const seed = this.streamSeeds[i];
      const zone = this.currentZones[seed.zoneIdx];

      const vx = zone.velocity[0] * seed.speed;
      const vy = zone.velocity[1] * seed.speed;
      const vz = zone.velocity[2] * seed.speed;
      const vMag = Math.hypot(vx, vz) || 1.0;
      const dirX = vx / vMag;
      const dirY = vy / vMag;
      const dirZ = vz / vMag;

      // Perpendicular normal for ribbon width (horizontal + vertical curve)
      const normX = -dirZ;
      const normZ = dirX;

      seed.progress += (vMag * dt * 0.9) / (zone.size[0] * 2.2);
      if (seed.progress > 1.0) {
        seed.progress = 0.0;
        seed.baseX = zone.center[0] - dirX * zone.size[0] * 0.95 + (Math.random() - 0.5) * 25;
        seed.baseY = zone.center[1] + (Math.random() - 0.5) * zone.size[1] * 0.8;
        seed.baseZ = zone.center[2] - dirZ * zone.size[2] * 0.95 + (Math.random() - 0.5) * 25;
      }

      const headDist = seed.progress * (zone.size[0] * 2.2);
      const headX = seed.baseX + dirX * headDist;
      const headY = seed.baseY + dirY * headDist;
      const headZ = seed.baseZ + dirZ * headDist;

      for (let s = 0; s < segs; s++) {
        const t = s / (segs - 1); // 0 at head, 1 at tail
        const distAlong = t * seed.length;

        // Smooth cosine wave undulation (cozy gentle billow!)
        const wave = Math.sin(this.gustTimer * 2.2 + distAlong * seed.freq + seed.phase);
        const waveH = Math.cos(this.gustTimer * 1.8 + distAlong * (seed.freq * 0.8) + seed.phase);

        const px = headX - dirX * distAlong + normX * (waveH * 0.8);
        const py = headY - dirY * distAlong + wave * 0.9;
        const pz = headZ - dirZ * distAlong + normZ * (waveH * 0.8);

        // Ribbon width tapers smoothly at head and tail
        const taper = Math.sin(t * Math.PI);
        const halfW = (seed.width * 0.5) * taper;

        // Left vertex
        this.ribbonPositions[vIdx] = px + normX * halfW;
        this.ribbonPositions[vIdx + 1] = py + halfW * 0.3;
        this.ribbonPositions[vIdx + 2] = pz + normZ * halfW;

        // Right vertex
        this.ribbonPositions[vIdx + 3] = px - normX * halfW;
        this.ribbonPositions[vIdx + 4] = py - halfW * 0.3;
        this.ribbonPositions[vIdx + 5] = pz - normZ * halfW;

        // Cozy Pure Snow-White Alpha Profile (bright core, soft faded ends)
        const alpha = Math.pow(taper, 1.2) * 0.85;
        this.ribbonColors[vIdx] = alpha;
        this.ribbonColors[vIdx + 1] = alpha;
        this.ribbonColors[vIdx + 2] = alpha;

        this.ribbonColors[vIdx + 3] = alpha;
        this.ribbonColors[vIdx + 4] = alpha;
        this.ribbonColors[vIdx + 5] = alpha;

        vIdx += 6;
      }
    }

    this.ribbonGeo.attributes.position.needsUpdate = true;
    this.ribbonGeo.attributes.color.needsUpdate = true;

    // Update Drifting Pollen Particles
    if (this.particlePositions && this.particleMesh) {
      for (let p = 0; p < this.particleCount; p++) {
        const zone = this.currentZones[p % this.currentZones.length];
        this.particlePositions[p * 3] += zone.velocity[0] * 0.6 * dt;
        this.particlePositions[p * 3 + 1] += (zone.velocity[1] * 0.4 + Math.sin(this.gustTimer + p) * 0.3) * dt;
        this.particlePositions[p * 3 + 2] += zone.velocity[2] * 0.6 * dt;

        // Wrap around zone boundaries
        const dx = this.particlePositions[p * 3] - zone.center[0];
        const dz = this.particlePositions[p * 3 + 2] - zone.center[2];
        if (Math.abs(dx) > zone.size[0] || Math.abs(dz) > zone.size[2]) {
          this.particlePositions[p * 3] = zone.center[0] - (zone.velocity[0] > 0 ? 1 : -1) * zone.size[0] * 0.9;
          this.particlePositions[p * 3 + 1] = zone.center[1] + (Math.random() - 0.5) * zone.size[1];
          this.particlePositions[p * 3 + 2] = zone.center[2] - (zone.velocity[2] > 0 ? 1 : -1) * zone.size[2] * 0.9;
        }
      }
      this.particleMesh.geometry.attributes.position.needsUpdate = true;
    }
  }

  getWindAt(x: number, y: number, z: number): THREE.Vector3 {
    _scratchWindResult.copy(this.baseWindDir).multiplyScalar(this.baseWindSpeed + this.currentGust);

    for (const zone of this.currentZones) {
      const dx = Math.abs(x - zone.center[0]);
      const dy = Math.abs(y - zone.center[1]);
      const dz = Math.abs(z - zone.center[2]);

      if (dx < zone.size[0] && dy < zone.size[1] && dz < zone.size[2]) {
        const factor =
          (1 - dx / zone.size[0]) *
          (1 - dy / zone.size[1]) *
          (1 - dz / zone.size[2]);

        _scratchWindResult.x += zone.velocity[0] * factor;
        _scratchWindResult.y += zone.velocity[1] * factor;
        _scratchWindResult.z += zone.velocity[2] * factor;

        if (zone.turbulence > 0) {
          const turb = Math.sin(this.gustTimer * 5 + x * 0.1) * zone.turbulence * factor;
          _scratchWindResult.x += turb;
          _scratchWindResult.z += turb;
        }
      }
    }

    return _scratchWindResult;
  }

  getBaseWindSpeed(): number {
    return this.baseWindSpeed + this.currentGust;
  }

  getBaseWindHeadingDeg(): number {
    const angleRad = Math.atan2(this.baseWindDir.x, -this.baseWindDir.z);
    return Math.round(THREE.MathUtils.radToDeg(angleRad) + 360) % 360;
  }

  isInThermal(x: number, y: number, z: number): boolean {
    for (const zone of this.currentZones) {
      if (zone.type !== 'thermal') continue;
      const dx = Math.abs(x - zone.center[0]);
      const dy = Math.abs(y - zone.center[1]);
      const dz = Math.abs(z - zone.center[2]);
      if (dx < zone.size[0] && dy < zone.size[1] && dz < zone.size[2]) {
        return true;
      }
    }
    return false;
  }

  getActiveWindAlert(x: number, y: number, z: number): string | null {
    for (const zone of this.currentZones) {
      const dx = Math.abs(x - zone.center[0]);
      const dy = Math.abs(y - zone.center[1]);
      const dz = Math.abs(z - zone.center[2]);
      if (dx < zone.size[0] * 0.95 && dy < zone.size[1] * 0.95 && dz < zone.size[2] * 0.95) {
        return zone.alertText;
      }
    }
    return null;
  }
}
