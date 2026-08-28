/**
 * AlpenDrop Flappy-Bird Drone Flight Controller
 * Smooth continuous vertical physics lift on Space/Shift (+7.0 m/s), zero setLinvel fighting/stutter,
 * gentle natural fall rate when neutral (-2.8 m/s), and rock-solid level gyro stability.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { FlightInputState, VehicleSpecs } from './types.js';
import type { WindSystem } from './wind-system.js';

const _vForward = new THREE.Vector3();
const _vRight = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class DroneFlightController {
  private body: RAPIER.RigidBody;
  readonly specs: VehicleSpecs;
  private windSystem: WindSystem;

  // Flight State
  throttle: number = 0.0;
  battery: number = 100.0;
  yaw: number = 0.0;
  pitch: number = 0.0;
  roll: number = 0.0;
  isAirborne: boolean = true;
  devAssists: boolean = false;

  /**
   * True while the aircraft is sitting on its pad and the pilot has not touched
   * the controls yet. Parked aircraft ignore wind entirely so they never drift
   * off the helipad before the player has started flying.
   */
  isParked: boolean = true;

  // Upgrade Levels
  gyroLevel: number = 0;
  autoHoverTrim: boolean = false;
  cushionedSkids: boolean = false;

  constructor(body: RAPIER.RigidBody, specs: VehicleSpecs, windSystem: WindSystem) {
    this.body = body;
    this.specs = specs;
    this.windSystem = windSystem;
    this.body.setAngularDamping(8.0);
    this.body.setLinearDamping(1.2);
  }

  setAssists(gyroLevel: number, autoHover: boolean, cushionedSkids: boolean): void {
    this.gyroLevel = gyroLevel;
    this.autoHoverTrim = autoHover;
    this.cushionedSkids = cushionedSkids;
  }

  setDevAssists(enabled: boolean): void {
    this.devAssists = enabled;
  }

  step(dt: number, input: FlightInputState, groundHeight: number): void {
    const pos = this.body.translation();
    const vel = this.body.linvel();

    const altitudeAboveGround = Math.max(0, pos.y - groundHeight);
    this.isAirborne = altitudeAboveGround > 0.45;

    // Leave the parked state the moment the pilot touches any control
    if (this.isParked) {
      if (
        input.throttleUp ||
        input.throttleDown ||
        input.pitchForward ||
        input.pitchBack ||
        input.rollLeft ||
        input.rollRight ||
        input.yawLeft ||
        input.yawRight
      ) {
        this.isParked = false;
      }
    }

    // 1. Battery Consumption
    if (this.isAirborne) {
      const drain = 0.1 / this.specs.batteryCapacitySeconds;
      this.battery = Math.max(0, this.battery - drain * dt * 100);
    }
    const powerScale = this.battery > 0 ? 1.0 : 0.3;

    // 2. Steering & Bank (Crisp, snappy A/D turns)
    const turnSpeed = 2.8;
    if (input.yawLeft || input.rollLeft) {
      this.yaw += turnSpeed * dt;
    }
    if (input.yawRight || input.rollRight) {
      this.yaw -= turnSpeed * dt;
    }
    this.yaw = THREE.MathUtils.euclideanModulo(this.yaw + Math.PI, Math.PI * 2) - Math.PI;

    // Clamped visual tilt
    const targetPitch = input.pitchForward ? 0.25 : input.pitchBack ? -0.2 : 0;
    const targetRoll = (input.rollLeft || input.yawLeft) ? 0.2 : (input.rollRight || input.yawRight) ? -0.2 : 0;

    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, dt * 8.0);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, dt * 8.0);

    _euler.set(this.pitch, this.yaw, this.roll, 'YXZ');
    _quat.setFromEuler(_euler);
    this.body.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    // 3. Direction Vectors
    _vForward.set(0, 0, -1).applyQuaternion(_quat);
    _vRight.set(1, 0, 0).applyQuaternion(_quat);

    // 4. Smooth Continuous Vertical Lift (Pure Physics Forces - Zero setLinvel Fighting!)
    let targetVelY = -2.8; // Gentle natural descent when neutral

    if (input.throttleUp) {
      targetVelY = 7.2 * powerScale; // Energetic climb
      this.throttle = THREE.MathUtils.lerp(this.throttle, 1.0, dt * 10.0);
    } else if (input.throttleDown) {
      targetVelY = -6.0;
      this.throttle = THREE.MathUtils.lerp(this.throttle, 0.0, dt * 10.0);
    } else if (this.devAssists) {
      targetVelY = 0.0; // Steady hover ONLY when Dev Assist is enabled
      this.throttle = THREE.MathUtils.lerp(this.throttle, 0.5, dt * 4.0);
    } else {
      this.throttle = THREE.MathUtils.lerp(this.throttle, 0.15, dt * 6.0);
    }

    // Apply vertical physics impulse
    const accelY = input.throttleUp ? 22.0 : 14.0;
    const yForce = (targetVelY - vel.y) * accelY * this.specs.massKg + 9.81 * this.specs.massKg;
    const impulseY = yForce * dt;

    // 5. Horizontal Forward & Reverse Movement
    let forwardSpeed = 0;
    if (input.pitchForward) forwardSpeed = 22.0 * powerScale;
    else if (input.pitchBack) forwardSpeed = -10.0 * powerScale;

    const targetVelX = _vForward.x * forwardSpeed;
    const targetVelZ = _vForward.z * forwardSpeed;

    const accelH = input.pitchForward ? 7.5 : 9.5;
    const impulseX = (targetVelX - vel.x) * accelH * this.specs.massKg * dt;
    const impulseZ = (targetVelZ - vel.z) * accelH * this.specs.massKg * dt;
    this.body.applyImpulse({ x: impulseX, y: impulseY, z: impulseZ }, true);

    // 6. Dynamic Wind Currents (Physical Push)
    // Skipped entirely while parked, and never applied horizontally on the
    // ground - landing skids grip the pad instead of sliding downwind.
    if (!this.isParked) {
      const wind = this.windSystem.getWindAt(pos.x, pos.y, pos.z);
      const windFactor = this.devAssists ? 0.35 : 1.0;
      const horizontalWind = this.isAirborne ? 1.0 : 0.0;

      this.body.applyImpulse(
        {
          x: wind.x * 5.0 * windFactor * this.specs.massKg * dt * horizontalWind,
          y: (this.isAirborne ? wind.y * 3.0 : 0) * windFactor * this.specs.massKg * dt,
          z: wind.z * 5.0 * windFactor * this.specs.massKg * dt * horizontalWind,
        },
        true
      );
    }

    // 7. Ground Landing Skid Friction
    if (!this.isAirborne && vel.y < 0 && !input.throttleUp) {
      this.body.applyImpulse(
        {
          x: -vel.x * 3.0 * this.specs.massKg * dt,
          y: 0,
          z: -vel.z * 3.0 * this.specs.massKg * dt,
        },
        true
      );
    }

    // Hard anchor: a parked aircraft resting on its pad does not budge at all,
    // but is still allowed to settle downwards onto the surface under gravity.
    if (this.isParked && !this.isAirborne) {
      const settled = this.body.linvel();
      this.body.setLinvel({ x: 0, y: Math.min(0, settled.y), z: 0 }, true);
    }
  }

  reset(x: number, y: number, z: number, yaw: number = 0): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.throttle = 0.0;
    this.battery = 100.0;
    this.isParked = true;
  }
}
