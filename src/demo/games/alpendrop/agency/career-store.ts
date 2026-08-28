/**
 * Agency Career State Store & Economy
 * Tracks player Francs balance, trust stamps, unlocked vehicles, assist upgrades, and dev toggle.
 */

import { VEHICLE_CATALOG } from '../flight/specs.js';
import type { VehicleId } from '../flight/types.js';

export interface UpgradeItem {
  id: string;
  name: string;
  category: 'stability' | 'landing' | 'battery' | 'utility';
  tier: number;
  costFrancs: number;
  requiredStamps: number;
  description: string;
  icon: string;
}

export const AGENCY_UPGRADES: UpgradeItem[] = [
  {
    id: 'gyro_1',
    name: 'Gyroscope Stabilizer MK I',
    category: 'stability',
    tier: 1,
    costFrancs: 120,
    requiredStamps: 2,
    description: 'Dampens high-frequency wobbles and gently helps the craft return to level.',
    icon: '🧭',
  },
  {
    id: 'gyro_2',
    name: 'Gyroscope Stabilizer MK II',
    category: 'stability',
    tier: 2,
    costFrancs: 280,
    requiredStamps: 6,
    description: 'Advanced solid-state IMU. Strong auto-leveling return and wind-shear resistance.',
    icon: '🧭',
  },
  {
    id: 'gyro_3',
    name: 'Precision Gimbal Matrix',
    category: 'stability',
    tier: 3,
    costFrancs: 550,
    requiredStamps: 12,
    description: 'Pro-grade cinematic flight controller. Rock-solid hover with near-zero drift.',
    icon: '🎯',
  },
  {
    id: 'auto_hover',
    name: 'Barometric Altitude Hold',
    category: 'stability',
    tier: 2,
    costFrancs: 220,
    requiredStamps: 4,
    description: 'Maintains hover altitude when throttle is released, preventing sudden drops.',
    icon: '📏',
  },
  {
    id: 'cushioned_skids',
    name: 'Hydraulic Cushion Skids',
    category: 'landing',
    tier: 1,
    costFrancs: 150,
    requiredStamps: 3,
    description: 'Absorbs hard ground impacts with zero bounce, protecting delicate parcels.',
    icon: '🛬',
  },
  {
    id: 'parachute_kit',
    name: 'Emergency Mini-Parachutes',
    category: 'utility',
    tier: 2,
    costFrancs: 340,
    requiredStamps: 5,
    description: 'Parcels dropped from high altitude automatically deploy mini-parachutes.',
    icon: '🪂',
  },
  {
    id: 'extended_battery',
    name: 'High-Density Graphene LiPo',
    category: 'battery',
    tier: 1,
    costFrancs: 200,
    requiredStamps: 4,
    description: 'Increases flight range and maximum flight duration by +50%.',
    icon: '🔋',
  },
];

export class CareerStore {
  francBalance: number = 75; // Starter seed money
  trustStamps: number = 0;
  completedDeliveries: number = 0;

  ownedVehicles: Set<VehicleId> = new Set(['sparrow_tier1']);
  currentVehicleId: VehicleId = 'sparrow_tier1';

  // Upgrade Unlocks
  gyroLevel: number = 0; // 0 to 3
  autoHoverTrim: boolean = false;
  cushionedSkids: boolean = false;
  hasParachuteKit: boolean = false;
  extendedBattery: boolean = false;

  // Dev Assist Sandbox Toggle
  devAssistsEnabled: boolean = false;

  listeners: Set<() => void> = new Set();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }

  toggleDevAssists(): boolean {
    this.devAssistsEnabled = !this.devAssistsEnabled;
    this.notify();
    return this.devAssistsEnabled;
  }

  addReward(francs: number, stamps: number): void {
    this.francBalance += francs;
    this.trustStamps += stamps;
    this.completedDeliveries++;
    this.notify();
  }

  canBuyVehicle(id: VehicleId): boolean {
    const spec = VEHICLE_CATALOG[id];
    if (!spec || this.ownedVehicles.has(id)) return false;
    return this.francBalance >= spec.price;
  }

  buyVehicle(id: VehicleId): boolean {
    if (!this.canBuyVehicle(id)) return false;
    const spec = VEHICLE_CATALOG[id];
    this.francBalance -= spec.price;
    this.ownedVehicles.add(id);
    this.currentVehicleId = id;
    this.notify();
    return true;
  }

  selectVehicle(id: VehicleId): boolean {
    if (!this.ownedVehicles.has(id)) return false;
    this.currentVehicleId = id;
    this.notify();
    return true;
  }

  canBuyUpgrade(upgradeId: string): boolean {
    const up = AGENCY_UPGRADES.find((u) => u.id === upgradeId);
    if (!up) return false;
    if (this.francBalance < up.costFrancs || this.trustStamps < up.requiredStamps) return false;

    if (upgradeId.startsWith('gyro_')) {
      const targetLevel = parseInt(upgradeId.split('_')[1], 10);
      return this.gyroLevel === targetLevel - 1;
    }
    if (upgradeId === 'auto_hover') return !this.autoHoverTrim;
    if (upgradeId === 'cushioned_skids') return !this.cushionedSkids;
    if (upgradeId === 'parachute_kit') return !this.hasParachuteKit;
    if (upgradeId === 'extended_battery') return !this.extendedBattery;

    return true;
  }

  buyUpgrade(upgradeId: string): boolean {
    if (!this.canBuyUpgrade(upgradeId)) return false;
    const up = AGENCY_UPGRADES.find((u) => u.id === upgradeId)!;

    this.francBalance -= up.costFrancs;

    if (upgradeId === 'gyro_1') this.gyroLevel = 1;
    else if (upgradeId === 'gyro_2') this.gyroLevel = 2;
    else if (upgradeId === 'gyro_3') this.gyroLevel = 3;
    else if (upgradeId === 'auto_hover') this.autoHoverTrim = true;
    else if (upgradeId === 'cushioned_skids') this.cushionedSkids = true;
    else if (upgradeId === 'parachute_kit') this.hasParachuteKit = true;
    else if (upgradeId === 'extended_battery') this.extendedBattery = true;

    this.notify();
    return true;
  }
}
