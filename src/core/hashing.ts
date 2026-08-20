/**
 * Renderoni Quantized State Canopy & XXH3 Hasher
 *
 * Implements Q20.12 fixed-point integer quantization and XXH3-64 hashing
 * to eliminate cross-CPU float divergence and verify state determinism.
 *
 * ## Scoped exact-hash contract
 *
 * The digest is a determinism regression tool, not a wire format:
 *
 * - **Everywhere**: the same build, seed and input sequence must produce the same
 *   digest run after run on one machine, and the digest must change when
 *   canonical state changes. Assert equality between runs, never a literal value.
 * - **Pinned matrix only** ({@link EXACT_STATE_HASH_MATRIX}: Node 22, linux, x64):
 *   literal digests may be pinned as golden values in CI. Gate those assertions
 *   with {@link isExactStateHashPlatform}.
 * - **Other platforms** (browsers, macOS, Windows, other Node majors or
 *   architectures): assert gameplay outcomes (positions, contacts, win/lose)
 *   instead of literal digests.
 * - **Before 1.0**: the byte layout may change. {@link STATE_HASH_FORMAT_VERSION}
 *   is mixed into every digest, so a stale golden value fails loudly instead of
 *   matching by luck.
 */

import xxhash from 'xxhash-wasm';
import {
  TRANSFORM_STRIDE,
  OFFSET_POS_X,
  OFFSET_POS_Y,
  OFFSET_POS_Z,
  OFFSET_QUAT_X,
  OFFSET_QUAT_Y,
  OFFSET_QUAT_Z,
  OFFSET_QUAT_W,
  OFFSET_LINVEL_X,
  OFFSET_LINVEL_Y,
  OFFSET_LINVEL_Z,
  OFFSET_ANGVEL_X,
  OFFSET_ANGVEL_Y,
  OFFSET_ANGVEL_Z,
} from './transform-buffer.js';

export const SCALE_Q12 = 4096.0; // 2^12

/**
 * Hashed byte-layout version. Bump it whenever the digest input changes so
 * pinned golden hashes fail loudly instead of comparing new state against an
 * old layout.
 */
export const STATE_HASH_FORMAT_VERSION = 2;

/** The only platform where literal state hashes may be pinned as golden values. */
export const EXACT_STATE_HASH_MATRIX = {
  nodeMajor: 22,
  platform: 'linux',
  arch: 'x64',
} as const;

/**
 * Reports whether the current runtime is the pinned exact-hash matrix.
 * Returns false in browsers and on every other Node major, OS or architecture,
 * where callers must assert gameplay outcomes rather than literal digests.
 */
export function isExactStateHashPlatform(): boolean {
  const proc = (
    globalThis as {
      process?: { versions?: { node?: string }; platform?: string; arch?: string };
    }
  ).process;

  const nodeVersion = proc?.versions?.node;
  if (!nodeVersion) return false;

  const nodeMajor = Number.parseInt(nodeVersion.split('.')[0] ?? '', 10);
  return (
    nodeMajor === EXACT_STATE_HASH_MATRIX.nodeMajor &&
    proc?.platform === EXACT_STATE_HASH_MATRIX.platform &&
    proc?.arch === EXACT_STATE_HASH_MATRIX.arch
  );
}

/**
 * Locale-independent UTF-16 code-unit comparator.
 *
 * `String.prototype.localeCompare` depends on the ICU data of the host
 * (full-icu, small-icu, browser locale), so it can order the same ids
 * differently on two machines and silently diverge a simulation. Every
 * deterministic ordering in the kernel uses this comparator instead.
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function quantize(value: number): number {
  return Math.round(value * SCALE_Q12) | 0;
}

export function dequantize(value: number): number {
  return value / SCALE_Q12;
}

export interface StateEntityRecord {
  id: string;
  /**
   * Canonical transform slot. Omit it (or pass a negative value) for slotless
   * entities, which are hashed from {@link StateEntityRecord.position} and
   * {@link StateEntityRecord.quaternion} instead.
   */
  slot?: number;
  /** Canonical position for slotless entities. Defaults to the origin. */
  position?: readonly number[];
  /** Canonical quaternion for slotless entities. Defaults to identity. */
  quaternion?: readonly number[];
  state?: Record<string, unknown>;
}

export interface ContactPairRecord {
  entityA: string;
  entityB: string;
  started: boolean;
}

