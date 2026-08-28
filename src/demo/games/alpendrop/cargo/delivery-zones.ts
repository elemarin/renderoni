/**
 * Delivery Drop Zones & Precision Landing Targets
 * Manages destination drop pads, pulsing beacon rings, and delivery score evaluation.
 * Generous detection tolerances and smooth delivery confirmation.
 */

import * as THREE from 'three';
import type { ParcelEntity } from './parcel-entity.js';

export interface DeliveryZoneConfig {
  id: string;
  name: string;
  locationDescription: string;
  position: [number, number, number];
  radius: number;
  colorHex: number;
}

export interface DeliveryEvaluation {
  success: boolean;
  baseReward: number;
  timeBonus: number;
  conditionBonus: number;
  precisionBonus: number;
  totalRewardFrancs: number;
  trustStampsEarned: number;
  accuracyGrade: 'S' | 'A' | 'B' | 'C' | 'F';
  feedbackText: string;
}

export class DeliveryZoneManager {
  private scene: THREE.Scene;
  private zones: Map<
    string,
    {
      config: DeliveryZoneConfig;
      group: THREE.Group;
      beaconMesh: THREE.Mesh;
      outerRing: THREE.Mesh;
      innerRing: THREE.Mesh;
      diamond: THREE.Mesh;
    }
  > = new Map();
  private pulseTimer: number = 0;
  private activeZoneId: string | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  registerZone(config: DeliveryZoneConfig): void {
    const group = new THREE.Group();
    group.position.set(...config.position);

    // 1. Base Concentric Glowing Target Rings on Ground
    const matRing = new THREE.MeshBasicMaterial({
      color: config.colorHex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(config.radius * 0.78, config.radius, 32), matRing);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.08;

    const innerRing = new THREE.Mesh(new THREE.RingGeometry(config.radius * 0.32, config.radius * 0.48, 24), matRing);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.09;

    const centerBullseye = new THREE.Mesh(new THREE.CircleGeometry(config.radius * 0.18, 16), matRing);
    centerBullseye.rotation.x = -Math.PI / 2;
    centerBullseye.position.y = 0.1;

    // 2. High Vertical Light Pillar
    const matBeam = new THREE.MeshBasicMaterial({
      color: config.colorHex,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(config.radius * 0.45, config.radius * 0.75, 80, 16, 1, true),
      matBeam
    );
    beam.position.y = 40.0;

    // 3. Floating 3D Target Hologram Diamond
    const matHolo = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), matHolo);
    diamond.position.y = 6.0;

    group.add(outerRing, innerRing, centerBullseye, beam, diamond);
    group.visible = false;
    this.scene.add(group);

    this.zones.set(config.id, { config, group, beaconMesh: beam, outerRing, innerRing, diamond });
  }

  setActiveZone(zoneId: string | null): void {
    this.activeZoneId = zoneId;
    this.zones.forEach((zone, id) => {
      zone.group.visible = id === zoneId;
    });
  }

  update(dt: number): void {
    this.pulseTimer += dt * 3.2;

    if (!this.activeZoneId) return;
    const active = this.zones.get(this.activeZoneId);
    if (!active) return;

    // Pulse Outer Ring Scale
    const scale = 1.0 + Math.sin(this.pulseTimer) * 0.08;
    active.outerRing.scale.set(scale, scale, 1.0);

    // Rotate & Bob Diamond
    active.diamond.rotation.y += 1.8 * dt;
    active.diamond.position.y = 6.0 + Math.sin(this.pulseTimer * 0.8) * 0.6;

    // Pulse Beam Opacity
    (active.beaconMesh.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(this.pulseTimer * 1.5) * 0.12;
  }

  getZone(id: string): DeliveryZoneConfig | undefined {
    return this.zones.get(id)?.config;
  }

  checkDelivery(
    zoneId: string,
    parcel: ParcelEntity,
    totalOrderTimeSeconds: number,
    timeElapsedSeconds: number
  ): DeliveryEvaluation | null {
    const zone = this.zones.get(zoneId);
    if (!zone) return null;

    const pos = parcel.body.translation();
    const vel = parcel.body.linvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

    const dx = pos.x - zone.config.position[0];
    const dz = pos.z - zone.config.position[2];
    const distToCenter = Math.sqrt(dx * dx + dz * dz);

    // Generous horizontal radius and generous vertical height window (+- 6.5m)
    const isInsideRadius = distToCenter <= zone.config.radius * 1.25;
    const isInsideHeight = Math.abs(pos.y - zone.config.position[1]) < 6.5;
    const isSlow = speed < 3.2; // Generous settling speed

    if (!isInsideRadius || !isInsideHeight || !isSlow) {
      return null;
    }

    const baseReward = parcel.config.baseRewardFrancs;
    const condition = parcel.state.currentHealth / 100.0;

    const precisionFactor = Math.max(0, 1.0 - distToCenter / (zone.config.radius * 1.25));
    const precisionBonus = Math.round(precisionFactor * 50);

    const timeRemaining = Math.max(0, totalOrderTimeSeconds - timeElapsedSeconds);
    const timeRatio = totalOrderTimeSeconds > 0 ? timeRemaining / totalOrderTimeSeconds : 0;
    const timeBonus = Math.round(baseReward * timeRatio * 0.6);

    const conditionBonus = Math.round(baseReward * (condition - 0.5));

    const totalFrancs = Math.max(
      15,
      Math.round((baseReward + timeBonus + conditionBonus + precisionBonus) * Math.max(0.25, condition))
    );

    let grade: DeliveryEvaluation['accuracyGrade'] = 'C';
    let feedback = 'Delivered! The recipient was pleased.';

    if (condition < 0.3) {
      grade = 'F';
      feedback = 'The parcel arrived battered! Grandma is not pleased...';
    } else if (precisionFactor > 0.7 && condition > 0.85) {
      grade = 'S';
      feedback = 'Bullseye! Pristine condition and astonishing speed. Perfection!';
    } else if (precisionFactor > 0.4 && condition > 0.65) {
      grade = 'A';
      feedback = 'Great flying! Right onto the landing pad in one piece.';
    } else if (condition > 0.5) {
      grade = 'B';
      feedback = 'A little bumpy, but the goods arrived safely.';
    }

    parcel.state.isDelivered = true;

    return {
      success: true,
      baseReward,
      timeBonus,
      conditionBonus,
      precisionBonus,
      totalRewardFrancs: totalFrancs,
      trustStampsEarned: grade === 'S' ? 2 : 1,
      accuracyGrade: grade,
      feedbackText: feedback,
    };
  }
}
