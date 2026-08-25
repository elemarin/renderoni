import { parseSceneInventory } from '../scene/inventory.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  parsed?: unknown;
}

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bMath\.random\s*\(/, message: 'Forbidden Math.random() call. Use deterministic PRNG or local hash.' },
  { pattern: /\bDate\.now\s*\(/, message: 'Forbidden Date.now() call. Simulation state must be deterministic.' },
  { pattern: /\bperformance\.now\s*\(/, message: 'Forbidden performance.now() call.' },
  { pattern: /\brequestAnimationFrame\s*\(/, message: 'Forbidden requestAnimationFrame() call.' },
];

export function validateFactoryCode(code: string, kind: 'model' | 'terrain'): ValidationResult {
  const errors: string[] = [];
  const trimmed = code.trim();

  if (!trimmed) {
    return { valid: false, errors: ['Generated code is empty.'] };
  }

  // Import checks
  if (!trimmed.includes("from 'three'") && !trimmed.includes('from "three"')) {
    errors.push('Factory file must import from "three" (e.g. import * as THREE from "three").');
  }

  // Check forbidden patterns
  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      errors.push(message);
    }
  }

  // Signature check
  const suffix = kind === 'model' ? 'Model' : 'Terrain';
  const exportPattern = new RegExp(`export\\s+function\\s+create[A-Za-z0-9_]*${suffix}\\s*\\(\\s*\\)`);
  const generalExportPattern = /export\s+function\s+create[A-Za-z0-9_]*\s*\(\s*\)/;

  if (!exportPattern.test(trimmed) && !generalExportPattern.test(trimmed)) {
    errors.push(
      `Exported factory function must match "export function create<Name>${suffix}(): THREE.Object3D" with zero required arguments.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateSceneJSON(jsonStr: string): ValidationResult {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { valid: false, errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }

  try {
    parseSceneInventory(parsed);
  } catch (err) {
    errors.push(`Invalid SceneInventory schema: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed,
  };
}

export function validateLevelJSON(jsonStr: string): ValidationResult {
  const errors: string[] = [];
  let parsed: any;

  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { valid: false, errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    errors.push('Level definition must be a JSON object.');
    return { valid: false, errors };
  }

  if (typeof parsed.id !== 'string' || parsed.id.trim().length === 0) {
    errors.push('Level definition requires a string "id".');
  }

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    errors.push('Level definition requires a non-empty "scenes" array.');
  }

  if (typeof parsed.startScene !== 'string' || parsed.startScene.trim().length === 0) {
    errors.push('Level definition requires a string "startScene".');
  } else if (Array.isArray(parsed.scenes)) {
    const sceneIds = parsed.scenes.map((s: any) => (typeof s === 'string' ? s : s?.id));
    if (!sceneIds.includes(parsed.startScene)) {
      errors.push(`Level startScene "${parsed.startScene}" is not present in scenes list: [${sceneIds.join(', ')}].`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed,
  };
}
