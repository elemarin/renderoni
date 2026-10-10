/**
 * Renderoni World Providers
 *
 * Lets a game whose state does not live in renderoni entities (its own
 * simulation, run as a renderoni system) stay visible to agents: providers
 * feed the MCP `describe` and `observe` tools, `check` paths of the form
 * `world.<name>.<path...>`, and the deterministic state hash.
 */

import type { DiagnosticLogger } from './diagnostics.js';
import { compareCodeUnits } from './hashing.js';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Value a provider folds into the state hash. Numbers must be finite. */
export type WorldHashValue = string | number | Uint8Array;

export interface WorldProvider {
  /**
   * Unique, path-safe name: 1–64 characters of `A-Z a-z 0-9 _ -`. It is the
   * second segment of `world.<name>.<path...>` check paths, so no dots.
   */
  readonly name: string;
  /** JSON summary returned under `worlds.<name>` by the MCP `describe` tool. */
  describe?(): JsonValue;
  /**
   * Compact Tier 0 observation lines. Keep the output within `budgetBytes`
   * (UTF-8); anything past it is truncated.
   */
  observe?(budgetBytes: number): string[];
  /** Resolves the path segments after `world.<name>.` for `check` assertions. */
  resolve?(path: string[]): unknown;
  /** Deterministic digest of the provider's simulation state. */
  hash?(): WorldHashValue;
}

/** A provider's hash contribution, as passed to {@link StateHasher.computeHash}. */
export interface WorldDigest {
  name: string;
  digest: WorldHashValue;
}

const WORLD_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PROVIDER_METHODS = ['describe', 'observe', 'resolve', 'hash'] as const;

/**
 * Registry of world providers, iterated in code-unit order of their names so
 * every consumer (observe, describe, hash) is deterministic.
 */
export class WorldRegistry {
  private providers: Map<string, WorldProvider> = new Map();

  constructor(
    private readonly diagnostics: DiagnosticLogger,
    private readonly currentTick: () => number = () => 0
  ) {}

  /**
   * Registers a provider and returns a function that unregisters it.
   *
   * Invalid providers (bad name, non-function hooks) and duplicate names are
   * rejected with a diagnostic and a thrown error; nothing is registered.
   */
  register(provider: WorldProvider): () => void {
    this.validate(provider);

    if (this.providers.has(provider.name)) {
      throw this.fail(
        'RND_0411',
        `RND_0411: a world provider named "${provider.name}" is already registered.`,
        'Use a unique provider name, or call the unregister function returned by worlds.register() first.'
      );
    }

    this.providers.set(provider.name, provider);
    return () => {
      // Only remove this exact provider; a later replacement stays registered.
      if (this.providers.get(provider.name) === provider) {
        this.providers.delete(provider.name);
      }
    };
  }

  get(name: string): WorldProvider | undefined {
    return this.providers.get(name);
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  get size(): number {
    return this.providers.size;
  }

  /** Registered providers in deterministic (code-unit) name order. */
  list(): WorldProvider[] {
    return Array.from(this.providers.values()).sort((a, b) => compareCodeUnits(a.name, b.name));
  }

  /** Hash contributions of every provider that implements `hash()`, in name order. */
  digests(): WorldDigest[] {
    const digests: WorldDigest[] = [];
    for (const provider of this.list()) {
      if (typeof provider.hash !== 'function') continue;
      const digest = provider.hash();
      const valid =
        typeof digest === 'string' ||
        digest instanceof Uint8Array ||
        (typeof digest === 'number' && Number.isFinite(digest));
      if (!valid) {
        throw this.fail(
          'RND_0413',
          `RND_0413: world provider "${provider.name}" returned an invalid hash value ${String(digest)}. ` +
            'hash() must return a string, a finite number or a Uint8Array.',
          'Return a deterministic string, finite number or Uint8Array digest of the provider state.'
        );
      }
      digests.push({ name: provider.name, digest });
    }
    return digests;
  }

  clear(): void {
    this.providers.clear();
  }

  private validate(provider: WorldProvider): void {
    if (!provider || typeof provider !== 'object') {
      throw this.fail(
        'RND_0410',
        'RND_0410: worlds.register() requires a provider object.',
        'Pass an object such as { name: "sim", describe() {...}, hash() {...} }.'
      );
    }
    if (typeof provider.name !== 'string' || !WORLD_NAME_PATTERN.test(provider.name)) {
      throw this.fail(
        'RND_0410',
        `RND_0410: invalid world provider name ${JSON.stringify(provider.name)}. ` +
          'Names must be 1-64 characters of A-Z, a-z, 0-9, "_" or "-" because they appear in check paths.',
        'Pick a path-safe name such as "sim" or "sunder-march".'
      );
    }
    for (const method of PROVIDER_METHODS) {
      const hook = provider[method];
      if (hook !== undefined && typeof hook !== 'function') {
        throw this.fail(
          'RND_0410',
          `RND_0410: world provider "${provider.name}" has a non-function ${method}.`,
          `Make ${method} a method, or omit it.`
        );
      }
    }
  }

  private fail(code: string, message: string, remediation: string): Error {
    this.diagnostics.emit(code, message, {
      severity: 'error',
      tick: this.currentTick(),
      remediation,
    });
    return new Error(message);
  }
}
