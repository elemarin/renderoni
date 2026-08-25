import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { checkCopilotStatus, generate, type CopilotStatus } from './copilot-session.js';
import { defaultFenceLanguage, type AssetKind } from './prompts.js';
import { scaffoldAsset, type ScaffoldResult } from './scaffold.js';
import { validateFactoryCode, validateLevelJSON, validateSceneJSON, type ValidationResult } from './validation.js';

export interface GenerateAssetOptions {
  kind: AssetKind;
  prompt: string;
  imagePath?: string;
  imageDataUrl?: string;
  existingCode?: string;
  context?: string;
  projectRoot?: string;
}

export interface GenerateAssetResult {
  kind: AssetKind;
  code: string;
  raw: string;
  language: 'ts' | 'json';
  validation: ValidationResult;
  suggestedFilename?: string;
}

export async function readImageAsDataUrl(imagePath: string): Promise<string> {
  const ext = extname(imagePath).toLowerCase().replace(/^\./, '');
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  const mimeType = mimeMap[ext] ?? 'application/octet-stream';
  const buffer = await readFile(imagePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export async function checkGenerationStatus(): Promise<CopilotStatus> {
  return checkCopilotStatus();
}

export async function generateAsset(options: GenerateAssetOptions): Promise<GenerateAssetResult> {
  let imageDataUrl = options.imageDataUrl;
  if (!imageDataUrl && options.imagePath) {
    imageDataUrl = await readImageAsDataUrl(options.imagePath);
  }

  const res = await generate({
    tab: options.kind,
    prompt: options.prompt,
    imageDataUrl,
    context: options.context,
    existingCode: options.existingCode,
  });

  const language = (res.language || defaultFenceLanguage(options.kind)) as 'ts' | 'json';

  let validation: ValidationResult;
  if (options.kind === 'model' || options.kind === 'terrain') {
    validation = validateFactoryCode(res.code, options.kind);
  } else if (options.kind === 'scene') {
    validation = validateSceneJSON(res.code);
  } else if (options.kind === 'level') {
    validation = validateLevelJSON(res.code);
  } else {
    validation = { valid: true, errors: [] };
  }

  return {
    kind: options.kind,
    code: res.code,
    raw: res.raw,
    language,
    validation,
  };
}

export { scaffoldAsset, type ScaffoldResult };
