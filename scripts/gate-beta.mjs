/**
 * Aggregate 0.9 beta release gate.
 *
 * Runs every automated release check in a sensible order and prints one
 * summary. It never publishes anything.
 *
 * Usage:
 *   npm run gate:beta
 *   npm run gate:beta -- --only=determinism,mcp
 *   npm run gate:beta -- --skip=package        # e.g. no registry access
 *
 * `--skip` is for constrained environments only. CI runs the full list.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommandSync } from './command-runner.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const GATE_STEPS = [
  { id: 'typecheck', title: 'TypeScript contract', args: ['run', 'typecheck'] },
  { id: 'determinism', title: 'Deterministic kernel & pinned hash', args: ['run', 'gate:determinism'] },
  { id: 'mcp', title: 'MCP agent contract (negative paths, Tier 0 budget)', args: ['run', 'gate:mcp'] },
  { id: 'lifecycle', title: 'Lifecycle, leaks & ownership', args: ['run', 'gate:lifecycle'] },
  { id: 'build', title: 'Package build (tsup)', args: ['run', 'build'] },
  { id: 'tests', title: 'Full test suite', args: ['test'] },
  { id: 'readme', title: 'README examples typecheck', args: ['run', 'test:readme-examples'] },
  { id: 'package', title: 'Packed consumer smoke (Node, Vite, framework-free testing)', args: ['run', 'gate:package'], needsNetwork: true },
  { id: 'build-web', title: 'Console web build', args: ['run', 'build:web'] },
  { id: 'budget', title: 'Bundle & load budgets', args: ['run', 'gate:budget'] },
  { id: 'release-contract', title: 'Release contract dry run (no publish)', args: ['run', 'gate:release'] },
];

function parseList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function selectSteps(steps, { only = [], skip = [] } = {}) {
  const unknown = [...only, ...skip].filter((id) => !steps.some((step) => step.id === id));
  if (unknown.length > 0) {
    throw new Error(`Unknown gate step(s): ${unknown.join(', ')}. Known: ${steps.map((s) => s.id).join(', ')}`);
  }
  return steps.filter((step) => (only.length === 0 || only.includes(step.id)) && !skip.includes(step.id));
}

function main() {
  const argv = process.argv.slice(2);
  const only = parseList(argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length));
  const skip = [
    ...parseList(argv.find((arg) => arg.startsWith('--skip='))?.slice('--skip='.length)),
    ...parseList(process.env.RENDERONI_GATE_SKIP),
  ];

  const steps = selectSteps(GATE_STEPS, { only, skip });
  const skipped = GATE_STEPS.filter((step) => !steps.includes(step));
  const results = [];

  console.log(`Renderoni 0.9 beta gate: ${steps.length} checks, nothing is published.\n`);

  for (const [index, step] of steps.entries()) {
    const label = `[${index + 1}/${steps.length}] ${step.id} — ${step.title}`;
    console.log(`\n=== ${label} ===`);
    const startedAt = Date.now();
    try {
      runCommandSync('npm', step.args, { cwd: root, stdio: 'inherit' });
      results.push({ ...step, ok: true, ms: Date.now() - startedAt });
    } catch (error) {
      results.push({ ...step, ok: false, ms: Date.now() - startedAt });
      console.error(`\nGate failed at "${step.id}" (${step.title}).`);
      if (step.needsNetwork) {
        console.error('This step installs the packed tarball, so it needs npm registry access.');
      }
      printSummary(results, skipped);
      process.exit(typeof error.status === 'number' ? error.status : 1);
    }
  }

  printSummary(results, skipped);
  console.log('\n0.9 beta gate passed. Manual items still apply: docs/beta-release-checklist.md.');
}

function printSummary(results, skipped) {
  console.log('\nGate summary');
  console.log('-'.repeat(72));
  for (const result of results) {
    console.log(`  ${result.ok ? 'pass' : 'FAIL'}  ${result.id.padEnd(18)} ${(result.ms / 1000).toFixed(1)}s  ${result.title}`);
  }
  for (const step of skipped) {
    console.log(`  skip  ${step.id.padEnd(18)}      ${step.title}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
