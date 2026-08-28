/**
 * Flight Physics & Vehicle Types for AlpenDrop
 */

export type VehicleClass = 'drone' | 'plane';

export type DroneModelId = 'sparrow_tier1' | 'swallow_tier2' | 'titan_tier3';
export type PlaneModelId = 'zephyr_tier1' | 'aeolus_tier2';
export type VehicleId = DroneModelId | PlaneModelId;

export interface FlightTelemetry {
  vehicleId: VehicleId;
  vehicleName: string;
  vehicleClass: VehicleClass;
  speedKmh: number;
  altitudeM: number;
  verticalSpeedMs: number;
  throttlePercent: number;
  batteryPercent: number;
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
  isAirborne: boolean;
  isStalling: boolean;
  windSpeedMs: number;
  windHeadingDeg: number;
  inThermalUpdraft: boolean;
  activeWindAlert?: string | null;
  devAssistsEnabled: boolean;
  magneticLatchArmed: boolean;
  hasCargoAttached: boolean;
  viewMode: 'chase' | 'cockpit' | 'sling';
}

export interface VehicleSpecs {
  id: VehicleId;
  name: string;
  vehicleClass: VehicleClass;
  tier: number;
  price: number;
  description: string;
  massKg: number;
  maxThrustN: number;
  maxAirspeedKmh: number;
  stallSpeedKmh: number; // for planes
  glideRatio: number; // for planes
  torqueRollPitch: number;
  torqueYaw: number;
  linearDrag: [number, number, number];
  angularDrag: [number, number, number];
  baseGyroAssist: number; // 0.0 (raw authentic slop) to 1.0 (fully assisted)
  batteryCapacitySeconds: number;
  maxPayloadKg: number;
  slingLengthM: number;
  magneticRadiusM: number;
}

export interface FlightInputState {
  throttleUp: boolean;
  throttleDown: boolean;
  pitchForward: boolean;
  pitchBack: boolean;
  rollLeft: boolean;
  rollRight: boolean;
  yawLeft: boolean;
  yawRight: boolean;
  releaseCargo: boolean;
  toggleMagnet: boolean;
  toggleDevAssist: boolean;
  switchCamera: boolean;
}
