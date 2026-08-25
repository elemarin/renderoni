import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CI wiring gate.
 *
 * Gates only help if they actually run. This checks that every gate script
 * exists, that `npm run gate:beta` still covers the whole beta contract, and
 * that the workflow really runs typecheck, tests and determinism on all three
 * supported operating systems.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const ciWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const budgetConfig = JSON.parse(readFileSync(resolve(root, 'scripts/bundle-budget.json'), 'utf8'));

function gateStepIds(): string[] {
  const output = execFileSync(
    process.execPath,
    ['-e', "import('./scripts/gate-beta.mjs').then((m) => console.log(JSON.stringify(m.GATE_STEPS.map((s) => s.id))))"],
    { cwd: root, encoding: 'utf8' }
  );
  return JSON.parse(output);
}

/** Loads one of the gate scripts and evaluates an expression against its exports. */
function evalInScript(script: string, expression: string): unknown {
  const output = execFileSync(
    process.execPath,
    ['-e', `import('./scripts/${script}').then((m) => console.log(JSON.stringify(${expression})))`],
    { cwd: root, encoding: 'utf8' }
  );
  return JSON.parse(output);
}

describe('CI wiring: gate commands exist', () => {
  it('exposes every gate as an npm script', () => {
    for (const script of [
      'typecheck',
      'test',
      'build',
      'build:web',
      'test:readme-examples',
      'gate:determinism',
      'gate:mcp',
      'gate:lifecycle',
      'gate:package',
      'gate:budget',
      'gate:release',
      'gate:security',
      'gate:beta',
    ]) {
      expect(packageJson.scripts[script], `npm run ${script}`).toBeTypeOf('string');
    }
  });

  it('points every gate script at a file that exists', () => {
    for (const file of [
      'scripts/gate-beta.mjs',
      'scripts/check-bundle-budget.mjs',
      'scripts/check-release-contract.mjs',
      'scripts/check-readme-examples.mjs',
      'scripts/command-runner.mjs',
      'scripts/package-smoke.mjs',
      'scripts/report-determinism-platform.mjs',
      'scripts/bundle-budget.json',
      'tests/gates/determinism_hash_gate.test.ts',
      'tests/gates/mcp_contract_gate.test.ts',
      'tests/gates/lifecycle_leak_gate.test.ts',
      'tests/gates/console_input_a11y_gate.test.ts',
      'tests/gates/release_contract_gate.test.ts',
      'tests/gates/windows_command_runner.test.ts',
      'docs/beta-release-checklist.md',
    ]) {
      expect(existsSync(resolve(root, file)), file).toBe(true);
    }
  });
});

describe('CI wiring: the aggregate beta gate', () => {
  it('runs the whole beta contract in a sensible order and publishes nothing', () => {
    const ids = gateStepIds();

    expect(ids).toEqual([
      'typecheck',
      'determinism',
      'mcp',
      'lifecycle',
      'tests',
      'build',
      'readme',
      'package',
      'build-web',
      'budget',
      'release-contract',
    ]);
    // The build has to precede anything that consumes dist/.
    expect(ids.indexOf('build')).toBeLessThan(ids.indexOf('readme'));
    expect(ids.indexOf('build')).toBeLessThan(ids.indexOf('package'));
    expect(ids.indexOf('build-web')).toBeLessThan(ids.indexOf('budget'));

    const runner = readFileSync(resolve(root, 'scripts/gate-beta.mjs'), 'utf8');
    expect(runner).not.toContain('npm publish');
    expect(packageJson.scripts['gate:beta']).toBe('node scripts/gate-beta.mjs');
  });

  it('lets a constrained environment skip a step, and rejects a step it does not know', () => {
    const selected = evalInScript(
      'gate-beta.mjs',
      "m.selectSteps(m.GATE_STEPS, { skip: ['package'] }).map((s) => s.id)"
    ) as string[];
    expect(selected).not.toContain('package');
    expect(selected).toContain('determinism');

    const only = evalInScript(
      'gate-beta.mjs',
      "m.selectSteps(m.GATE_STEPS, { only: ['mcp', 'budget'] }).map((s) => s.id)"
    ) as string[];
    expect(only).toEqual(['mcp', 'budget']);

    const unknown = evalInScript(
      'gate-beta.mjs',
      "(() => { try { m.selectSteps(m.GATE_STEPS, { only: ['nope'] }); return 'accepted'; } catch { return 'threw'; } })()"
    );
    expect(unknown).toBe('threw');
  });
});

