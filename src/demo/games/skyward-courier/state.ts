/**
 * Skyward Courier — Zustand Aerodynamic Telemetry State Store
 */

import { createStore } from 'zustand/vanilla';

export type FlightPhase = 'parked' | 'starting' | 'taxi' | 'takeoff_roll' | 'airborne' | 'landing_approach' | 'touchdown' | 'landed';

export interface FlightState {
  speedKmh: number;
  altitudeM: number;
  verticalSpeedMs: number;
  throttlePercent: number;
  flightPhase: FlightPhase;
  phaseLabel: string;
  engineRunning: boolean;
  wheelBrakes: boolean;
  ringsCleared: number;
  totalRings: number;
  viewMode: 'cockpit' | 'outside';
  objective: string;

  // Actions
  setTelemetry: (data: Partial<FlightState>) => void;
  setThrottle: (percent: number) => void;
  toggleEngine: () => void;
  toggleViewMode: () => void;
  setBrakes: (brakes: boolean) => void;
  resetFlight: () => void;
}

const INITIAL_STATE = {
  speedKmh: 0,
  altitudeM: 0,
  verticalSpeedMs: 0,
  throttlePercent: 0,
  flightPhase: 'parked' as FlightPhase,
  phaseLabel: 'PARKED ON RUNWAY 36',
  engineRunning: false,
  wheelBrakes: false,
  ringsCleared: 0,
  totalRings: 6,
  viewMode: 'outside' as const,
  objective: 'Press [I] to Start Engine, then [Shift] to Throttle Up for Takeoff!',
};

export const useFlightStore = createStore<FlightState>((set) => ({
  ...INITIAL_STATE,

  setTelemetry: (data) => set((s) => ({ ...s, ...data })),

  setThrottle: (throttlePercent) => set({ throttlePercent }),

  toggleEngine: () =>
    set((s) => ({
      engineRunning: !s.engineRunning,
      flightPhase: !s.engineRunning ? 'starting' : 'parked',
      phaseLabel: !s.engineRunning ? 'ENGINE RUNNING (IDLE)' : 'ENGINE SHUT DOWN',
      objective: !s.engineRunning
        ? 'Engine Started! Hold [Shift] to apply takeoff power.'
        : 'Engine stopped.',
    })),

  toggleViewMode: () =>
    set((s) => ({ viewMode: s.viewMode === 'outside' ? 'cockpit' : 'outside' })),

  setBrakes: (wheelBrakes) => set({ wheelBrakes }),

  resetFlight: () => set(INITIAL_STATE),
}));
