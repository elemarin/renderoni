/**
 * High-Visibility 3D Braided Winch Cable & Industrial Electro-Magnet Crane System
 * Features a thick high-contrast cable, massive heavy-duty electromagnet lifter head with
 * glowing status rings, and strong magnetic snap suction.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { ParcelEntity } from './parcel-entity.js';

const _vAnchorWorld = new THREE.Vector3();
const _vHookWorld = new THREE.Vector3();
const _vTetherDelta = new THREE.Vector3();
const _vTetherDir = new THREE.Vector3();
const _vRelVel = new THREE.Vector3();
const _vTensionForce = new THREE.Vector3();

export class MagneticSlingSystem {
  private world: RAPIER.World;
  private aircraftBody: RAPIER.RigidBody;
  private anchorObject: THREE.Object3D;
  private scene: THREE.Scene;

  // Sling Properties
  slingLength: number = 1.4;
  magneticRadius: number = 5.5; // Generous 5.5m magnetic suction radius!
  springStiffness: number = 700.0;
  springDamping: number = 40.0;

  // Latch State
  isArmed: boolean = true;
  latchedParcel: ParcelEntity | null = null;
  dropCooldown: number = 0; // Cooldown prevents instant re-snap on drop!
  lastDroppedParcel: ParcelEntity | null = null;

  // Visuals: Heavy 3D Braided Cable & Industrial Magnet Assembly
  private cableMesh: THREE.Mesh;
  private magnetGroup: THREE.Group;
  private magnetLight: THREE.PointLight;
  private matCable = new THREE.MeshStandardMaterial({
    color: 0xfacc15, // High-visibility safety gold/yellow
    roughness: 0.4,
    metalness: 0.7,
  });
  private matMagnetHousing = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.85,
  });
  private matCopperCoil = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    roughness: 0.3,
    metalness: 0.9,
  });
  private matGlowRing: THREE.MeshBasicMaterial;

  onLatch?: (parcel: ParcelEntity) => void;
  onDrop?: (parcel: ParcelEntity) => void;

  constructor(
    world: RAPIER.World,
    aircraftBody: RAPIER.RigidBody,
    anchorObject: THREE.Object3D,
    scene: THREE.Scene,
    slingLength: number = 1.4,
    magneticRadius: number = 5.5
  ) {
    this.world = world;
    this.aircraftBody = aircraftBody;
    this.anchorObject = anchorObject;
    this.scene = scene;
    this.slingLength = slingLength;
    this.magneticRadius = magneticRadius;

    // 1. Thick 3D Braided Winch Cable Cylinder (Radius 0.035m = 7cm thick!)
    const cableGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 12);
    cableGeo.translate(0, -0.5, 0); // Origin at top attachment point
    this.cableMesh = new THREE.Mesh(cableGeo, this.matCable);
    this.cableMesh.castShadow = true;
    this.scene.add(this.cableMesh);

    // 2. Heavy Industrial Electro-Magnet Lifter Head (Width 0.55m)
    this.magnetGroup = new THREE.Group();

    // Top Heavy Shackle / Eye-Bolt
    const shackle = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.025, 12, 20),
      this.matMagnetHousing
    );
    shackle.position.y = 0.16;
    shackle.rotation.x = Math.PI / 2;

    // Heavy Industrial Steel Magnet Body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.28, 0.16, 20),
      this.matMagnetHousing
    );
    body.castShadow = true;

    // Dual Copper Induction Coils
    const coil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.06, 20),
      this.matCopperCoil
    );
    coil.position.y = 0.02;

    // Magnetic Core Bottom Flange
    const bottomPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.04, 20),
      this.matMagnetHousing
    );
    bottomPlate.position.y = -0.09;

    // Glowing Neon Status Ring
    this.matGlowRing = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.03, 12, 24),
      this.matGlowRing
    );
    glowRing.position.y = -0.11;
    glowRing.rotation.x = Math.PI / 2;

    // Point Light for dramatic night/ground illumination
    this.magnetLight = new THREE.PointLight(0x38bdf8, 1.8, 4.5);
    this.magnetLight.position.y = -0.15;

    this.magnetGroup.add(shackle, body, coil, bottomPlate, glowRing, this.magnetLight);
    this.scene.add(this.magnetGroup);

    this.updateMagnetMaterial();
  }

  setSpecs(slingLength: number, magneticRadius: number): void {
    this.slingLength = slingLength;
    this.magneticRadius = magneticRadius;
  }

  toggleArm(armed?: boolean): void {
    this.isArmed = armed !== undefined ? armed : !this.isArmed;
    if (!this.isArmed && this.latchedParcel) {
      this.dropCargo();
    } else if (this.isArmed) {
      this.dropCooldown = 0; // Immediate re-arm when manually pressed
    }
    this.updateMagnetMaterial();
  }

  dropCargo(): ParcelEntity | null {
    if (!this.latchedParcel) return null;
    const dropped = this.latchedParcel;
    dropped.state.isLatched = false;

    // Fling parcel with forward momentum of the aircraft + clean separation!
    const aVel = this.aircraftBody.linvel();
    dropped.body.setLinvel(
      {
        x: aVel.x * 1.15,
        y: Math.min(-0.5, aVel.y - 1.2), // Downward separation velocity
        z: aVel.z * 1.15,
      },
      true
    );

    this.lastDroppedParcel = dropped;
    this.dropCooldown = 3.5; // 3.5s cooldown so it doesn't instantly re-snap!
    this.latchedParcel = null;
    this.updateMagnetMaterial();
    this.onDrop?.(dropped);
    return dropped;
  }

  attachCargo(parcel: ParcelEntity): boolean {
    if (parcel.state.isBroken || parcel.state.isDelivered) return false;
    this.latchedParcel = parcel;
    parcel.state.isLatched = true;
    this.dropCooldown = 0;
    this.lastDroppedParcel = null;
    this.updateMagnetMaterial();
    this.onLatch?.(parcel);
    return true;
  }

  updateVisuals(): void {
    this.anchorObject.getWorldPosition(_vAnchorWorld);

    if (this.latchedParcel) {
      const pPos = this.latchedParcel.body.translation();
      _vHookWorld.set(pPos.x, pPos.y + 0.35, pPos.z);
    } else {
      _vHookWorld.copy(_vAnchorWorld).add(new THREE.Vector3(0, -this.slingLength, 0));
    }

    _vTetherDelta.subVectors(_vHookWorld, _vAnchorWorld);
    const tetherDist = _vTetherDelta.length();

    this.cableMesh.position.copy(_vAnchorWorld);
    if (tetherDist > 0.001) {
      this.cableMesh.scale.set(1.0, tetherDist, 1.0);
      this.cableMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        _vTetherDelta.clone().normalize()
      );
    }

    this.magnetGroup.position.copy(_vHookWorld);
    if (tetherDist > 0.001) {
      this.magnetGroup.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        _vTetherDelta.clone().normalize().negate()
      );
    }
  }

  step(dt: number, activeParcels: ParcelEntity[]): void {
    if (this.dropCooldown > 0) {
      this.dropCooldown -= dt;
      if (this.dropCooldown <= 0) {
        this.lastDroppedParcel = null;
      }
    }

    this.updateVisuals();

    // 3. Physics Spring Forces when Parcel is Latched
    if (this.latchedParcel) {
      const parcelBody = this.latchedParcel.body;
      const pPos = parcelBody.translation();
      const pVel = parcelBody.linvel();
      const aVel = this.aircraftBody.linvel();

      _vTetherDelta.set(pPos.x - _vAnchorWorld.x, pPos.y + 0.35 - _vAnchorWorld.y, pPos.z - _vAnchorWorld.z);
      const currentDist = _vTetherDelta.length();

      if (currentDist > this.slingLength * 0.4) {
        _vTetherDir.copy(_vTetherDelta).normalize();
        const stretch = currentDist - this.slingLength;

        _vRelVel.set(pVel.x - aVel.x, pVel.y - aVel.y, pVel.z - aVel.z);
        const dampingForce = _vRelVel.dot(_vTetherDir) * this.springDamping;

        const forceMagnitude = Math.max(0, stretch * this.springStiffness + dampingForce);
        _vTensionForce.copy(_vTetherDir).multiplyScalar(forceMagnitude);

        // Pull parcel toward aircraft
        parcelBody.applyImpulse(
          {
            x: -_vTensionForce.x * dt,
            y: -_vTensionForce.y * dt,
            z: -_vTensionForce.z * dt,
          },
          true
        );

        // Pull aircraft toward parcel (Newton's 3rd Law)
        this.aircraftBody.applyImpulse(
          {
            x: _vTensionForce.x * 0.45 * dt,
            y: _vTensionForce.y * 0.45 * dt,
            z: _vTensionForce.z * 0.45 * dt,
          },
          true
        );
      }
    } else if (this.isArmed && this.dropCooldown <= 0) {
      // 4. Magnetic Suction & Lock-On Scan
      const magnetPos = this.magnetGroup.position;

      for (const parcel of activeParcels) {
        if (parcel === this.lastDroppedParcel) continue;
        if (parcel.state.isBroken || parcel.state.isDelivered) continue;

        const pPos = parcel.body.translation();
        const dist = Math.hypot(pPos.x - magnetPos.x, pPos.y - magnetPos.y, pPos.z - magnetPos.z);

        if (dist < this.magneticRadius) {
          // Powerful Magnetic Pull toward the Electromagnet Head!
          const pullFactor = (1 - dist / this.magneticRadius) * 28.0;
          const dirX = (magnetPos.x - pPos.x) / dist;
          const dirY = (magnetPos.y - pPos.y) / dist;
          const dirZ = (magnetPos.z - pPos.z) / dist;

          parcel.body.applyImpulse(
            {
              x: dirX * pullFactor * dt,
              y: dirY * pullFactor * dt,
              z: dirZ * pullFactor * dt,
            },
            true
          );

          // Snap Latch Threshold (0.95m)
          if (dist < 0.95) {
            this.attachCargo(parcel);
            break;
          }
        }
      }
    }
  }

  getMagnetWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.magnetGroup.position);
  }

  private updateMagnetMaterial(): void {
    if (!this.matGlowRing || !this.magnetLight) return;

    if (this.latchedParcel) {
      // Latched: Emerald Green
      this.matGlowRing.color.setHex(0x22c55e);
      this.magnetLight.color.setHex(0x22c55e);
      this.magnetLight.intensity = 2.2;
    } else if (this.isArmed) {
      // Armed: Electric Aero Blue
      this.matGlowRing.color.setHex(0x38bdf8);
      this.magnetLight.color.setHex(0x38bdf8);
      this.magnetLight.intensity = 1.8;
    } else {
      // Disarmed: Crimson Red
      this.matGlowRing.color.setHex(0xef4444);
      this.magnetLight.color.setHex(0xef4444);
      this.magnetLight.intensity = 0.8;
    }
  }

  dispose(): void {
    this.scene.remove(this.cableMesh);
    this.scene.remove(this.magnetGroup);
  }
}
