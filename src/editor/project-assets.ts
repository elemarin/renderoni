/**
 * Scans a Renderoni game project folder for existing generated assets so the
 * editor can browse/iterate on them instead of only creating new ones from
 * scratch.
 *
 * Deliberately tolerant of real-world code (not just the img2threejs
 * convention): factory functions may take default-valued params or return
 * custom wrapper types, not just `(): THREE.Object3D`.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'dist-web', '.package-smoke']);
const MAX_FILES = 400;
const MAX_DEPTH = 8;

export interface DiscoveredFactory {
  /** Exported function name, e.g. `createWoodCrateModel`. */
  name: string;
  /** Raw parameter list source, e.g. `variant: number = 0`. */
  params: string;
  /** True when every parameter has a default value (safe to call with zero args for preview). */
  previewable: boolean;
}

export interface DiscoveredModelFile {
  relativePath: string;
  kind: 'model' | 'structure' | 'terrain';
  code: string;
  factories: DiscoveredFactory[];
}

export interface DiscoveredLevelFile {
  relativePath: string;
  raw: string;
  elementCount: number;
}

export interface ProjectAssets {
  models: DiscoveredModelFile[];
  levels: DiscoveredLevelFile[];
}

const FACTORY_PATTERN = /export function (\w+)\s*\(([^)]*)\)/g;

/** Splits a raw parameter-list source on top-level commas only (ignoring
 * commas nested inside `{}`/`[]`/`()`, e.g. an inline object-type parameter
 * with several fields). */
function splitTopLevelParams(params: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of params) {
    if ('{[('.includes(ch)) depth++;
    if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function analyzeFactories(code: string): DiscoveredFactory[] {
  const factories: DiscoveredFactory[] = [];
  let match: RegExpExecArray | null;
  FACTORY_PATTERN.lastIndex = 0;
  while ((match = FACTORY_PATTERN.exec(code))) {
    const [, name, params] = match;
    if (!/^(create|build)/.test(name)) continue;
    const trimmed = params.trim();
    const paramList = splitTopLevelParams(trimmed);
    const allDefaulted = paramList.length === 0 || paramList.every((p) => p.includes('='));
    // The editor can also preview factories whose first parameter is a
    // RenderoniEngine — it spins up a real (throwaway) engine instance and
    // synthesizes stand-in values for the remaining parameters from their
    // declared types, so `build*(engine, ...)` factories preview too, not
    // just self-contained `create*()` ones.
    const enginePreviewable = paramList.length > 0 && /^engine\s*:\s*RenderoniEngine\b/.test(paramList[0]);
    factories.push({ name, params: trimmed, previewable: allDefaulted || enginePreviewable });
  }
  return factories;
}

async function walk(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, depth + 1, out);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.json'))) {
      out.push(full);
    }
  }
}

/** Classifies a model file's editor `kind` purely by which `models/` subfolder
 * it lives in — deterministic and author-controlled, not a filename/factory
 * name guess. Convention (see docs/architecture/levels.md):
 *   models/terrain/*   -> 'terrain'   (floors, ceilings, ground shape)
 *   models/structure/* -> 'structure' (walls, rooms, doorframes)
 *   everything else     -> 'model'    (props, decor, items, actors) */
function classifyModelKind(relativePath: string): 'model' | 'structure' | 'terrain' {
  const normalized = relativePath.split('\\').join('/');
  const segments = normalized.split('/');
  const modelsIdx = segments.lastIndexOf('models');
  if (modelsIdx !== -1) {
    const nextSegment = segments[modelsIdx + 1];
    if (nextSegment === 'terrain') return 'terrain';
    if (nextSegment === 'structure') return 'structure';
  }
  return 'model';
}

export async function scanProjectAssets(projectRoot: string): Promise<ProjectAssets> {
  const files: string[] = [];
  await walk(projectRoot, 0, files);

  const models: DiscoveredModelFile[] = [];
  const levels: DiscoveredLevelFile[] = [];

  for (const filePath of files) {
    const relativePath = relative(projectRoot, filePath);
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    if (filePath.endsWith('.ts')) {
      const factories = analyzeFactories(content);
      if (factories.length === 0) continue;
      models.push({ relativePath, kind: classifyModelKind(relativePath), code: content, factories });
    } else if (filePath.endsWith('.json')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.elements) && typeof parsed.version === 'number') {
          levels.push({ relativePath, raw: content, elementCount: parsed.elements.length });
        }
      } catch {
        // Not JSON we care about; ignore.
      }
    }
  }

  models.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  levels.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { models, levels };
}
