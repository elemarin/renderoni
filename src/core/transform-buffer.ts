/**
 * Renderoni Dual-Buffer Transform Pipeline
 *
 * Implements a flat Float32Array canonical simulation buffer and an
 * interpolated presentation buffer to prevent render transforms from polluting physics state.
 */

export const TRANSFORM_STRIDE = 16;

export const OFFSET_POS_X = 0;
export const OFFSET_POS_Y = 1;
export const OFFSET_POS_Z = 2;

export const OFFSET_QUAT_X = 3;
export const OFFSET_QUAT_Y = 4;
export const OFFSET_QUAT_Z = 5;
export const OFFSET_QUAT_W = 6;

export const OFFSET_LINVEL_X = 7;
export const OFFSET_LINVEL_Y = 8;
export const OFFSET_LINVEL_Z = 9;

export const OFFSET_ANGVEL_X = 10;
export const OFFSET_ANGVEL_Y = 11;
export const OFFSET_ANGVEL_Z = 12;

export const OFFSET_FLAGS = 13;

export interface TransformData {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  linearVelocity?: [number, number, number];
  angularVelocity?: [number, number, number];
}

/** Slerp helper for quaternions */
function slerpQuat(
  qa: Float32Array,
  offsetA: number,
  qb: Float32Array,
  offsetB: number,
  t: number,
  out: [number, number, number, number]
): void {
  let ax = qa[offsetA];
  let ay = qa[offsetA + 1];
  let az = qa[offsetA + 2];
  let aw = qa[offsetA + 3];

  let bx = qb[offsetB];
  let by = qb[offsetB + 1];
  let bz = qb[offsetB + 2];
  let bw = qb[offsetB + 3];

  let cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw;

  if (cosHalfTheta < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cosHalfTheta = -cosHalfTheta;
  }

  if (Math.abs(cosHalfTheta) >= 1.0) {
    out[0] = ax;
    out[1] = ay;
    out[2] = az;
    out[3] = aw;
    return;
  }

  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

  if (Math.abs(sinHalfTheta) < 0.001) {
    out[0] = ax * 0.5 + bx * 0.5;
    out[1] = ay * 0.5 + by * 0.5;
    out[2] = az * 0.5 + bz * 0.5;
    out[3] = aw * 0.5 + bw * 0.5;
    return;
  }

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  out[0] = ax * ratioA + bx * ratioB;
  out[1] = ay * ratioA + by * ratioB;
  out[2] = az * ratioA + bz * ratioB;
  out[3] = aw * ratioA + bw * ratioB;
}

export class DualBufferTransformPipeline {
  private capacity: number;
  private _currentBuffer: Float32Array;
  private _previousBuffer: Float32Array;

  private entityToSlot: Map<string, number> = new Map();
  private slotToEntity: Map<number, string> = new Map();
  private freeSlots: number[] = [];
  private nextFreeSlot: number = 0;

  constructor(initialCapacity: number = 256) {
    this.capacity = initialCapacity;
    this._currentBuffer = new Float32Array(this.capacity * TRANSFORM_STRIDE);
    this._previousBuffer = new Float32Array(this.capacity * TRANSFORM_STRIDE);
  }

  get currentBuffer(): Float32Array {
    return this._currentBuffer;
  }

  get previousBuffer(): Float32Array {
    return this._previousBuffer;
  }

  /**
   * Allocates a transform slot for an entity.
   */
  allocateSlot(entityId: string): number {
    if (this.entityToSlot.has(entityId)) {
      return this.entityToSlot.get(entityId)!;
    }

    let slot: number;
    if (this.freeSlots.length > 0) {
      slot = this.freeSlots.pop()!;
    } else {
      if (this.nextFreeSlot >= this.capacity) {
        this.growCapacity(this.capacity * 2);
      }
      slot = this.nextFreeSlot++;
    }

    this.entityToSlot.set(entityId, slot);
    this.slotToEntity.set(slot, entityId);

    // Initialize with identity quaternion [0, 0, 0, 1]
    const offset = slot * TRANSFORM_STRIDE;
    this._currentBuffer.fill(0, offset, offset + TRANSFORM_STRIDE);
    this._currentBuffer[offset + OFFSET_QUAT_W] = 1.0;
    this._previousBuffer.fill(0, offset, offset + TRANSFORM_STRIDE);
    this._previousBuffer[offset + OFFSET_QUAT_W] = 1.0;

    return slot;
  }

