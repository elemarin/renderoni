import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommandSync } from './command-runner.mjs';
import { extractTypeScriptExamples } from './readme-example-parser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspace = resolve(root, '.readme-example-check');

rmSync(workspace, { recursive: true, force: true });
mkdirSync(workspace, { recursive: true });

try {
  const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
  const examples = extractTypeScriptExamples(readme);

  if (examples.length === 0) {
    throw new Error('README.md has no TypeScript examples to typecheck.');
  }

  const files = examples.map((example, index) => {
    const file = resolve(workspace, `example-${index + 1}.mts`);
    writeFileSync(file, example);
    return file;
  });

  runCommandSync(
    'npx',
    ['tsc', '--noEmit', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', ...files],
    { cwd: root, stdio: 'inherit' }
  );
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
