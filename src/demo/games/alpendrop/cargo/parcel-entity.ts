/**
 * Dynamic Parcel Entity & Procedural 3D Models
 * Manages physical colliders, impact damage detection, high-visibility pickup beacons, and parachutes.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { ParcelConfig, ParcelKind, ParcelState } from './types.js';

/**
 * Keyed by ParcelKind so a missing or misspelled entry is a compile-time error
 * rather than an `undefined` config that blows up the Job Board at runtime.
 */
export const PARCEL_CATALOG: Record<ParcelKind, ParcelConfig> = {
  letter: {
    kind: 'letter',
    name: 'Express Alpine Letter',
    senderName: 'Postmaster Otto',
    recipientName: 'Heidi the Botanist',
    description: 'A wax-sealed telegram envelope containing urgent botanical notes.',
    massKg: 0.25,
    fragility: 0.05,
    maxImpactSpeedMs: 14.0,
    baseRewardFrancs: 50,
    trustStampsReward: 1,
    colorHex: 0xfef08a,
  },
  strudel: {
    kind: 'strudel',
    name: 'Warm Apfelstrudel',
    senderName: 'Grandma Gretel',
    recipientName: 'Brother Anselm (Monastery)',
    description: 'Freshly baked apple strudel dusted with cinnamon. Deliver before it cools!',
    massKg: 1.5,
    fragility: 0.45,
    maxImpactSpeedMs: 6.5,
    hasWarmthTimer: true,
    warmthDurationSeconds: 85,
    baseRewardFrancs: 110,
    trustStampsReward: 2,
    colorHex: 0xd97706,
  },
  fondue: {
    kind: 'fondue',
    name: 'Bubbling Fondue Cauldron',
    senderName: 'Hans the Cheesemaker',
    recipientName: 'Mayor Alois (Town Hall)',
    description: 'A heavy ceramic fondue pot with molten Gruyere and Emmental cheese.',
    massKg: 3.4,
    fragility: 0.65,
    maxImpactSpeedMs: 5.0,
    baseRewardFrancs: 175,
    trustStampsReward: 3,
    colorHex: 0xb45309,
  },
  clock: {
    kind: 'clock',
    name: 'Delicate Cuckoo Clock',
    senderName: 'Klaus the Horologist',
    recipientName: 'Greta at Meadow Farm',
    description: 'An intricate carved wooden clock with tiny brass gears and a carved bird.',
    massKg: 2.1,
    fragility: 0.95,
    maxImpactSpeedMs: 3.8,
    baseRewardFrancs: 240,
    trustStampsReward: 4,
    colorHex: 0x78350f,
  },
  cheese_wheel: {
    kind: 'cheese_wheel',
    name: '80kg Giant Cheese Wheel',
    senderName: 'Dairy Master Fritz',
    recipientName: 'Alpine Chalet Inn',
    description: 'A glorious golden wheel of aged mountain cheese. Watch out, it rolls fast!',
    massKg: 5.5,
    fragility: 0.3,
    maxImpactSpeedMs: 8.0,
    canRollDownhill: true,
    baseRewardFrancs: 190,
    trustStampsReward: 3,
    colorHex: 0xfacc15,
  },
  flowers: {
    kind: 'flowers',
    name: 'Rare Alpine Edelweiss',
    senderName: 'Heidi the Botanist',
    recipientName: 'Grandma Gretel',
    description: 'Delicate wild mountain flowers freshly picked from cliffside ledges.',
    massKg: 0.7,
    fragility: 0.6,
    maxImpactSpeedMs: 5.5,
    baseRewardFrancs: 130,
    trustStampsReward: 2,
    colorHex: 0x38bdf8,
  },
  tools: {
    kind: 'tools',
    name: 'Heavy Climbing Gear Crate',
    senderName: 'Mountain Rescue Ulrich',
    recipientName: 'Monk Cliff Outpost',
    description: 'Heavy steel pitons, ice axes, and climbing ropes for high peak expeditions.',
    massKg: 7.8,
    fragility: 0.15,
    maxImpactSpeedMs: 10.0,
    baseRewardFrancs: 280,
    trustStampsReward: 4,
    colorHex: 0x475569,
  },
  medicine: {
    kind: 'medicine',
    name: 'Emergency Antibiotics Case',
    senderName: 'Dr. Vogel (Town Clinic)',
    recipientName: 'Father Thomas (Monastery)',
    description: 'A sealed insulated case of temperature-sensitive antibiotic vials.',
    massKg: 1.1,
    fragility: 0.8,
    maxImpactSpeedMs: 4.2,
    baseRewardFrancs: 260,
    trustStampsReward: 4,
    colorHex: 0xe2e8f0,
  },
};

export class ParcelEntity {
  readonly config: ParcelConfig;
  readonly state: ParcelState;
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  private parachuteMesh: THREE.Mesh | null = null;
  private pickupBeaconGroup: THREE.Group;
  private pickupArrow: THREE.Mesh;
  private lastVelocity = new THREE.Vector3();
  private hookNode: THREE.Object3D;
  private animTimer: number = 0;