/** Ints hashed per entity: [pos xyz, quat xyzw, linvel xyz, angvel xyz]. */
const ENTITY_INT_STRIDE = 13;
/** Ints hashed before entities: [format version, entity count, contact count]. */
const HEADER_INT_COUNT = 3;

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

  /** True once the XXH3 WASM module is loaded and hashing is possible. */
  get isReady(): boolean {
    return this.h64 !== null;
  }

  /**
   * Computes deterministic XXH3-64 state hash for a collection of entities and contacts.
   *
   * Throws when called before {@link StateHasher.init} resolves; a placeholder
   * digest would make an uninitialized engine look deterministic.
   */
  computeHash(
    entities: StateEntityRecord[],
    transformBuffer: Float32Array,
    contacts: ContactPairRecord[] = []
  ): string {
    const h64 = this.h64;
    if (!h64) {
      throw new Error(
        'RND_0201: state hash requested before the XXH3 hasher finished loading. ' +
          'Await `hasher.init()` (or `await createRenderoni(...)` / `await engine.init()`) before hashing state.'
      );
    }

    // Sort entities deterministically by ID using code units, never locale rules.
    const sortedEntities = [...entities].sort((a, b) => compareCodeUnits(a.id, b.id));

    const entityIntCount = sortedEntities.length * ENTITY_INT_STRIDE;
    // Each contact: 2 entity ID hashes + 1 started flag (12 bytes)
    const contactIntCount = contacts.length * 3;

    const buffer = new Int32Array(HEADER_INT_COUNT + entityIntCount + contactIntCount);
    let ptr = 0;

    buffer[ptr++] = STATE_HASH_FORMAT_VERSION;
    buffer[ptr++] = sortedEntities.length | 0;
    buffer[ptr++] = contacts.length | 0;

    const slotCapacity = Math.floor(transformBuffer.length / TRANSFORM_STRIDE);

    for (let i = 0; i < sortedEntities.length; i++) {
      const ent = sortedEntities[i];
      const slot = ent.slot;
      // `undefined` and negative integers both mean "no canonical buffer row".
      const isSlotless = slot === undefined || (Number.isInteger(slot) && slot < 0);

      if (!isSlotless) {
        if (!Number.isInteger(slot) || slot >= slotCapacity) {
          throw new Error(
            `RND_0304: entity "${ent.id}" references transform slot ${String(slot)} outside the canonical ` +
              `buffer (${slotCapacity} slots). Hash the transform buffer the entity was allocated from.`
          );
        }

        const offset = slot * TRANSFORM_STRIDE;

        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_POS_X], ent.id, 'position.x');
        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_POS_Y], ent.id, 'position.y');
        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_POS_Z], ent.id, 'position.z');

        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_QUAT_X], ent.id, 'quaternion.x');
        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_QUAT_Y], ent.id, 'quaternion.y');
        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_QUAT_Z], ent.id, 'quaternion.z');
        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_QUAT_W], ent.id, 'quaternion.w');

        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_LINVEL_X], ent.id, 'linearVelocity.x');
        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_LINVEL_Y], ent.id, 'linearVelocity.y');
        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_LINVEL_Z], ent.id, 'linearVelocity.z');

        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_ANGVEL_X], ent.id, 'angularVelocity.x');
        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_ANGVEL_Y], ent.id, 'angularVelocity.y');
        buffer[ptr++] = quantizeChecked(transformBuffer[offset + OFFSET_ANGVEL_Z], ent.id, 'angularVelocity.z');
        continue;
      }

      // Slotless entities own no canonical buffer row, so hash their instance transform.
      const position = ent.position;
      const quaternion = ent.quaternion;

      buffer[ptr++] = quantizeChecked(position?.[0] ?? 0, ent.id, 'position.x');
      buffer[ptr++] = quantizeChecked(position?.[1] ?? 0, ent.id, 'position.y');
      buffer[ptr++] = quantizeChecked(position?.[2] ?? 0, ent.id, 'position.z');

      buffer[ptr++] = quantizeChecked(quaternion?.[0] ?? 0, ent.id, 'quaternion.x');
      buffer[ptr++] = quantizeChecked(quaternion?.[1] ?? 0, ent.id, 'quaternion.y');
      buffer[ptr++] = quantizeChecked(quaternion?.[2] ?? 0, ent.id, 'quaternion.z');
      buffer[ptr++] = quantizeChecked(quaternion?.[3] ?? 1, ent.id, 'quaternion.w');

      // Slotless entities carry no canonical velocity; their six velocity ints stay zero.
      ptr += 6;
    }

    // Sort contacts deterministically by code units.
    const sortedContacts = [...contacts].sort((a, b) => {
      const cmpA = compareCodeUnits(a.entityA, b.entityA);
      return cmpA !== 0 ? cmpA : compareCodeUnits(a.entityB, b.entityB);
    });

    for (let i = 0; i < sortedContacts.length; i++) {
      const c = sortedContacts[i];
      buffer[ptr++] = strHash(c.entityA);
      buffer[ptr++] = strHash(c.entityB);
      buffer[ptr++] = c.started ? 1 : 0;
    }

    const metadata = new TextEncoder().encode(
      sortedEntities.map((entity) => `${entity.id}:${stableStringify(entity.state ?? {})}`).join('|')
    );
    const transformBytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const bytes = new Uint8Array(transformBytes.length + metadata.length);
    bytes.set(transformBytes);
    bytes.set(metadata, transformBytes.length);
    const hashBigInt = h64(bytes);
    return '0x' + hashBigInt.toString(16).padStart(16, '0');
  }

}

function quantizeChecked(value: number | undefined, entityId: string, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `RND_0301: rejected non-finite ${label}=${String(value)} for entity "${entityId}" while hashing state. ` +
        'Canonical transforms must be finite numbers; check impulses, divisions by zero and NaN-producing math.'
    );
  }
  return quantize(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => compareCodeUnits(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function strHash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) | 0;
  }
  return h;
}
