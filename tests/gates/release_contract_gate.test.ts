import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Release contract gate.
 *
 * The 0.9 release is a beta, so the only correct dist-tag is `beta`. This gate
 * keeps that rule, the package metadata, and the support files honest without
 * ever contacting a registry.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const publishWorkflow = readFileSync(resolve(root, '.github/workflows/publish.yml'), 'utf8');
const ciWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');

/** Runs a pure helper from the release-contract script without packing anything. */
function callScript(expression: string): unknown {
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      `import('./scripts/check-release-contract.mjs').then((m) => console.log(JSON.stringify(${expression})))`,
    ],
    { cwd: root, encoding: 'utf8' }
  );
  return JSON.parse(output);
}

describe('Release gate: dist-tag rule', () => {
  it('sends every prerelease to beta and only clean semver to latest', () => {
    const resolved = callScript(
      "['0.9.0-beta.1', '0.9.0-beta.12', '1.0.0-rc.1', '1.0.0', '1.2.3', '2.0.0+build.5'].map(m.resolveDistTag)"
    );

    expect(resolved).toEqual(['beta', 'beta', 'beta', 'latest', 'latest', 'latest']);
  });

  it('refuses versions it cannot classify instead of guessing', () => {
    const outcomes = callScript(
      "['', 'latest', '1.0', 'v1.0.0', 'next'].map((v) => { try { return m.resolveDistTag(v); } catch { return 'threw'; } })"
    );

    expect(outcomes).toEqual(['threw', 'threw', 'threw', 'threw', 'threw']);
  });

  it('resolves this repository to the beta tag today', () => {
    expect(packageJson.version).toMatch(/^0\.9\.0-beta\.\d+$/);
    expect(callScript('m.resolveDistTag(' + JSON.stringify(packageJson.version) + ')')).toBe('beta');
  });
});

describe('Release gate: publish workflow', () => {
  it('publishes with the resolved dist-tag and never a hardcoded latest', () => {
    expect(publishWorkflow).toContain('--tag ${{ steps.npm-tag.outputs.tag }}');
    expect(publishWorkflow).toContain('if [[ "$VERSION" == *-* ]]');
    expect(publishWorkflow).toContain('echo "tag=beta" >> "$GITHUB_OUTPUT"');
    expect(publishWorkflow).toContain('echo "tag=latest" >> "$GITHUB_OUTPUT"');
    expect(publishWorkflow).not.toMatch(/npm publish[^\n]*--tag latest/);
    expect(publishWorkflow).not.toMatch(/npm publish[^\n]*--tag beta\b(?![^\n]*outputs)/);
  });

  it('verifies the contract, the audit and the tag before it publishes anything', () => {
    const publishIndex = publishWorkflow.indexOf('npm publish');
    for (const step of ['npm run gate:release', 'npm run gate:security', 'npm run typecheck && npm test']) {
      expect(publishWorkflow).toContain(step);
      expect(publishWorkflow.indexOf(step)).toBeLessThan(publishIndex);
    }
    expect(publishWorkflow).toContain('Refusing to publish prerelease');
  });

  it('keeps the stable path ready without letting a prerelease reach it', () => {
    expect(publishWorkflow).toContain("Publishing stable $VERSION under the 'latest' dist-tag.");
    expect(publishWorkflow).toContain('--provenance');
  });
});

describe('Release gate: package metadata and support files', () => {
  it('carries the metadata a registry listing needs', () => {
    for (const field of [
      'name',
      'version',
      'description',
      'license',
      'author',
      'repository',
      'bugs',
      'homepage',
      'engines',
      'files',
      'exports',
      'keywords',
    ]) {
      expect(packageJson[field], `package.json.${field}`).toBeDefined();
    }

    expect(packageJson.license).toBe('MIT');
    expect(packageJson.private).toBeUndefined();
    expect(packageJson.publishConfig.access).toBe('public');
    expect(packageJson.repository.url).toContain('github.com');
    expect(packageJson.bugs.url).toContain('/issues');
    expect(packageJson.engines.node).toBeTypeOf('string');
  });

  it('ships licence, changelog, support and security files with the package', () => {
    for (const file of ['README.md', 'LICENSE', 'CHANGELOG.md', 'SUPPORT.md', 'SECURITY.md']) {
      expect(existsSync(resolve(root, file)), `${file} on disk`).toBe(true);
      expect(packageJson.files, `${file} in package.json files`).toContain(file);
      expect(readFileSync(resolve(root, file), 'utf8').trim().length).toBeGreaterThan(80);
    }

    expect(readFileSync(resolve(root, 'LICENSE'), 'utf8')).toContain('MIT');
    expect(readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')).toContain(packageJson.version);
    expect(readFileSync(resolve(root, 'SECURITY.md'), 'utf8').toLowerCase()).toContain('vulnerability');
    expect(readFileSync(resolve(root, 'SUPPORT.md'), 'utf8')).toContain('renderoni@beta');
  });

  it('never publishes sources, tests or the console build', () => {
    expect(packageJson.files).toEqual(
      expect.arrayContaining(['dist', 'bin', 'README.md', 'LICENSE', 'CHANGELOG.md', 'SUPPORT.md', 'SECURITY.md'])
    );
    for (const forbidden of ['src', 'tests', 'dist-web', 'scripts', 'docs']) {
      expect(packageJson.files).not.toContain(forbidden);
    }
  });

  it('advertises only export targets the build produces', () => {
    const targets = callScript('m.exportTargets(' + JSON.stringify(packageJson.exports) + ')') as string[];

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.startsWith('dist/'), target).toBe(true);
    }
    expect(targets.some((target) => target.includes('network'))).toBe(false);
  });
});

describe('Release gate: security is enforced in CI', () => {
  it('audits production dependencies on every run', () => {
    expect(packageJson.scripts['gate:security']).toContain('npm audit --omit=dev');
    expect(packageJson.scripts['gate:security']).toContain('--audit-level=high');
    expect(ciWorkflow).toContain('npm run gate:security');
  });

  it('runs the release contract dry run in CI without publishing', () => {
    expect(ciWorkflow).toContain('npm run gate:release');
    expect(ciWorkflow).not.toContain('npm publish');
  });
});
