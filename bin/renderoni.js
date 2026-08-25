#!/usr/bin/env node

/**
 * Renderoni CLI Binary
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const version = packageJson.version;

const USAGE = `
🍝 Renderoni — The Agent-Native 3D Game Engine for TypeScript

Usage:
  renderoni generate <kind> "<prompt>" [options]
  renderoni add <kind> <name> [options]
  renderoni editor [--port=N] [--project=path]
  renderoni mcp
  renderoni --version
  renderoni --help

Kinds:
  model     Placeable 3D prop/item (Object3D factory TypeScript)
  terrain   Environment floor/walls/shell (Object3D factory TypeScript)
  scene     Playable area inventory (SceneInventory JSON)
  level     Progression manifest referencing scenes (LevelDefinition JSON)

Options:
  -o, --output <path>    Destination file or directory path
  -i, --image <path>     User-provided reference image (png, jpg, webp)
  -r, --revise <path>    Existing file to revise with Copilot
  --project <path>       Target project directory (default: cwd)
  -f, --force            Overwrite existing files
  --dry-run              Validate and output generated content without writing
  --json                 Print machine-readable JSON output on stdout
  --no-context           Skip scanning project for existing factory names
  --port <number>        Port for editor server (default: 4747)
  -v, --version          Print version
  -h, --help             Show this help message
`;

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }

  if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
    console.log(`renderoni v${version}`);
    process.exit(0);
  }

  const command = rawArgs[0];

  if (command === 'mcp') {
    const { createRenderoni } = await import('../dist/index.js');
    const { serveStdio } = await import('../dist/mcp/index.js');
    await serveStdio({
      transport: 'stdio',
      createGame: () => createRenderoni({ mode: 'headless' }),
    });
    return;
  }

  if (command === 'editor') {
    const { startEditorServer } = await import('../dist/editor/index.js');
    const portArg = rawArgs.find((a) => a.startsWith('--port='));
    const port = portArg ? Number(portArg.split('=')[1]) : undefined;
    const projectArg = rawArgs.find((a) => a.startsWith('--project='));
    const projectRoot = projectArg ? projectArg.split('=')[1] : process.cwd();

    const { url } = await startEditorServer({ port, projectRoot });
    console.log(`🍝 Renderoni Editor running at ${url}`);
    return;
  }

  if (command === 'generate') {
    const { values, positionals } = parseArgs({
      args: rawArgs.slice(1),
      options: {
        output: { type: 'string', short: 'o' },
        image: { type: 'string', short: 'i' },
        revise: { type: 'string', short: 'r' },
        project: { type: 'string' },
        force: { type: 'boolean', short: 'f', default: false },
        'dry-run': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        'no-context': { type: 'boolean', default: false },
        'no-preview': { type: 'boolean', default: false },
      },
      allowPositionals: true,
    });

    const kind = positionals[0];
    const prompt = positionals.slice(1).join(' ').trim();

    const validKinds = ['model', 'terrain', 'scene', 'level'];
    if (!kind || !validKinds.includes(kind)) {
      const err = `Invalid kind: "${kind}". Must be one of: ${validKinds.join(', ')}`;
      if (values.json) {
        console.log(JSON.stringify({ status: 'error', code: 'INVALID_KIND', message: err }));
      } else {
        console.error(`Error: ${err}`);
      }
      process.exit(1);
    }

    if (!prompt && !values.revise) {
      const err = 'Prompt is required for generation.';
      if (values.json) {
        console.log(JSON.stringify({ status: 'error', code: 'MISSING_PROMPT', message: err }));
      } else {
        console.error(`Error: ${err}`);
      }
      process.exit(1);
    }

    const projectRoot = resolve(values.project ?? process.cwd());
    const {
      generateAsset,
      checkGenerationStatus,
      resolveSafePath,
      checkFileExists,
      atomicWriteFile,
      scanProjectAssets,
    } = await import('../dist/editor/index.js');

    const status = await checkGenerationStatus();
    if (!status.connected || !status.authenticated) {
      const msg = status.message ?? 'GitHub Copilot is not authenticated. Please run "copilot auth" or ensure the Copilot CLI daemon is active.';
      if (values.json) {
        console.log(JSON.stringify({ status: 'error', code: 'COPILOT_UNAVAILABLE', message: msg }));
      } else {
        console.error(`Copilot Error: ${msg}`);
      }
      process.exit(2);
    }

    let existingCode = undefined;
    let targetFilePath = undefined;

    if (values.revise) {
      const revisePath = resolveSafePath(projectRoot, values.revise);
      try {
        existingCode = await readFile(revisePath, 'utf-8');
        targetFilePath = revisePath;
      } catch (err) {
        const msg = `Cannot read file to revise: ${values.revise}`;
        if (values.json) {
          console.log(JSON.stringify({ status: 'error', code: 'FILE_READ_ERROR', message: msg }));
        } else {
          console.error(`Error: ${msg}`);
        }
        process.exit(1);
      }
    }

    if (values.output) {
      targetFilePath = resolveSafePath(projectRoot, values.output);
    }

    if (targetFilePath && checkFileExists(targetFilePath) && !values.force && !values.revise) {
      const msg = `Destination file already exists: ${targetFilePath}. Use --force to overwrite.`;
      if (values.json) {
        console.log(JSON.stringify({ status: 'error', code: 'FILE_EXISTS', message: msg }));
      } else {
        console.error(`Error: ${msg}`);
      }
      process.exit(1);
    }

    let context = undefined;
    if (kind === 'scene' && !values['no-context']) {
      try {
        const assets = await scanProjectAssets(projectRoot);
        const factories = assets.models.flatMap((m) => m.factories.map((f) => f.name));
        if (factories.length > 0) {
          context = `Available model factories in project: ${factories.join(', ')}`;
        }
      } catch {
        // ignore asset scan errors
      }
    }

    let result;
    try {
      result = await generateAsset({
        kind,
        prompt: prompt || 'Revise asset according to instructions',
        imagePath: values.image ? resolveSafePath(projectRoot, values.image) : undefined,
        existingCode,
        context,
        projectRoot,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (values.json) {
        console.log(JSON.stringify({ status: 'error', code: 'GENERATION_FAILED', message: msg }));
      } else {
        console.error(`Generation failed: ${msg}`);
      }
      process.exit(3);
    }

    if (!result.validation.valid) {
      const msg = `Generated content failed validation:\n- ${result.validation.errors.join('\n- ')}`;
      if (values.json) {
        console.log(JSON.stringify({ status: 'error', code: 'VALIDATION_FAILED', message: msg, errors: result.validation.errors, codePreview: result.code }));
      } else {
        console.error(`Validation Error:\n${msg}`);
      }
      process.exit(1);
    }

    if (values['dry-run']) {
      if (values.json) {
        console.log(JSON.stringify({
          status: 'ok',
          dryRun: true,
          kind,
          language: result.language,
          targetPath: targetFilePath ?? null,
          content: result.code,
        }));
      } else {
        console.log(`[DRY RUN] Generated valid ${kind}:\n\n${result.code}`);
      }
      process.exit(0);
    }

    if (!targetFilePath) {
      const defaultFilename = kind === 'scene' ? 'scene.json' : kind === 'level' ? 'level.json' : 'Generated.ts';
      const defaultFolder = kind === 'terrain' ? 'models/terrain' : kind === 'scene' ? 'scenes/generated' : kind === 'level' ? 'levels/generated' : 'models';
      targetFilePath = resolveSafePath(projectRoot, join(defaultFolder, defaultFilename));
    }

    await atomicWriteFile(targetFilePath, result.code);

    if (values.json) {
      console.log(JSON.stringify({
        status: 'ok',
        kind,
        path: targetFilePath,
        bytesWritten: Buffer.byteLength(result.code, 'utf-8'),
        content: result.code,
      }));
    } else {
      console.log(`✔ Generated ${kind}: ${targetFilePath} (${Buffer.byteLength(result.code, 'utf-8')} bytes)`);
    }
    process.exit(0);
  }

  if (command === 'add') {
    const { values, positionals } = parseArgs({
      args: rawArgs.slice(1),
      options: {
        output: { type: 'string', short: 'o' },
        project: { type: 'string' },
        force: { type: 'boolean', short: 'f', default: false },
        'dry-run': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: true,
    });

    const kind = positionals[0];
    const name = positionals[1];

    const validKinds = ['model', 'terrain', 'scene', 'level'];
    if (!kind || !validKinds.includes(kind)) {
      const err = `Invalid kind: "${kind}". Must be one of: ${validKinds.join(', ')}`;
      if (values.json) {
        console.log(JSON.stringify({ status: 'error', code: 'INVALID_KIND', message: err }));
      } else {
        console.error(`Error: ${err}`);
      }
      process.exit(1);
    }

    if (!name) {
      const err = `Name is required for scaffolding. Example: renderoni add ${kind} Lantern`;
      if (values.json) {
        console.log(JSON.stringify({ status: 'error', code: 'MISSING_NAME', message: err }));
      } else {
        console.error(`Error: ${err}`);
      }
      process.exit(1);
    }

    const projectRoot = resolve(values.project ?? process.cwd());
    const { scaffoldAsset, resolveSafePath, checkFileExists, atomicWriteFile } = await import('../dist/editor/index.js');

    const scaffold = scaffoldAsset(kind, name);
    const targetFilePath = resolveSafePath(projectRoot, values.output ?? scaffold.defaultRelativePath);

    if (checkFileExists(targetFilePath) && !values.force) {
      const msg = `Destination file already exists: ${targetFilePath}. Use --force to overwrite.`;
      if (values.json) {
        console.log(JSON.stringify({ status: 'error', code: 'FILE_EXISTS', message: msg }));
      } else {
        console.error(`Error: ${msg}`);
      }
      process.exit(1);
    }

    if (values['dry-run']) {
      if (values.json) {
        console.log(JSON.stringify({
          status: 'ok',
          dryRun: true,
          kind,
          path: targetFilePath,
          content: scaffold.content,
        }));
      } else {
        console.log(`[DRY RUN] Scaffolded ${kind} (${targetFilePath}):\n\n${scaffold.content}`);
      }
      process.exit(0);
    }

    await atomicWriteFile(targetFilePath, scaffold.content);

    if (values.json) {
      console.log(JSON.stringify({
        status: 'ok',
        kind,
        path: targetFilePath,
        bytesWritten: Buffer.byteLength(scaffold.content, 'utf-8'),
        content: scaffold.content,
      }));
    } else {
      console.log(`✔ Scaffolded ${kind}: ${targetFilePath} (${Buffer.byteLength(scaffold.content, 'utf-8')} bytes)`);
    }
    process.exit(0);
  }

  console.error(`Unknown command: ${command}\nRun "renderoni --help" for usage.`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