  /**
   * Releases a slot for a destroyed entity.
   */
  releaseSlot(entityId: string): void {
    const slot = this.entityToSlot.get(entityId);
    if (slot === undefined) return;

    this.entityToSlot.delete(entityId);
    this.slotToEntity.delete(slot);
    this.freeSlots.push(slot);

    const offset = slot * TRANSFORM_STRIDE;
    this._currentBuffer.fill(0, offset, offset + TRANSFORM_STRIDE);
    this._previousBuffer.fill(0, offset, offset + TRANSFORM_STRIDE);
  }

  getSlot(entityId: string): number | undefined {
    return this.entityToSlot.get(entityId);
  }

  hasSlot(entityId: string): boolean {
    return this.entityToSlot.has(entityId);
  }

  /**
   * Commits the end of a simulation tick by copying current buffer to previous buffer.
   */
  commitTick(): void {
    this._previousBuffer.set(this._currentBuffer);
  }

  /**
   * Sets canonical physics transform for an entity slot.
   */
  setTransform(
    slot: number,
    posX: number,
    posY: number,
    posZ: number,
    quatX: number,
    quatY: number,
    quatZ: number,
    quatW: number
  ): void {
    const offset = slot * TRANSFORM_STRIDE;
    this._currentBuffer[offset + OFFSET_POS_X] = posX;
    this._currentBuffer[offset + OFFSET_POS_Y] = posY;
    this._currentBuffer[offset + OFFSET_POS_Z] = posZ;

    this._currentBuffer[offset + OFFSET_QUAT_X] = quatX;
    this._currentBuffer[offset + OFFSET_QUAT_Y] = quatY;
    this._currentBuffer[offset + OFFSET_QUAT_Z] = quatZ;
    this._currentBuffer[offset + OFFSET_QUAT_W] = quatW;
  }

  /**
   * Reads canonical position directly from the current simulation buffer.
   */
  getPosition(slot: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
    const offset = slot * TRANSFORM_STRIDE;
    out[0] = this._currentBuffer[offset + OFFSET_POS_X];
    out[1] = this._currentBuffer[offset + OFFSET_POS_Y];
    out[2] = this._currentBuffer[offset + OFFSET_POS_Z];
    return out;
  }

  /**
   * Reads canonical quaternion directly from the current simulation buffer.
   */
  getQuaternion(
    slot: number,
    out: [number, number, number, number] = [0, 0, 0, 1]
  ): [number, number, number, number] {
    const offset = slot * TRANSFORM_STRIDE;
    out[0] = this._currentBuffer[offset + OFFSET_QUAT_X];
    out[1] = this._currentBuffer[offset + OFFSET_QUAT_Y];
    out[2] = this._currentBuffer[offset + OFFSET_QUAT_Z];
    out[3] = this._currentBuffer[offset + OFFSET_QUAT_W];
    return out;
  }

  /**
   * Computes interpolated position and quaternion for presentation frames.
   */
  interpolate(
    slot: number,
    alpha: number,
    outPosition: [number, number, number],
    outQuaternion: [number, number, number, number]
  ): void {
    const offset = slot * TRANSFORM_STRIDE;

    const prevX = this._previousBuffer[offset + OFFSET_POS_X];
    const prevY = this._previousBuffer[offset + OFFSET_POS_Y];
    const prevZ = this._previousBuffer[offset + OFFSET_POS_Z];

    const currX = this._currentBuffer[offset + OFFSET_POS_X];
    const currY = this._currentBuffer[offset + OFFSET_POS_Y];
    const currZ = this._currentBuffer[offset + OFFSET_POS_Z];

    outPosition[0] = prevX + (currX - prevX) * alpha;
    outPosition[1] = prevY + (currY - prevY) * alpha;
    outPosition[2] = prevZ + (currZ - prevZ) * alpha;

    slerpQuat(this._previousBuffer, offset + OFFSET_QUAT_X, this._currentBuffer, offset + OFFSET_QUAT_X, alpha, outQuaternion);
  }

  private growCapacity(newCapacity: number): void {
    const newCurrent = new Float32Array(newCapacity * TRANSFORM_STRIDE);
    const newPrevious = new Float32Array(newCapacity * TRANSFORM_STRIDE);

    newCurrent.set(this._currentBuffer);
    newPrevious.set(this._previousBuffer);

    this._currentBuffer = newCurrent;
    this._previousBuffer = newPrevious;
    this.capacity = newCapacity;
  }
}
