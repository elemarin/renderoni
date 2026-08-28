/**
 * AlpenDrop Arcade RC Airplane & Sailplane Controller
 * Flappy-glider soaring dynamics (Space = climb flap, release = graceful glide descent),
 * crisp banking turns, and wind current draft interactions.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { FlightInputState, VehicleSpecs } from './types.js';
import type { WindSystem } from './wind-system.js';

const _vForward = new THREE.Vector3();
const _vUp = new THREE.Vector3();
const _vRight = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class PlaneFlightController {
  readonly specs: VehicleSpecs;
  private body: RAPIER.RigidBody;
  private windSystem: WindSystem;

  // Flight State
  throttle: number = 0.0;
  airspeed: number = 0.0;
  battery: number = 100.0;
  yaw: number = 0.0;
  pitch: number = 0.0;
  roll: number = 0.0;
  isAirborne: boolean = false;

  /**
   * True while the aircraft is sitting on its pad and the pilot has not touched
   * the controls yet. Parked aircraft ignore wind entirely so they never drift
   * off the runway before the player has started flying.
   */
  isParked: boolean = true;
  isStalling: boolean = false;
  devAssists: boolean = false;
  gyroLevel: number = 0;

  constructor(body: RAPIER.RigidBody, specs: VehicleSpecs, windSystem: WindSystem) {
    this.body = body;
    this.specs = specs;
    this.windSystem = windSystem;
    this.body.setAngularDamping(5.5);
    this.body.setLinearDamping(1.0);
  }

  setAssists(gyroLevel: number): void {
    this.gyroLevel = gyroLevel;
  }

  setDevAssists(enabled: boolean): void {
    this.devAssists = enabled;
  }

  step(dt: number, input: FlightInputState, groundHeight: number): void {
    const pos = this.body.translation();
    const vel = this.body.linvel();

    const altitudeAboveGround = Math.max(0, pos.y - groundHeight);
    this.isAirborne = altitudeAboveGround > 0.35;

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
    if (this.throttle > 0.1 && this.isAirborne) {
      const drain = 0.08 / this.specs.batteryCapacitySeconds;
      this.battery = Math.max(0, this.battery - drain * dt * 100);
    }
    const powerScale = this.battery > 0 ? 1.0 : 0.3;

    // 2. Steering & Bank (A/D = smooth agile banking turns)
    const turnRate = 2.6;
    if (input.rollLeft || input.yawLeft) {
      this.yaw += turnRate * dt;
    }
    if (input.rollRight || input.yawRight) {
      this.yaw -= turnRate * dt;
    }
    this.yaw = THREE.MathUtils.euclideanModulo(this.yaw + Math.PI, Math.PI * 2) - Math.PI;

    // Target Pitch & Bank
    let targetPitch = 0.0;
    if (input.pitchBack) targetPitch = -0.42; // S = pull up stick
    else if (input.throttleDown) targetPitch = 0.28; // Ctrl/C = dive down

    let targetRoll = 0.0;
    if (input.rollLeft || input.yawLeft) targetRoll = 0.52; // Bank left
    else if (input.rollRight || input.yawRight) targetRoll = -0.52; // Bank right

    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, dt * 6.0);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, dt * 6.0);

    _euler.set(this.pitch, this.yaw, this.roll, 'YXZ');
    _quat.setFromEuler(_euler);
    this.body.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    // 3. Direction Vectors
    _vForward.set(0, 0, -1).applyQuaternion(_quat);
    _vUp.set(0, 1, 0).applyQuaternion(_quat);
    _vRight.set(1, 0, 0).applyQuaternion(_quat);

    // 4. Flappy-Glider Vertical Dynamics:
    // Holding Space/Shift: Soaring engine climb (+6.0 m/s)
    // Neutral (Release Space): Graceful gliding descent (-2.4 m/s)
    let targetVelY = -2.4; // Gliding descent rate
    if (input.throttleUp) {
      targetVelY = 6.0 * powerScale; // Soar up!
      this.throttle = THREE.MathUtils.lerp(this.throttle, 1.0, dt * 8.0);
    } else if (input.throttleDown) {
      targetVelY = -6.5; // Rapid descent
      this.throttle = THREE.MathUtils.lerp(this.throttle, 0.0, dt * 8.0);
    } else {
      this.throttle = THREE.MathUtils.lerp(this.throttle, this.isAirborne ? 0.6 : 0.0, dt * 4.0);
    }

    if (input.pitchBack) {
      targetVelY += 3.5; // Pulling back adds extra zoom climb
    }

    // 5. Forward Cruise Speed (75-90 km/h)
    let forwardSpeed = 24.0 * powerScale;
    if (input.pitchForward) forwardSpeed = 28.0 * powerScale;
    else if (input.throttleDown) forwardSpeed = 14.0 * powerScale;

    const targetVelX = _vForward.x * forwardSpeed;
    const targetVelZ = _vForward.z * forwardSpeed;

    const impulseX = (targetVelX - vel.x) * 6.5 * this.specs.massKg * dt;
    const impulseZ = (targetVelZ - vel.z) * 6.5 * this.specs.massKg * dt;

    // 6. Vertical Force with Gravity Counter
    const yForce = (targetVelY - vel.y) * 11.0 * this.specs.massKg + 9.81 * this.specs.massKg;
    const impulseY = yForce * dt;

    // 7. Dynamic Wind Currents & Atmospheric Buffeting (Physical Push!)
    // Parked aircraft ignore wind, and on the ground it only pushes horizontally
    // once the wheels are rolling - it must never shove a stationary plane.
    const wind = this.windSystem.getWindAt(pos.x, pos.y, pos.z);
    const windFactor = this.devAssists ? 0.35 : 1.0;
    const windGate = this.isParked ? 0.0 : this.isAirborne ? 1.0 : 0.0;
    const windPushX = wind.x * 5.2 * windFactor * this.specs.massKg * dt * windGate;
    const windPushY = wind.y * 3.8 * windFactor * this.specs.massKg * dt * windGate;
    const windPushZ = wind.z * 5.2 * windFactor * this.specs.massKg * dt * windGate;

    this.body.applyImpulse(
      {
        x: impulseX + windPushX,
        y: impulseY + windPushY,
        z: impulseZ + windPushZ,
      },
      true
    );

    const currentSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    this.airspeed = currentSpeed;
    this.isStalling = this.isAirborne && (this.airspeed * 3.6) < this.specs.stallSpeedKmh && !this.devAssists;

    // 8. Ground Rolling Wheels
    if (!this.isAirborne && vel.y < -0.1) {
      this.body.setLinvel({ x: vel.x * 0.98, y: 0, z: vel.z * 0.98 }, true);
    }

    // Hard anchor: a parked aircraft resting on the runway does not budge at
    // all, but is still allowed to settle downwards onto the surface.
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
