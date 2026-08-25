import { existsSync } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/**
 * Resolves targetPath safely within projectRoot.
 * Prevents directory traversal attacks via `..` or prefix sibling exploits.
 */
export function resolveSafePath(projectRoot: string, targetPath: string): string {
  const root = resolve(projectRoot);
  const resolved = isAbsolute(targetPath) ? resolve(targetPath) : resolve(root, targetPath);
  const rel = relative(root, resolved);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path escapes project root boundary: ${targetPath}`);
  }
  return resolved;
}

export function checkFileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Atomically writes content to filePath using a temporary file and rename.
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.floor(Math.random() * 100000)}`;
  try {
    await writeFile(tempPath, content, 'utf-8');
    await rename(tempPath, filePath);
  } catch (err) {
    try {
      await unlink(tempPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}
