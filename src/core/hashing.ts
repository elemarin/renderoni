/**
 * Renderoni Quantized State Canopy & XXH3 Hasher
 *
 * Implements Q20.12 fixed-point integer quantization and XXH3-64 hashing
 * to eliminate cross-CPU float divergence and verify state determinism.
 */

import xxhash from 'xxhash-wasm';

export const SCALE_Q12 = 4096.0; // 2^12

export function quantize(value: number): number {
  return Math.round(value * SCALE_Q12) | 0;
}

export function dequantize(value: number): number {
  return value / SCALE_Q12;
}

export interface StateEntityRecord {
  id: string;
  slot: number;
}

export interface ContactPairRecord {
  entityA: string;
  entityB: string;
  started: boolean;
}

export class StateHasher {
  private h64: ((input: Uint8Array) => bigint) | null = null;
  private isInitPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.h64) return;
    if (!this.isInitPromise) {
      this.isInitPromise = xxhash().then((hasher) => {
        this.h64 = hasher.h64Raw;
      });
    }
    return this.isInitPromise;
  }

  /**
   * Computes deterministic XXH3-64 state hash for a collection of entities and contacts.
   */
  computeHash(
    entities: StateEntityRecord[],
    transformBuffer: Float32Array,
    contacts: ContactPairRecord[] = []
  ): string {
    if (!this.h64) {
      return '0x0000000000000000';
    }

    // Sort entities deterministically by ID
    const sortedEntities = [...entities].sort((a, b) => a.id.localeCompare(b.id));

    // Stride per entity: 7 integers [posX, posY, posZ, quatX, quatY, quatZ, quatW] (28 bytes)
    const entityIntCount = sortedEntities.length * 7;
    // Each contact: 2 entity ID hashes + 1 started flag (12 bytes)
    const contactIntCount = contacts.length * 3;

    const buffer = new Int32Array(entityIntCount + contactIntCount);
    let ptr = 0;

    for (let i = 0; i < sortedEntities.length; i++) {
      const ent = sortedEntities[i];
      const offset = ent.slot * 16;

      buffer[ptr++] = quantize(transformBuffer[offset + 0]); // pos.x
      buffer[ptr++] = quantize(transformBuffer[offset + 1]); // pos.y
      buffer[ptr++] = quantize(transformBuffer[offset + 2]); // pos.z

      buffer[ptr++] = quantize(transformBuffer[offset + 3]); // quat.x
      buffer[ptr++] = quantize(transformBuffer[offset + 4]); // quat.y
      buffer[ptr++] = quantize(transformBuffer[offset + 5]); // quat.z
      buffer[ptr++] = quantize(transformBuffer[offset + 6]); // quat.w
    }

    // Sort contacts deterministically
    const sortedContacts = [...contacts].sort((a, b) => {
      const cmpA = a.entityA.localeCompare(b.entityA);
      return cmpA !== 0 ? cmpA : a.entityB.localeCompare(b.entityB);
    });

    for (let i = 0; i < sortedContacts.length; i++) {
      const c = sortedContacts[i];
      buffer[ptr++] = strHash(c.entityA);
      buffer[ptr++] = strHash(c.entityB);
      buffer[ptr++] = c.started ? 1 : 0;
    }

    const byteSlice = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const hashBigInt = this.h64(byteSlice);
    return '0x' + hashBigInt.toString(16).padStart(16, '0');
  }
}

function strHash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) | 0;
  }
  return h;
}
