/**
 * Parcel Types & Delivery Cargo Definitions
 */

export type ParcelKind =
  | 'letter'
  | 'strudel'
  | 'fondue'
  | 'clock'
  | 'cheese_wheel'
  | 'flowers'
  | 'tools'
  | 'medicine';

export interface ParcelConfig {
  kind: ParcelKind;
  name: string;
  senderName: string;
  recipientName: string;
  description: string;
  massKg: number;
  fragility: number; // 0 (indestructible) to 1.0 (glass/clock)
  maxImpactSpeedMs: number;
  hasWarmthTimer?: boolean;
  warmthDurationSeconds?: number;
  canRollDownhill?: boolean;
  baseRewardFrancs: number;
  trustStampsReward: number;
  colorHex: number;
}

export interface ParcelState {
  config: ParcelConfig;
  currentHealth: number; // 100 to 0
  warmthSecondsLeft: number;
  isLatched: boolean;
  isDelivered: boolean;
  isBroken: boolean;
  hasParachute: boolean;
  parachuteDeployed: boolean;
  distanceToTargetM: number;
}
