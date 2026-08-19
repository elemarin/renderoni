/**
 * Renderoni Console OS: Ambient 3D Home Scene
 *
 * Built directly on RenderoniEngine to share renderer context:
 * - Floating polyhedral artifacts and orbital rings
 * - Dynamic color-shifting ambient & point lighting
 * - Ambient particle dust & floating cyber embers
 * - Interactive mouse parallax & smooth orbital motion
 */

import * as THREE from 'three';
import { RenderoniEngine } from '../core/engine.js';
import { light } from '../presets/index.js';

export class HomeScene {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;

  // Visual Objects
  private artifactsGroup = new THREE.Group();
  private particles: THREE.Points | null = null;
  private particleGeo: THREE.BufferGeometry | null = null;
  private gridHelper: THREE.GridHelper | null = null;

  // Dynamic Lighting
  private pointLight1!: THREE.PointLight;
  private pointLight2!: THREE.PointLight;
  private targetColor = new THREE.Color(0x38bdf8);
  private currentColor = new THREE.Color(0x38bdf8);

  // Parallax
  private mouseX = 0;
  private mouseY = 0;
  private targetMouseX = 0;
  private targetMouseY = 0;
  private onMouseMove: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, 0, 0],
    });

    this.onMouseMove = (e: MouseEvent) => {
      this.targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      this.targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', this.onMouseMove);
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    scene.background = new THREE.Color(0x060913);
    scene.fog = new THREE.FogExp2(0x060913, 0.018);

    const camera = this.engine.native.camera;
    camera.fov = 50;
    camera.position.set(0, 3.5, 16);
    camera.lookAt(0, 1.5, 0);
    camera.updateProjectionMatrix();

    this.initLighting();
    this.initGeometry();
    this.initParticles();
    this.initGrid();

    // Start presentation loop
    this.engine.start((dt) => this.update(dt));
  }

  private initLighting(): void {
    const scene = this.engine.native.scene;
    this.engine.add(light({ type: 'ambient', intensity: 1.2, color: 0x1e293b }));

    this.pointLight1 = new THREE.PointLight(0x38bdf8, 4.5, 40);
    this.pointLight1.position.set(6, 8, 4);
    scene.add(this.pointLight1);

    this.pointLight2 = new THREE.PointLight(0xf59e0b, 2.5, 30);
    this.pointLight2.position.set(-6, -2, 2);
    scene.add(this.pointLight2);
  }

  private initGeometry(): void {
    const scene = this.engine.native.scene;

    // 1. Central floating core
    const coreGeo = new THREE.IcosahedronGeometry(1.6, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.15,
      transparent: false,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    this.artifactsGroup.add(coreMesh);

    // Outer wireframe cage
    const wireGeo = new THREE.IcosahedronGeometry(2.2, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    this.artifactsGroup.add(wireMesh);

    // 2. Orbital Torus Rings
    const ring1Geo = new THREE.TorusGeometry(3.6, 0.05, 16, 64);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.6,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 3;
    this.artifactsGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(4.4, 0.04, 16, 64);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 0.4,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.y = Math.PI / 4;
    ring2.rotation.x = -Math.PI / 6;
    this.artifactsGroup.add(ring2);

    // 3. Floating satellite prism shards
    const shardGeo = new THREE.OctahedronGeometry(0.4, 0);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x78350f,
      emissiveIntensity: 0.4,
    });

    for (let i = 0; i < 8; i++) {
      const shard = new THREE.Mesh(shardGeo, shardMat);
      const angle = (i / 8) * Math.PI * 2;
      const radius = 5.2 + (i % 2) * 1.2;
      shard.position.set(
        Math.cos(angle) * radius,
        (Math.sin(angle * 2) * 1.5),
        Math.sin(angle) * radius * 0.7
      );
      this.artifactsGroup.add(shard);
    }

    this.artifactsGroup.position.set(0, 2.2, -1);
    scene.add(this.artifactsGroup);
  }

  private initParticles(): void {
    const scene = this.engine.native.scene;
    const count = 500;
    this.particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 36;
      positions[i * 3 + 1] = Math.random() * 20 - 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
      speeds[i] = 0.2 + Math.random() * 0.6;
    }

    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleGeo.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.16,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(this.particleGeo, particleMat);
    scene.add(this.particles);
  }

  private initGrid(): void {
    const scene = this.engine.native.scene;
    this.gridHelper = new THREE.GridHelper(80, 40, 0x1e293b, 0x0f172a);
    this.gridHelper.position.y = -3.5;
    scene.add(this.gridHelper);
  }

  setAccentColor(colorHex: number): void {
    this.targetColor.setHex(colorHex);
  }

  private update(dt: number): void {
    // 1. Color Lerp
    this.currentColor.lerp(this.targetColor, dt * 3.5);
    this.pointLight1.color.copy(this.currentColor);
    if (this.particles?.material instanceof THREE.PointsMaterial) {
      this.particles.material.color.copy(this.currentColor);
    }

    // 2. Parallax Lerp
    this.mouseX += (this.targetMouseX - this.mouseX) * dt * 4;
    this.mouseY += (this.targetMouseY - this.mouseY) * dt * 4;

    const camera = this.engine.native.camera;
    camera.position.x = this.mouseX * 1.5;
    camera.position.y = 3.5 + this.mouseY * 0.8;
    camera.lookAt(0, 1.8, 0);

    // 3. Artifact Rotation
    this.artifactsGroup.rotation.y += dt * 0.35;
    this.artifactsGroup.rotation.x = Math.sin(Date.now() * 0.001) * 0.15 + this.mouseY * 0.2;
    this.artifactsGroup.position.y = 2.2 + Math.sin(Date.now() * 0.0015) * 0.35;

    // 4. Particle Float
    if (this.particleGeo) {
      const positions = this.particleGeo.attributes.position.array as Float32Array;
      const speeds = this.particleGeo.attributes.speed.array as Float32Array;
      for (let i = 0; i < speeds.length; i++) {
        positions[i * 3 + 1] += speeds[i] * dt * 0.8;
        if (positions[i * 3 + 1] > 16) {
          positions[i * 3 + 1] = -4;
          positions[i * 3 + 0] = (Math.random() - 0.5) * 36;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
        }
      }
      this.particleGeo.attributes.position.needsUpdate = true;
    }
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.onMouseMove);
    this.engine.dispose();
  }
}
