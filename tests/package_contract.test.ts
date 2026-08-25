import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import tsupConfig from '../tsup.config.js';
import { RENDERONI_VERSION } from '../src/version.js';
import { RenderoniEngine } from '../src/core/index.js';
import * as frameworkFreeTesting from '../src/testing/index.js';
import * as input from '../src/input/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(here, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const readme = readFileSync(resolve(here, '../README.md'), 'utf-8');
const support = readFileSync(resolve(here, '../SUPPORT.md'), 'utf-8');
const publishWorkflow = readFileSync(resolve(here, '../.github/workflows/publish.yml'), 'utf-8');

describe('1.0 package contract', () => {
  it('reports a valid semver version (1.0.0)', () => {
    expect(packageJson.version).toMatch(/^1\.0\.0$/);
  });

  it('keeps src/version.ts (the browser/package version source) in sync with package.json', () => {
    expect(RENDERONI_VERSION).toBe(packageJson.version);
  });

  it('does not publish renderoni/network as a public subpath export', () => {
    expect(Object.keys(packageJson.exports)).not.toContain('./network');
  });

  it('does not build a network entry point via tsup', () => {
    const config = typeof tsupConfig === 'function' ? tsupConfig({} as never) : tsupConfig;
    const entry = (config as { entry?: Record<string, string> }).entry ?? {};
    expect(Object.keys(entry)).not.toContain('network/index');
  });

  it('does not depend on nipplejs or mobile touch libraries', () => {
    expect(packageJson.dependencies?.nipplejs).toBeUndefined();
  });

  it('publishes the stable input subpath and RenderoniEngine from core', () => {
    expect(packageJson.exports['./input']).toBeDefined();
    expect(RenderoniEngine).toBeTypeOf('function');
    expect(input.InputManager).toBeTypeOf('function');
  });

  it('keeps framework-free testing separate from Vitest matchers', () => {
    expect(frameworkFreeTesting.evaluateCheck).toBeTypeOf('function');
    expect('expect' in frameworkFreeTesting).toBe(false);
    expect(packageJson.peerDependencies.vitest).toBeDefined();
    expect(packageJson.peerDependenciesMeta.vitest.optional).toBe(true);
  });

  it('requires Three.js and Rapier peers for the installable engine', () => {
    expect(packageJson.peerDependencies.three).toBeDefined();
    expect(packageJson.peerDependencies['@dimforge/rapier3d-compat']).toBeDefined();
    expect(packageJson.peerDependenciesMeta.three).toBeUndefined();
    expect(packageJson.peerDependenciesMeta['@dimforge/rapier3d-compat']).toBeUndefined();
  });

  it('documents the install and mcp commands in package contracts', () => {
    expect(readme).toContain('npm install renderoni');
    expect(readme).toContain('npx renderoni');
    expect(support).toContain('renderoni');
  });

  it('publishes prereleases under beta rather than latest', () => {
    expect(publishWorkflow).toContain('if [[ "$VERSION" == *-* ]]');
    expect(publishWorkflow).toContain('echo "tag=beta" >> "$GITHUB_OUTPUT"');
  });
});