  onBreak?: () => void;
  onImpact?: (impactSpeed: number) => void;

  constructor(
    world: RAPIER.World,
    config: ParcelConfig,
    spawnPosition: [number, number, number],
    hasParachute: boolean = false
  ) {
    this.config = config;
    this.state = {
      config,
      currentHealth: 100.0,
      warmthSecondsLeft: config.warmthDurationSeconds ?? 0,
      isLatched: false,
      isDelivered: false,
      isBroken: false,
      hasParachute,
      parachuteDeployed: false,
      distanceToTargetM: 999,
    };

    // 1. Build 3D Mesh
    this.mesh = this.buildMesh(config);
    this.mesh.position.set(...spawnPosition);

    // 2. Magnetic Hook Node on top of parcel
    this.hookNode = new THREE.Object3D();
    this.hookNode.position.set(0, 0.28, 0);
    this.mesh.add(this.hookNode);

    // 3. High-Visibility Pickup Hologram Beacon & Arrow
    this.pickupBeaconGroup = this.buildPickupBeacon();
    this.mesh.add(this.pickupBeaconGroup);
    this.pickupArrow = this.pickupBeaconGroup.children[1] as THREE.Mesh;

    // 4. Parachute visual
    this.parachuteMesh = this.buildParachute();
    this.parachuteMesh.visible = false;
    this.mesh.add(this.parachuteMesh);

    // 5. Build Rapier Physics Body & Collider
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...spawnPosition)
      .setLinearDamping(0.4)
      .setAngularDamping(0.6);

    this.body = world.createRigidBody(bodyDesc);

    let colliderDesc: RAPIER.ColliderDesc;
    if (config.kind === 'cheese_wheel') {
      colliderDesc = RAPIER.ColliderDesc.cylinder(0.18, 0.35)
        .setFriction(0.25)
        .setRestitution(0.45);
    } else if (config.kind === 'letter') {
      colliderDesc = RAPIER.ColliderDesc.cuboid(0.2, 0.05, 0.25)
        .setFriction(0.6)
        .setRestitution(0.1);
    } else {
      colliderDesc = RAPIER.ColliderDesc.cuboid(0.28, 0.28, 0.28)
        .setFriction(0.5)
        .setRestitution(0.2);
    }

