/**
 * Prints which determinism contract applies to the current runner.
 *
 * The pinned golden digest is only promised on one matrix. Everywhere else the
 * contract is deterministic gameplay outcomes and run-to-run equality, so CI
 * says so out loud instead of leaving people to guess.
 *
 * The matrix is read straight out of src/core/hashing.ts so this script can
 * never drift from the engine.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function readExactHashMatrix(source = readFileSync(resolve(root, 'src/core/hashing.ts'), 'utf8')) {
  const block = /export const EXACT_STATE_HASH_MATRIX = \{([\s\S]*?)\}/.exec(source)?.[1];
  if (!block) {
    throw new Error('EXACT_STATE_HASH_MATRIX was not found in src/core/hashing.ts.');
  }
  const nodeMajor = Number(/nodeMajor:\s*(\d+)/.exec(block)?.[1]);
  const platform = /platform:\s*'([^']+)'/.exec(block)?.[1];
  const arch = /arch:\s*'([^']+)'/.exec(block)?.[1];
  if (!Number.isInteger(nodeMajor) || !platform || !arch) {
    throw new Error('EXACT_STATE_HASH_MATRIX could not be parsed from src/core/hashing.ts.');
  }
  return { nodeMajor, platform, arch };
}

export function isExactHashRunner(matrix, proc = process) {
  return (
    Number.parseInt(proc.versions.node.split('.')[0], 10) === matrix.nodeMajor &&
    proc.platform === matrix.platform &&
    proc.arch === matrix.arch
  );
}

function main() {
  const matrix = readExactHashMatrix();
  const label = `Node ${matrix.nodeMajor} / ${matrix.platform} / ${matrix.arch}`;
  const exact = isExactHashRunner(matrix);

  console.log(`runner        node=${process.versions.node} platform=${process.platform} arch=${process.arch}`);
  console.log(`pinned matrix ${label}`);
  console.log(
    exact
      ? 'contract      the pinned golden state hash IS enforced on this runner.'
      : 'contract      gameplay outcomes and run-to-run equality only; the golden digest is not asserted here.'
  );

  if (process.env.RENDERONI_REQUIRE_EXACT_HASH === '1' && !exact) {
    console.error(
      `\nRENDERONI_REQUIRE_EXACT_HASH=1, but this runner is not the pinned matrix (${label}). ` +
        'Run that job on the pinned matrix, or stop requiring the golden digest there.'
    );
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
