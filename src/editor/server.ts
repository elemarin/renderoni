/**
 * Standalone local server for the Renderoni Editor:
 *   - Serves the static tabbed UI (Models / Terrain / Levels).
 *   - POST /api/status  -> Copilot CLI connection/auth status.
 *   - POST /api/generate -> runs one Copilot turn for the requested tab.
 *   - POST /api/save     -> writes generated code/JSON to disk in the caller's project.
 *
 * The Copilot SDK spawns/talks to the local `copilot` CLI (JSON-RPC over
 * stdio), so this must run in Node — it cannot run directly in a browser tab.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCopilotStatus, generate, type GenerateRequest } from './copilot-session.js';
import { EDITOR_TABS, type EditorTab } from './prompts.js';
import { scanProjectAssets } from './project-assets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
// The editor server ships as `dist/editor/server.js` inside the renderoni
// package itself, so the package's own build output (`dist/core`,
// `dist/presets`, etc.) is always one level up — this lets the in-browser
// preview `import` the *real*, already-bundled engine (with `createRenderoni`,
// `model`, `body`, ...) instead of trying to re-transpile/inline the engine's
// own internal source tree (which drags in Rapier/typebox and other npm
// deps that can't be blob-URL-imported directly).
const VENDOR_DIST_DIR = join(__dirname, '..');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export interface EditorServerOptions {
  port?: number;
  /** Project root that generated files are allowed to be saved under. */
  projectRoot?: string;
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;

  if (pathname.startsWith('/vendor/dist/')) {
    return serveFromRoot(VENDOR_DIST_DIR, pathname.slice('/vendor/dist/'.length), res);
  }

  const filePath = normalize(join(PUBLIC_DIR, pathname));

  // Guard against path traversal escaping the public directory.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return true;
  }
  if (!existsSync(filePath)) return false;

  const contents = await readFile(filePath);
  const type = MIME[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(contents);
  return true;
}

/** Serves a file from an arbitrary root directory, guarding against path
 * traversal escaping that root. Used for `/vendor/dist/*` (the engine's own
 * pre-built bundle, so the browser preview can `import` real engine code). */
async function serveFromRoot(root: string, relativePath: string, res: ServerResponse): Promise<boolean> {
  const filePath = normalize(join(root, relativePath));
  if (!filePath.startsWith(normalize(root))) {
    res.writeHead(403).end('Forbidden');
    return true;
  }
  if (!existsSync(filePath)) return false;

  const contents = await readFile(filePath);
  const type = MIME[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(contents);
  return true;
}

/** Resolve a user-supplied relative save path safely under `projectRoot`. */
function resolveSavePath(projectRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error('relativePath must be relative');
  }
  const resolved = resolve(projectRoot, relativePath);
  if (!resolved.startsWith(resolve(projectRoot))) {
    throw new Error('relativePath escapes the project root');
  }
  return resolved;
}

export function startEditorServer(options: EditorServerOptions = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const port = options.port ?? 4747;
  const projectRoot = options.projectRoot ?? process.cwd();

  const server = createServer((req, res) => {
    handleRequest(req, res, projectRoot).catch((err) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });

  return new Promise((resolvePromise) => {
    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      resolvePromise({
        url,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, projectRoot: string): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const status = await checkCopilotStatus();
    sendJson(res, 200, status);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/assets') {
    const assets = await scanProjectAssets(projectRoot);
    sendJson(res, 200, assets);
    return;
  }

  // Read-only file fetch used by the in-browser preview to inline sibling
  // modules a previewed factory imports (e.g. a shared `materials.ts` texture
  // helper). Real projects sometimes keep such helpers one or two folders
  // above a game's own directory, so this intentionally does NOT enforce the
  // same "must stay under projectRoot" boundary as /api/save — it's a
  // read-only convenience for the local user running their own editor, not a
  // network-exposed endpoint.
  if (req.method === 'GET' && url.pathname === '/api/file') {
    const relativePath = url.searchParams.get('path');
    if (!relativePath || isAbsolute(relativePath)) {
      sendJson(res, 400, { error: 'path query param (relative) is required' });
      return;
    }
    const filePath = resolve(projectRoot, relativePath);
    // Source imports use `.js` specifiers (TS/ESM convention) but the file on
    // disk is usually `.ts` — try both.
    const candidates = filePath.endsWith('.js')
      ? [filePath, filePath.replace(/\.js$/, '.ts')]
      : [filePath];
    for (const candidate of candidates) {
      try {
        const content = await readFile(candidate, 'utf-8');
        sendJson(res, 200, { content });
        return;
      } catch {
        // try next candidate
      }
    }
    sendJson(res, 404, { error: `Not found: ${relativePath}` });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    const body = await readJsonBody(req);
    if (!EDITOR_TABS.includes(body.tab)) {
      sendJson(res, 400, { error: `tab must be one of: ${EDITOR_TABS.join(', ')}` });
      return;
    }
    if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      sendJson(res, 400, { error: 'prompt is required' });
      return;
    }
    const request: GenerateRequest = {
      tab: body.tab as EditorTab,
      prompt: body.prompt,
      imageDataUrl: typeof body.imageDataUrl === 'string' ? body.imageDataUrl : undefined,
      context: typeof body.context === 'string' ? body.context : undefined,
      existingCode: typeof body.existingCode === 'string' ? body.existingCode : undefined,
    };
    const result = await generate(request);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    const body = await readJsonBody(req);
    if (typeof body.relativePath !== 'string' || typeof body.content !== 'string') {
      sendJson(res, 400, { error: 'relativePath and content are required' });
      return;
    }
    const filePath = resolveSavePath(projectRoot, body.relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body.content, 'utf-8');
    sendJson(res, 200, { savedTo: filePath });
    return;
  }

  if (req.method === 'GET') {
    const served = await serveStatic(req, res);
    if (served) return;
  }

  res.writeHead(404).end('Not found');
}