    colliderDesc.setMass(config.massKg);
    this.collider = world.createCollider(colliderDesc, this.body);
  }

  private buildPickupBeacon(): THREE.Group {
    const beaconGroup = new THREE.Group();

    // High vertical glowing beam
    const matBeam = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 35, 12, 1, true), matBeam);
    beam.position.y = 17.5;

    // Bouncing Golden Pointer Diamond Arrow
    const matArrow = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const arrow = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), matArrow);
    arrow.position.y = 2.2;

    // Concentric Base Ring
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 16), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;

    beaconGroup.add(beam, arrow, ring);
    return beaconGroup;
  }

  private buildMesh(config: ParcelConfig): THREE.Group {
    const group = new THREE.Group();
    const matCardboard = new THREE.MeshStandardMaterial({ color: 0xc2884a, roughness: 0.8 });
    const matString = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.3 });
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
    const matAccent = new THREE.MeshStandardMaterial({ color: config.colorHex, roughness: 0.4 });

    // Magnetic Latch Ring on top
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 16), matMetal);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.26;
    group.add(ring);

    switch (config.kind) {
      case 'letter': {
        const envelope = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.3), matCardboard);
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), matAccent);
        seal.position.y = 0.035;
        group.add(envelope, seal);
        break;
      }
      case 'cheese_wheel': {
        // High-poly 32-segment giant Gruyere cheese wheel with wooden aging rind
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 32), matAccent);
        wheel.castShadow = true;
        const stamp = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 24), matMetal);
        stamp.rotation.x = -Math.PI / 2;
        stamp.position.y = 0.145;
        const wedgeCut = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.29, 0.18), matString);
        wedgeCut.position.set(0.24, 0, 0.24);
        wedgeCut.rotation.y = Math.PI / 4;
        group.add(wheel, stamp);
        break;
      }
      case 'fondue': {
        // Cast-iron cauldron with twin curved brass handles
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.36, 24), matMetal);
        pot.castShadow = true;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 12, 24), matMetal);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.18;
        const cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 24), matAccent);
        cheese.position.y = 0.15;
        // Twin handles
        const handleL = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16), matMetal);
        handleL.position.set(-0.35, 0.12, 0);
        const handleR = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16), matMetal);
        handleR.position.set(0.35, 0.12, 0);
        group.add(pot, rim, cheese, handleL, handleR);
        break;
      }
      case 'clock': {
        // Handcrafted Alpine Chalet Cuckoo Clock
        const caseBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.28), matCardboard);
        caseBox.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.28, 4), matMetal);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 0.41;
        const dial = new THREE.Mesh(new THREE.CircleGeometry(0.14, 24), matString);
        dial.position.set(0, 0.05, 0.145);
        // Hanging brass pendulum weights
        const weightL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 12), matMetal);
        weightL.position.set(-0.1, -0.36, 0.05);
        const weightR = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 12), matMetal);
        weightR.position.set(0.1, -0.36, 0.05);
        group.add(caseBox, roof, dial, weightL, weightR);
        break;
      }
      case 'strudel': {
        // Woven pastry crate with decorative ribbon
        const bakeryBox = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.36), matCardboard);
        bakeryBox.castShadow = true;
        const ribbonX = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.25, 0.08), matAccent);
        const ribbonZ = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.37), matAccent);
        const bow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), matAccent);
        bow.position.y = 0.14;
        group.add(bakeryBox, ribbonX, ribbonZ, bow);
        break;
      }
      case 'flowers': {
        // Wooden planter crate with floral arrangement
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.32, 16), matCardboard);
        pot.castShadow = true;
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 }));
        foliage.position.y = 0.22;
        const flower1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), matAccent);
        flower1.position.set(0.12, 0.35, 0.08);
        const flower2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), matAccent);
        flower2.position.set(-0.1, 0.38, -0.06);
        group.add(pot, foliage, flower1, flower2);
        break;
      }
      case 'medicine': {
        // White insulated medical case with a red cross on the lid
        const shell = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.32, 0.34),
          new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45 })
        );
        shell.castShadow = true;
        const matCross = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.22), matCross);
        crossV.position.y = 0.16;
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.075), matCross);
        crossH.position.y = 0.16;
        const latch = new THREE.Mesh(
          new THREE.BoxGeometry(0.48, 0.035, 0.36),
          new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.35, metalness: 0.6 })
        );
        group.add(shell, crossV, crossH, latch);
        break;
      }
      default: {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), matCardboard);
        box.castShadow = true;
        const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.41, 0.1), matString);
        const band2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.41, 0.51), matString);
        group.add(box, band1, band2);
        break;
      }
    }

    return group;
  }

  private buildParachute(): THREE.Mesh {
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      canopyMat
    );
    canopy.position.y = 1.25;
    return canopy;
  }

  getHookWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.hookNode.getWorldPosition(out);
  }

  update(dt: number, groundHeight: number): void {
    if (this.state.isBroken) return;

    this.animTimer += dt;

    // Sync Three.js mesh with Rapier Body
    const p = this.body.translation();
    const q = this.body.rotation();
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);

    // Bouncing diamond arrow animation
    this.pickupArrow.position.y = 2.0 + Math.sin(this.animTimer * 4.0) * 0.35;
    this.pickupArrow.rotation.y += 2.0 * dt;

    // Hide pickup beacon once latched on sling
    this.pickupBeaconGroup.visible = !this.state.isLatched && !this.state.isDelivered;

    const vel = this.body.linvel();
    const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

    // Warmth Timer decay
    if (this.config.hasWarmthTimer && this.state.warmthSecondsLeft > 0) {
      this.state.warmthSecondsLeft = Math.max(0, this.state.warmthSecondsLeft - dt);
    }

    // Parachute Drag Physics
    if (this.state.hasParachute && !this.state.isLatched) {
      const alt = p.y - groundHeight;
      if (alt > 3.0 && vel.y < -3.0) {
        this.state.parachuteDeployed = true;
        if (this.parachuteMesh) this.parachuteMesh.visible = true;
      }
      if (this.state.parachuteDeployed) {
        if (vel.y < -2.6) {
          const upwardDrag = Math.min(25.0, (-2.6 - vel.y) * 14.0);
          this.body.applyImpulse({ x: -vel.x * 0.5 * dt, y: upwardDrag * dt, z: -vel.z * 0.5 * dt }, true);
        }
        if (alt <= 0.35) {
          this.state.parachuteDeployed = false;
          if (this.parachuteMesh) this.parachuteMesh.visible = false;
        }
      }
    }

    // Impact Detection
    const deltaV = Math.abs(currentSpeed - this.lastVelocity.length());
    if (deltaV > this.config.maxImpactSpeedMs && !this.state.isLatched) {
      const damage = ((deltaV - this.config.maxImpactSpeedMs) / this.config.maxImpactSpeedMs) * 100 * this.config.fragility;
      this.state.currentHealth = Math.max(0, this.state.currentHealth - damage);
      this.onImpact?.(deltaV);

      if (this.state.currentHealth <= 0) {
        this.breakParcel();
      }
    }

    this.lastVelocity.set(vel.x, vel.y, vel.z);
  }

  breakParcel(): void {
    if (this.state.isBroken) return;
    this.state.isBroken = true;
    this.state.currentHealth = 0;
    this.mesh.scale.set(0.6, 0.3, 0.6);
    this.pickupBeaconGroup.visible = false;
    this.onBreak?.();
  }

  dispose(world: RAPIER.World): void {
    world.removeCollider(this.collider, false);
    world.removeRigidBody(this.body);
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
      }
    });
  }
}
