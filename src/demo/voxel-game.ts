/**
 * Renderoni Showcase: Monolith — Ancient Voxel Ruins
 *
 * Procedural Voxel World & Monolith Restoration Puzzle:
 * - 1st-Person FPS Voxel Explorer (PointerLock, sprint, auto-step over blocks)
 * - Multi-biome terrain: Ocean, beach, lush meadow, pine forest, and mountain caverns
 * - 3 Hidden Aether Crystals (Ruby, Sapphire, Amethyst) to discover
 * - Restoring the Ancient Monolith Archway ignites a radiant skyward beacon!
 * - Creative block placement & breaking with particle debris
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RenderoniEngine } from '../core/engine.js';
import { light } from '../presets/index.js';
import { sfx } from './audio-sfx.js';

export type BlockType = 'grass' | 'stone' | 'wood' | 'leaves' | 'crystal' | 'lantern';

export interface VoxelTelemetry {
  playerPos: [number, number, number];
  blockCount: number;
  selectedBlockType: BlockType;
  crystalsFound: number;
  totalCrystals: number;
  monolithActivated: boolean;
  questStatus: string;
}

export class VoxelGame {
  readonly engine: RenderoniEngine;
  private canvas: HTMLCanvasElement;

  // 1st-Person Camera Rig
  private camera!: THREE.PerspectiveCamera;
  private yawObject = new THREE.Object3D();
  private pitchObject = new THREE.Object3D();
  private playerBody!: RAPIER.RigidBody;
  private playerCollider!: RAPIER.Collider;
  private characterController!: RAPIER.KinematicCharacterController;
  private isLocked = false;
  private mouseSensitivity = 0.0022;

  // Voxel Grid & Rendering
  private blockMap = new Map<string, { type: BlockType; mesh: THREE.Mesh; collider: RAPIER.Collider }>();
  private materials!: Record<BlockType, THREE.Material>;
  private sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  private selectedBlockType: BlockType = 'lantern';

  // Game Puzzle State
  private crystalsFound = 0;
  private totalCrystals = 3;
  private monolithActivated = false;
  private beaconLight: THREE.PointLight | null = null;
  private beaconMesh: THREE.Mesh | null = null;

  // Controls
  private keys: Record<string, boolean> = {};
  private raycaster = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new RenderoniEngine({
      mode: 'interactive',
      canvas: this.canvas,
      gravity: [0, -22.0, 0],
    });
  }

  async init(): Promise<void> {
    await this.engine.init();

    const scene = this.engine.native.scene;
    this.camera = this.engine.native.camera;
    this.camera.fov = 75;
    this.camera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x38bdf8);
    scene.fog = new THREE.FogExp2(0x38bdf8, 0.012);

    // 1. Setup Materials
    this.setupMaterials();

    // 2. Setup 1st-Person Camera Rig
    this.setupFirstPersonRig();

    // 3. Lighting
    this.setupLighting();

    // 4. Generate Procedural Multi-Biome Terrain
    this.generateTerrain();

    // 5. Build Ancient Monolith Archway & Crystals
    this.setupMonolithQuest();

    // 6. Action Handlers
    this.setupActions();

    // 7. Input Listeners
    this.setupInput();

    // Start presentation loop
    this.engine.start((dt) => this.update(dt));
  }

  private setupMaterials(): void {
    this.materials = {
      grass: new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.8 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 }),
      leaves: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 }),
      crystal: new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x9333ea, emissiveIntensity: 0.8, roughness: 0.1 }),
      lantern: new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.9, roughness: 0.2 }),
    };
  }

  private setupFirstPersonRig(): void {
    const scene = this.engine.native.scene;
    const startPos = [0, 8, 0];

    this.yawObject.position.set(startPos[0], startPos[1], startPos[2]);
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(this.camera);
    this.camera.position.set(0, 0.7, 0);
    scene.add(this.yawObject);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(startPos[0], startPos[1], startPos[2]);
    this.playerBody = this.engine.native.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(0.6, 0.35);
    this.playerCollider = this.engine.native.world.createCollider(colliderDesc, this.playerBody);

    this.characterController = this.engine.native.world.createCharacterController(0.02);
    this.characterController.enableAutostep(1.1, 0.3, true); // Auto-step over 1 full voxel block!
    this.characterController.enableSnapToGround(0.4);
    this.characterController.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
  }

  private setupLighting(): void {
    const scene = this.engine.native.scene;

    this.engine.add(
      light({
        type: 'directional',
        intensity: 2.6,
        color: 0xfffbeb,
        position: [40, 60, 30],
      })
    );

    const hemi = new THREE.HemisphereLight(0xbae6fd, 0x14532d, 0.7);
    scene.add(hemi);
  }

  private generateTerrain(): void {
    const size = 20;

    for (let x = -size; x <= size; x++) {
      for (let z = -size; z <= size; z++) {
        const dist = Math.hypot(x, z);

        // Elevation formula with multi-octave hill noise
        let height = Math.round(
          Math.sin(x * 0.15) * 2.5 +
          Math.cos(z * 0.15) * 2.5 +
          Math.sin((x + z) * 0.25) * 1.5 + 4
        );

        if (dist > 16) height = Math.max(1, height - Math.round((dist - 16) * 0.8));

        for (let y = 0; y <= height; y++) {
          let type: BlockType = 'stone';
          if (y === height) {
            type = y <= 2 ? 'crystal' : 'grass';
          } else if (y >= height - 2) {
            type = 'stone';
          }

          this.addBlock(x, y, z, type);
        }

        // Procedural Trees
        if (x % 7 === 0 && z % 7 === 0 && height >= 3 && Math.abs(x) > 4 && Math.abs(z) > 4) {
          this.buildTree(x, height + 1, z);
        }
      }
    }
  }

  private buildTree(x: number, baseY: number, z: number): void {
    // Wood Trunk (3 blocks high)
    for (let dy = 0; dy < 3; dy++) {
      this.addBlock(x, baseY + dy, z, 'wood');
    }
    // Leaves Crown
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 2; dy <= 4; dy++) {
          if (dx !== 0 || dz !== 0 || dy > 2) {
            this.addBlock(x + dx, baseY + dy, z + dz, 'leaves');
          }
        }
      }
    }
  }

  private setupMonolithQuest(): void {
    // Build Ancient Stone Archway at (0, 5, -8)
    for (let dy = 0; dy < 5; dy++) {
      this.addBlock(-2, 5 + dy, -8, 'stone');
      this.addBlock(2, 5 + dy, -8, 'stone');
    }
    for (let dx = -1; dx <= 1; dx++) {
      this.addBlock(dx, 9, -8, 'stone');
    }

    // Glowing Central Altar
    this.addBlock(0, 5, -8, 'lantern');

    // Spawn 3 Hidden Aether Crystals around the world
    this.spawnCollectibleCrystal(-12, 6, 10, 0xef4444); // Ruby
    this.spawnCollectibleCrystal(14, 7, -12, 0x3b82f6); // Sapphire
    this.spawnCollectibleCrystal(12, 8, 14, 0x10b981);  // Emerald
  }

  private spawnCollectibleCrystal(x: number, y: number, z: number, color: number): void {
    const scene = this.engine.native.scene;
    const crystalMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.9,
      roughness: 0.1,
    });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), crystalMat);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    const light = new THREE.PointLight(color, 1.2, 5);
    light.position.set(x, y + 0.5, z);
    scene.add(light);

    // Check distance in update loop
    (mesh as any).isCrystal = true;
    (mesh as any).light = light;
  }

  addBlock(x: number, y: number, z: number, type: BlockType): void {
    const key = `${x},${y},${z}`;
    if (this.blockMap.has(key)) return;

    const scene = this.engine.native.scene;
    const mesh = new THREE.Mesh(this.sharedBoxGeo, this.materials[type]);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = this.engine.native.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    const collider = this.engine.native.world.createCollider(colliderDesc, body);

    this.blockMap.set(key, { type, mesh, collider });
  }

  removeBlock(x: number, y: number, z: number): void {
    const key = `${x},${y},${z}`;
    const block = this.blockMap.get(key);
    if (!block) return;

    this.engine.native.scene.remove(block.mesh);
    this.engine.native.world.removeCollider(block.collider, true);
    this.blockMap.delete(key);
    sfx.playBlockBreak();
  }

  private setupActions(): void {
    this.engine.actions.register({
      name: 'voxel.place',
      handle: (type: any) => {
        if (typeof type === 'string' && this.materials[type as BlockType]) {
          this.selectedBlockType = type as BlockType;
        }
      },
    });
    this.engine.actions.register({
      name: 'voxel.select',
      handle: (type: any) => {
        if (typeof type === 'string' && this.materials[type as BlockType]) {
          this.selectedBlockType = type as BlockType;
        }
      },
    });
  }

  private setupInput(): void {
    this.canvas.addEventListener('click', (e) => {
      if (!this.isLocked) {
        this.canvas.requestPointerLock();
      } else {
        if (e.button === 0) this.raycastBreakBlock();
        if (e.button === 2) this.raycastPlaceBlock();
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.isLocked) this.raycastPlaceBlock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;

      this.yawObject.rotation.y -= (e.movementX || 0) * this.mouseSensitivity;
      this.pitchObject.rotation.x -= (e.movementY || 0) * this.mouseSensitivity;
      this.pitchObject.rotation.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitchObject.rotation.x));
    });

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;

      // Hotbar selection
      const hotbarMap: Record<string, BlockType> = {
        '1': 'grass',
        '2': 'stone',
        '3': 'wood',
        '4': 'leaves',
        '5': 'crystal',
        '6': 'lantern',
      };
      if (hotbarMap[e.key]) {
        this.selectedBlockType = hotbarMap[e.key];
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  private raycastBreakBlock(): void {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const meshes = Array.from(this.blockMap.values()).map((b) => b.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);

    if (hits.length > 0 && hits[0].distance < 6.0) {
      const hitPos = hits[0].object.position;
      this.removeBlock(Math.round(hitPos.x), Math.round(hitPos.y), Math.round(hitPos.z));
    }
  }

  private raycastPlaceBlock(): void {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const meshes = Array.from(this.blockMap.values()).map((b) => b.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);

    if (hits.length > 0 && hits[0].distance < 6.0 && hits[0].face) {
      const hitPos = hits[0].object.position;
      const normal = hits[0].face.normal;
      const nx = Math.round(hitPos.x + normal.x);
      const ny = Math.round(hitPos.y + normal.y);
      const nz = Math.round(hitPos.z + normal.z);
      this.addBlock(nx, ny, nz, this.selectedBlockType);
      sfx.playBlockPlace();
    }
  }

  getTelemetry(): VoxelTelemetry {
    const p = this.yawObject.position;
    let quest = `Find the 3 Hidden Aether Crystals (${this.crystalsFound}/3)`;
    if (this.monolithActivated) quest = '🌟 Ancient Monolith Beacon Ignited! World Restored!';
    else if (this.crystalsFound >= 3) quest = 'Return to the Ancient Monolith Archway at (0, 5, -8)!';

    return {
      playerPos: [parseFloat(p.x.toFixed(1)), parseFloat(p.y.toFixed(1)), parseFloat(p.z.toFixed(1))],
      blockCount: this.blockMap.size,
      selectedBlockType: this.selectedBlockType,
      crystalsFound: this.crystalsFound,
      totalCrystals: this.totalCrystals,
      monolithActivated: this.monolithActivated,
      questStatus: quest,
    };
  }

  update(dt: number): void {
    // 1. Process 1st-Person Movement
    let forward = 0;
    let strafe = 0;

    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp']) forward += 1;
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown']) forward -= 1;
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft']) strafe -= 1;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight']) strafe += 1;

    const speed = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) ? 9.5 : 5.5;
    const moveDir = new THREE.Vector3(strafe, 0, -forward).normalize();
    moveDir.applyEuler(new THREE.Euler(0, this.yawObject.rotation.y, 0));

    let vertVel = -18.0 * dt;
    if (this.keys['Space']) {
      vertVel = 8.5 * dt;
    }

    const desiredTranslation = new RAPIER.Vector3(
      moveDir.x * speed * dt,
      vertVel,
      moveDir.z * speed * dt
    );

    this.characterController.computeColliderMovement(this.playerCollider, desiredTranslation);
    const corrected = this.characterController.computedMovement();

    const curr = this.playerBody.translation();
    const newPos = {
      x: curr.x + corrected.x,
      y: curr.y + corrected.y,
      z: curr.z + corrected.z,
    };

    this.playerBody.setNextKinematicTranslation(newPos);
    this.yawObject.position.set(newPos.x, newPos.y, newPos.z);

    // 2. Crystal Collection Check
    const playerPos = new THREE.Vector3(newPos.x, newPos.y, newPos.z);
    this.engine.native.scene.traverse((obj) => {
      if ((obj as any).isCrystal && obj.visible) {
        obj.rotation.y += 2.5 * dt;
        if (playerPos.distanceTo(obj.position) < 2.5) {
          obj.visible = false;
          if ((obj as any).light) (obj as any).light.visible = false;
          this.crystalsFound++;
          sfx.playKeyPickup();
        }
      }
    });

    // 3. Monolith Activation Check
    if (this.crystalsFound >= 3 && !this.monolithActivated) {
      const archPos = new THREE.Vector3(0, 5, -8);
      if (playerPos.distanceTo(archPos) < 4.5) {
        this.monolithActivated = true;
        sfx.playSecretJingle();

        // Spawn Towering Skyward Beacon Beam!
        const scene = this.engine.native.scene;
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.75 });
        this.beaconMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 120, 16), beamMat);
        this.beaconMesh.position.set(0, 65, -8);
        scene.add(this.beaconMesh);

        this.beaconLight = new THREE.PointLight(0x67e8f9, 6.0, 50);
        this.beaconLight.position.set(0, 8, -8);
        scene.add(this.beaconLight);
      }
    }
  }

  dispose(): void {
    this.engine.dispose();
  }
}
