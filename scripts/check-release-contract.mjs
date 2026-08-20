/**
 * Release contract gate (dry run, publishes nothing).
 *
 * Answers one question before a human ever types `npm publish`: if this commit
 * were released right now, what exactly would go to the registry, and under
 * which dist-tag?
 *
 * It resolves the dist-tag the same way .github/workflows/publish.yml does,
 * checks package metadata and support files, and snapshots the tarball with
 * `npm pack --dry-run` so every advertised subpath export really ships.
 *
 * Usage: node scripts/check-release-contract.mjs   (requires `npm run build` first)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommandSync } from './command-runner.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Files that must exist in the repository and inside the published tarball. */
export const REQUIRED_SUPPORT_FILES = ['README.md', 'LICENSE', 'CHANGELOG.md', 'SUPPORT.md', 'SECURITY.md'];

/** Package fields npm registries and consumers rely on. */
export const REQUIRED_PACKAGE_FIELDS = [
  'name',
  'version',
  'description',
  'license',
  'author',
  'type',
  'exports',
  'files',
  'engines',
  'repository',
  'bugs',
  'homepage',
  'keywords',
];

/** Paths that must never be published. */
export const FORBIDDEN_TARBALL_PATTERNS = [
  /^package\/src\//,
  /^package\/tests\//,
  /^package\/dist-web\//,
  /^package\/scripts\//,
  /^package\/dist\/network\//,
  /^package\/\.github\//,
  /\.env$/,
  /\.tsbuildinfo$/,
];

/**
 * Same rule as the publish workflow: anything with a prerelease part goes out
 * under `beta`, and only a clean semver release may ever claim `latest`.
 */
export function resolveDistTag(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/.exec(String(version ?? ''));
  if (!match) {
    throw new Error(`Not a publishable semver version: ${version}`);
  }
  return match[4] ? 'beta' : 'latest';
}

/** Every file an `exports` entry points at, relative to the package root. */
export function exportTargets(exportsMap) {
  const targets = new Set();
  const walk = (value) => {
    if (typeof value === 'string') {
      if (value.startsWith('./')) targets.add(value.slice(2));
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) walk(nested);
    }
  };
  walk(exportsMap);
  return [...targets].sort();
}

export function packDryRun(cwd = root) {
  const raw = runCommandSync('npm', ['pack', '--dry-run', '--json'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [result] = JSON.parse(raw);
  return result;
}

function main() {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const failures = [];
  const distTag = resolveDistTag(packageJson.version);

  for (const field of REQUIRED_PACKAGE_FIELDS) {
    if (packageJson[field] === undefined) failures.push(`package.json is missing "${field}".`);
  }
  if (packageJson.private === true) failures.push('package.json is marked private and cannot be published.');
  if (packageJson.publishConfig?.access !== 'public') {
    failures.push('package.json publishConfig.access must be "public".');
  }
  if (!packageJson.repository?.url) failures.push('package.json repository.url is missing.');
  if (!packageJson.bugs?.url) failures.push('package.json bugs.url is missing.');
  if (!packageJson.engines?.node) failures.push('package.json engines.node is missing.');

  for (const file of REQUIRED_SUPPORT_FILES) {
    if (!existsSync(resolve(root, file))) failures.push(`${file} is missing from the repository.`);
    if (!packageJson.files.includes(file)) failures.push(`${file} is missing from package.json "files".`);
  }

  const changelog = existsSync(resolve(root, 'CHANGELOG.md'))
    ? readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
    : '';
  if (!changelog.includes(packageJson.version)) {
    failures.push(`CHANGELOG.md has no entry for ${packageJson.version}.`);
  }

  if (!existsSync(resolve(root, 'dist/index.js'))) {
    console.error('Release contract gate: dist/ is missing. Run `npm run build` first.');
    process.exit(1);
  }

  const packed = packDryRun();
  const packedPaths = packed.files.map((file) => file.path.replace(/\\/g, '/'));
  const packedInPackage = new Set(
    packedPaths.map((path) => (path.startsWith('package/') ? path.slice('package/'.length) : path))
  );

  for (const target of exportTargets(packageJson.exports)) {
    if (!packedInPackage.has(target)) {
      failures.push(`Export target ${target} is advertised in "exports" but is not in the tarball.`);
    }
  }
  if (packageJson.bin) {
    for (const binPath of Object.values(packageJson.bin)) {
      const relative = binPath.replace(/^\.\//, '');
      if (!packedInPackage.has(relative)) failures.push(`bin target ${relative} is not in the tarball.`);
    }
  }
  for (const path of packedPaths) {
    const normalized = path.startsWith('package/') ? path : `package/${path}`;
    for (const pattern of FORBIDDEN_TARBALL_PATTERNS) {
      if (pattern.test(normalized)) failures.push(`Tarball contains a file it must not publish: ${path}`);
    }
  }
  if (packedInPackage.has('dist/network/index.js')) {
    failures.push('The networking module is not part of the 0.9 contract and must not be published.');
  }

  const workflow = readFileSync(resolve(root, '.github/workflows/publish.yml'), 'utf8');
  if (!workflow.includes('--tag ${{ steps.npm-tag.outputs.tag }}')) {
    failures.push('publish.yml must publish with the resolved dist-tag, never a hardcoded one.');
  }
  if (!/tag=beta/.test(workflow)) {
    failures.push('publish.yml must select the beta dist-tag for prerelease versions.');
  }

  console.log(`Release contract dry run for ${packageJson.name}@${packageJson.version}`);
  console.log(`  dist-tag       ${distTag}${distTag === 'beta' ? ' (prerelease, never latest)' : ' (stable release)'}`);
  console.log(`  tarball        ${packed.filename}`);
  console.log(`  files          ${packed.entryCount}`);
  console.log(`  unpacked size  ${(packed.unpackedSize / 1024).toFixed(1)} kB`);
  console.log(`  exports        ${exportTargets(packageJson.exports).length} targets, all present`);
  console.log('  published      no. This is a dry run and never contacts the registry with a publish.');

  if (packageJson.version.includes('-') && distTag !== 'beta') {
    failures.push(`Prerelease ${packageJson.version} resolved to "${distTag}" instead of "beta".`);
  }

  if (failures.length > 0) {
    console.error('\nRelease contract gate failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('\nRelease contract gate passed.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
