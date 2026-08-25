/**
 * Standalone local server for the Renderoni Editor:
 *   - Serves the static tabbed UI (Models / Terrain / Levels / Scenes).
 *   - POST /api/status   -> Copilot CLI connection/auth status.
 *   - POST /api/generate -> runs one Copilot turn for the requested kind.
 *   - POST /api/save     -> writes generated code/JSON safely to disk.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCopilotStatus } from './copilot-session.js';
import { resolveSafePath } from './file-safety.js';
import { generateAsset, type GenerateAssetOptions } from './generation-service.js';
import { EDITOR_TABS, type AssetKind } from './prompts.js';
import { scanProjectAssets } from './project-assets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
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

export function startEditorServer(
  options: EditorServerOptions = {}
): Promise<{ url: string; close: () => Promise<void> }> {
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

  if (req.method === 'GET' && url.pathname === '/api/file') {
    const relativePath = url.searchParams.get('path');
    if (!relativePath || isAbsolute(relativePath)) {
      sendJson(res, 400, { error: 'path query param (relative) is required' });
      return;
    }
    const filePath = resolve(projectRoot, relativePath);
    const candidates = filePath.endsWith('.js') ? [filePath, filePath.replace(/\.js$/, '.ts')] : [filePath];
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
    const kind = body.tab ?? body.kind;
    if (!EDITOR_TABS.includes(kind)) {
      sendJson(res, 400, { error: `tab must be one of: ${EDITOR_TABS.join(', ')}` });
      return;
    }
    if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      sendJson(res, 400, { error: 'prompt is required' });
      return;
    }
    const genOptions: GenerateAssetOptions = {
      kind: kind as AssetKind,
      prompt: body.prompt,
      imageDataUrl: typeof body.imageDataUrl === 'string' ? body.imageDataUrl : undefined,
      context: typeof body.context === 'string' ? body.context : undefined,
      existingCode: typeof body.existingCode === 'string' ? body.existingCode : undefined,
      projectRoot,
    };
    const result = await generateAsset(genOptions);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    const body = await readJsonBody(req);
    if (typeof body.relativePath !== 'string' || typeof body.content !== 'string') {
      sendJson(res, 400, { error: 'relativePath and content are required' });
      return;
    }
    const filePath = resolveSafePath(projectRoot, body.relativePath);
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
