import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

async function commandRunner() {
  return import(resolve(root, 'scripts/command-runner.mjs'));
}

async function readmeParser() {
  return import(resolve(root, 'scripts/readme-example-parser.mjs'));
}

describe('Windows command runner', () => {
  it('runs npm and npx batch shims through cmd.exe on Windows', async () => {
    const { resolveCommand } = await commandRunner();

    expect(resolveCommand('npm', ['run', 'gate:release'], {
      platform: 'win32',
      comSpec: 'C:\\Windows\\System32\\cmd.exe',
    })).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/v:off', '/s', '/c', 'npm.cmd', 'run', 'gate:release'],
    });
    expect(resolveCommand('npx', ['tsc', '--noEmit'], {
      platform: 'win32',
      comSpec: 'cmd.exe',
    })).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/v:off', '/s', '/c', 'npx.cmd', 'tsc', '--noEmit'],
    });
  });

  describe('README example parser', () => {
    it('extracts TypeScript fences from LF and CRLF files', async () => {
      const { extractTypeScriptExamples } = await readmeParser();

      expect(extractTypeScriptExamples('```ts\nconst lf = true;\n```')).toEqual(['const lf = true;\n']);
      expect(extractTypeScriptExamples('```ts\r\nconst crlf = true;\r\n```')).toEqual([
        'const crlf = true;\r\n',
      ]);
    });
  });

  it('keeps direct executables direct and preserves Windows arguments as vectors', async () => {
    const { resolveCommand } = await commandRunner();

    expect(resolveCommand('node', ['index.mjs'], { platform: 'win32' })).toEqual({
      command: 'node',
      args: ['index.mjs'],
    });
    expect(resolveCommand('npm', ['run', 'script with spaces', 'say "hello"'], {
      platform: 'win32',
    }).args).toEqual([
      '/d', '/v:off', '/s', '/c', 'npm.cmd', 'run', 'script with spaces', 'say "hello"',
    ]);
  });

  it('uses ordinary execFile argument vectors outside Windows', async () => {
    const { resolveCommand } = await commandRunner();

    expect(resolveCommand('npm', ['pack', '--json'], { platform: 'linux' })).toEqual({
      command: 'npm',
      args: ['pack', '--json'],
    });
  });
});
