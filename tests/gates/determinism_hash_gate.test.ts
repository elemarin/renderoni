import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../../src/index.js';
import { body } from '../../src/presets/index.js';
import {
  EXACT_STATE_HASH_MATRIX,
  STATE_HASH_FORMAT_VERSION,
  isExactStateHashPlatform,
} from '../../src/core/index.js';

/**
 * Scoped exact-hash contract gate.
 *
 * The literal digest below is pinned for one platform only
 * (EXACT_STATE_HASH_MATRIX: Node 22, linux, x64). Every other platform asserts
 * gameplay outcomes and run-to-run stability instead.
 *
 * When the hashed byte layout changes on purpose, bump
 * STATE_HASH_FORMAT_VERSION in src/core/hashing.ts and re-pin both constants
 * here from a run on the pinned matrix.
 */
const GOLDEN_STATE_HASH = '0xd3fffbaca2ad4623';
const GOLDEN_FORMAT_VERSION = 2;

interface ScenarioResult {
  hash: string;
  crateY: number;
  crateSettled: boolean;
  ballX: number;
  contacts: string[];
}

async function runPinnedScenario(): Promise<ScenarioResult> {
  const game = await createRenderoni({ mode: 'headless', seed: 4242 });

  game.add(
    body({ id: 'floor', shape: 'box', type: 'fixed', size: [20, 1, 20], position: [0, 0, 0] })
  );
  const crate = game.add(
    body({ id: 'crate', shape: 'box', type: 'dynamic', size: [1, 1, 1], position: [0.25, 4, -0.5] })
  );
  const ball = game.add(
    body({ id: 'ball', shape: 'sphere', radius: 0.5, type: 'dynamic', position: [2, 3, 0] })
  );

  game.step(180);

  const result: ScenarioResult = {
    hash: game.getStateHash(),
    crateY: crate.position[1],
    crateSettled: Math.abs(game.transformPipeline.getLinearVelocity(crate.slot!)[1]) < 0.5,
    ballX: ball.position[0],
    contacts: game.physics.getActiveContacts().map((c) => `${c.entityA}|${c.entityB}`),
  };

  game.dispose();
  return result;
}

describe('Determinism gate: scoped exact-hash contract', () => {
  it('reproduces identical hashes and gameplay outcomes across runs on every platform', async () => {
    const first = await runPinnedScenario();
    const second = await runPinnedScenario();

    expect(first.hash).toMatch(/^0x[0-9a-f]{16}$/);
    expect(second.hash).toBe(first.hash);

    // Gameplay outcomes are the portable contract: the crate falls onto the
    // floor, comes to rest, and both bodies report an active floor contact.
    expect(first.crateY).toBeLessThan(4);
    expect(first.crateY).toBeCloseTo(1, 1);
    expect(first.crateSettled).toBe(true);
    expect(first.contacts).toContain('crate|floor');
    expect(first.contacts).toContain('ball|floor');
    expect(second.crateY).toBe(first.crateY);
    expect(second.ballX).toBe(first.ballX);
  });

  it('pins the literal digest only on the exact-hash matrix', async () => {
    const { hash } = await runPinnedScenario();

    if (!isExactStateHashPlatform()) {
      // Off-matrix platforms verify shape only; gameplay outcomes above are the contract.
      expect(hash).toMatch(/^0x[0-9a-f]{16}$/);
      return;
    }

    expect(STATE_HASH_FORMAT_VERSION).toBe(GOLDEN_FORMAT_VERSION);
    expect(hash).toBe(GOLDEN_STATE_HASH);
  });

  it('describes the pinned matrix it applies to', () => {
    expect(EXACT_STATE_HASH_MATRIX).toEqual({ nodeMajor: 22, platform: 'linux', arch: 'x64' });
    expect(isExactStateHashPlatform()).toBe(
      typeof process !== 'undefined' &&
        Number.parseInt(process.versions.node.split('.')[0], 10) === 22 &&
        process.platform === 'linux' &&
        process.arch === 'x64'
    );
  });

  it('refuses to skip the golden digest when CI says this runner is the pinned matrix', () => {
    // The CI job for the pinned matrix sets RENDERONI_REQUIRE_EXACT_HASH=1, so a
    // detection bug fails the build instead of quietly downgrading to shape checks.
    if (process.env.RENDERONI_REQUIRE_EXACT_HASH !== '1') {
      expect(['0', '', undefined]).toContain(process.env.RENDERONI_REQUIRE_EXACT_HASH);
      return;
    }

    expect(isExactStateHashPlatform()).toBe(true);
    expect(process.platform).toBe(EXACT_STATE_HASH_MATRIX.platform);
    expect(process.arch).toBe(EXACT_STATE_HASH_MATRIX.arch);
    expect(Number.parseInt(process.versions.node.split('.')[0], 10)).toBe(EXACT_STATE_HASH_MATRIX.nodeMajor);
  });
});