describe('CI wiring: the workflow', () => {
  it('runs Node 22 on ubuntu, macOS and windows', () => {
    expect(ciWorkflow).toContain('os: [ubuntu-latest, macos-latest, windows-latest]');
    expect(ciWorkflow).toContain('node-version: 22');
    expect(ciWorkflow).toContain('fail-fast: false');
  });

  it('typechecks, tests and checks determinism on every matrix entry', () => {
    const verifyJob = ciWorkflow.slice(ciWorkflow.indexOf('  verify:'), ciWorkflow.indexOf('  beta-gate:'));

    expect(verifyJob).toContain('npm run typecheck');
    expect(verifyJob).toContain('npm run gate:determinism');
    expect(verifyJob).toContain('npm test');
    expect(verifyJob).toContain('node scripts/report-determinism-platform.mjs');
  });

  it('runs portable release scripts directly on Windows while retaining the heavy aggregate gate on Ubuntu', () => {
    const verifyJob = ciWorkflow.slice(ciWorkflow.indexOf('  verify:'), ciWorkflow.indexOf('  beta-gate:'));
    const betaGate = ciWorkflow.slice(ciWorkflow.indexOf('  beta-gate:'), ciWorkflow.indexOf('  security:'));

    expect(verifyJob).toContain("if: runner.os == 'Windows'");
    expect(verifyJob).toContain('npm run test:readme-examples');
    expect(verifyJob).toContain('npm run gate:package');
    expect(verifyJob).toContain('npm run gate:release');
    expect(betaGate).toContain('runs-on: ubuntu-latest');
  });

  it('requires the pinned golden digest on Linux x64 only', () => {
    expect(ciWorkflow).toContain(
      "RENDERONI_REQUIRE_EXACT_HASH: ${{ (runner.os == 'Linux' && runner.arch == 'X64') && '1' || '0' }}"
    );

    const determinismGate = readFileSync(resolve(root, 'tests/gates/determinism_hash_gate.test.ts'), 'utf8');
    expect(determinismGate).toContain('isExactStateHashPlatform');
    expect(determinismGate).toContain('RENDERONI_REQUIRE_EXACT_HASH');
  });

  it('runs the aggregate gate and the security job', () => {
    expect(ciWorkflow).toContain('npm run gate:beta');
    expect(ciWorkflow).toContain('npm run gate:security');
  });
});

describe('CI wiring: load budgets', () => {
  it('keeps a documented baseline under every cap', () => {
    expect(budgetConfig.budgets.length).toBeGreaterThanOrEqual(4);

    for (const budget of budgetConfig.budgets) {
      expect(budget.baselineBytes, budget.id).toBeGreaterThan(0);
      expect(budget.maxBytes, budget.id).toBeGreaterThanOrEqual(budget.baselineBytes);
      expect(budget.label, budget.id).toBeTypeOf('string');
    }

    const ids = budgetConfig.budgets.map((budget: { id: string }) => budget.id);
    expect(ids).toContain('initial-js-gzip');
    expect(ids).toContain('initial-total-gzip');
    expect(budgetConfig.defaultTolerancePercent).toBeGreaterThan(0);
    expect(budgetConfig.maxInitialChunkRawBytes).toBeGreaterThan(0);
  });

  it('enforces initial chunk raw byte caps in checkLazyRules', () => {
    const failures = evalInScript(
      'check-bundle-budget.mjs',
      `m.checkLazyRules(m.readBudgetConfig(), {
        chunks: [],
        jsChunks: [{ key: 'entry', file: 'entry.js', initial: true, rawBytes: 900000, gzipBytes: 300000 }],
      })`
    ) as string[];

    expect(failures.some((failure) => failure.includes('raw, over the'))).toBe(true);
  });
});

describe('CI wiring: platform detection is checkable', () => {
  it('reads the pinned matrix from the engine instead of repeating it', () => {
    const matrix = evalInScript('report-determinism-platform.mjs', 'm.readExactHashMatrix()');
    expect(matrix).toEqual({ nodeMajor: 22, platform: 'linux', arch: 'x64' });
  });

  it('recognises an off-matrix runner', () => {
    const outcome = evalInScript(
      'report-determinism-platform.mjs',
      `(() => {
        const matrix = m.readExactHashMatrix();
        return {
          onMatrix: m.isExactHashRunner(matrix, { versions: { node: '22.11.0' }, platform: 'linux', arch: 'x64' }),
          otherOs: m.isExactHashRunner(matrix, { versions: { node: '22.11.0' }, platform: 'win32', arch: 'x64' }),
          otherArch: m.isExactHashRunner(matrix, { versions: { node: '22.11.0' }, platform: 'linux', arch: 'arm64' }),
          otherNode: m.isExactHashRunner(matrix, { versions: { node: '20.11.0' }, platform: 'linux', arch: 'x64' }),
        };
      })()`
    );

    expect(outcome).toEqual({ onMatrix: true, otherOs: false, otherArch: false, otherNode: false });
  });
});
