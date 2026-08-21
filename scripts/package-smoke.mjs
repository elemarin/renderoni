import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommandSync } from './command-runner.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspace = resolve(root, '.package-smoke');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

/** Every public subpath, taken from package.json so a new export cannot skip this gate. */
const publicSubpaths = Object.keys(packageJson.exports).map((subpath) =>
  subpath === '.' ? packageJson.name : `${packageJson.name}/${subpath.slice(2)}`
);
/** Subpaths that must stay unreachable in the 0.9 contract. */
const removedSubpaths = ['renderoni/network', 'renderoni/assets', 'renderoni/replays'];
/** Matchers import Vitest, so they are exercised in their own consumer. */
const frameworkFreeSubpaths = publicSubpaths.filter((subpath) => subpath !== 'renderoni/testing/matchers');
let tarball;

function run(command, args, cwd) {
  runCommandSync(command, args, { cwd, stdio: 'inherit' });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });

  const packed = JSON.parse(
    runCommandSync('npm', ['pack', '--json'], { cwd: root, encoding: 'utf8' })
  );
  tarball = resolve(root, packed[0].filename);

  // Export snapshot: the tarball must ship exactly the advertised entry points.
  const packedFiles = new Set(
    packed[0].files.map((file) => file.path.replace(/\\/g, '/').replace(/^package\//, ''))
  );
  const missingExports = [];
  for (const target of Object.values(packageJson.exports).flatMap((entry) => Object.values(entry))) {
    const relative = String(target).replace(/^\.\//, '');
    if (!packedFiles.has(relative)) missingExports.push(relative);
  }
  if (missingExports.length > 0) {
    throw new Error(`Packed tarball is missing advertised export targets: ${missingExports.join(', ')}`);
  }
  if ([...packedFiles].some((file) => file.startsWith('dist/network/'))) {
    throw new Error('Packed tarball ships the networking module, which is not part of the 0.9 contract.');
  }

  const nodeConsumer = resolve(workspace, 'node-consumer');
  mkdirSync(nodeConsumer);
  writeJson(resolve(nodeConsumer, 'package.json'), { private: true, type: 'module' });
  writeFileSync(
    resolve(nodeConsumer, 'index.mjs'),
    `import { createRenderoni } from 'renderoni';
import { RenderoniEngine } from 'renderoni/core';
import { evaluateCheck } from 'renderoni/testing';

// Every public subpath, including framework-free testing, from plain Node with
// no Vitest and no bundler installed.
const subpaths = ${JSON.stringify(frameworkFreeSubpaths, null, 2)};
const modules = await Promise.all(subpaths.map((subpath) => import(subpath)));
if (!modules.every(Boolean) || typeof RenderoniEngine !== 'function') {
  throw new Error('A public Renderoni subpath failed to load.');
}
if (typeof evaluateCheck !== 'function') {
  throw new Error('renderoni/testing must work without Vitest installed.');
}

// Subpaths that are not part of the 0.9 contract must stay unreachable.
for (const removed of ${JSON.stringify(removedSubpaths)}) {
  let reachable = false;
  try {
    await import(removed);
    reachable = true;
  } catch (error) {
    if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
  if (reachable) throw new Error(\`\${removed} must not be a public subpath in this beta.\`);
}

const game = await createRenderoni({ mode: 'headless', seed: 42 });
game.step(1);
if (game.tick !== 1) throw new Error('Headless packed consumer did not advance.');
const checked = evaluateCheck(game, [{ op: 'hasTick', value: 1 }]);
if (checked.passed !== true) throw new Error('Framework-free check evaluation failed in a packed consumer.');
game.dispose();
`
  );
  run('npm', ['install', '--ignore-scripts', '--no-package-lock', '--no-save', tarball], nodeConsumer);
  run('node', ['index.mjs'], nodeConsumer);

  const matcherConsumer = resolve(workspace, 'matcher-consumer');
  mkdirSync(matcherConsumer);
  writeJson(resolve(matcherConsumer, 'package.json'), { private: true, type: 'module' });
  writeFileSync(
    resolve(matcherConsumer, 'index.mjs'),
    `await import('renderoni/testing/matchers');
`
  );
  run('npm', ['install', '--ignore-scripts', '--no-package-lock', '--no-save', tarball, 'vitest'], matcherConsumer);
  run('node', ['index.mjs'], matcherConsumer);

  const viteConsumer = resolve(workspace, 'vite-consumer');
  mkdirSync(resolve(viteConsumer, 'src'), { recursive: true });
  writeJson(resolve(viteConsumer, 'package.json'), { private: true, type: 'module' });
  writeFileSync(resolve(viteConsumer, 'index.html'), '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n');
  // Every browser-safe subpath, derived from package.json exports. The MCP
  // server is Node-only (stdio) and matchers need Vitest, so both stay out.
  const browserSubpaths = frameworkFreeSubpaths.filter((subpath) => subpath !== 'renderoni/mcp');
  writeFileSync(
    resolve(viteConsumer, 'src/main.ts'),
    `${browserSubpaths
      .map((subpath, index) => `import * as module${index} from '${subpath}';`)
      .join('\n')}
import { createRenderoni } from 'renderoni';
import { RenderoniEngine } from 'renderoni/core';

void [createRenderoni, RenderoniEngine, ${browserSubpaths.map((_, index) => `module${index}`).join(', ')}];
`
  );
  run('npm', ['install', '--ignore-scripts', '--no-package-lock', '--no-save', tarball, 'vite'], viteConsumer);
  run('npx', ['vite', 'build'], viteConsumer);
} finally {
  rmSync(workspace, { recursive: true, force: true });
  if (tarball) rmSync(tarball, { force: true });
}
