import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  scaffoldAsset,
  resolveSafePath,
  validateFactoryCode,
  validateSceneJSON,
  validateLevelJSON,
} from '../src/editor/index.js';

const tempDir = resolve(__dirname, '.temp-cli-test');
const cliPath = resolve(__dirname, '../bin/renderoni.js');

describe('CLI Scaffolding & Validation', () => {
  beforeEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  describe('scaffoldAsset', () => {
    it('scaffolds a valid model factory with PascalCase naming', () => {
      const result = scaffoldAsset('model', 'weathered-lantern');
      expect(result.kind).toBe('model');
      expect(result.filename).toBe('WeatheredLantern.ts');
      expect(result.defaultRelativePath).toBe('models/WeatheredLantern.ts');
      expect(result.content).toContain('export function createWeatheredLanternModel(): THREE.Object3D');
      expect(result.content).toContain("import * as THREE from 'three'");

      const validation = validateFactoryCode(result.content, 'model');
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('scaffolds a valid terrain factory', () => {
      const result = scaffoldAsset('terrain', 'stone_dungeon_floor');
      expect(result.kind).toBe('terrain');
      expect(result.filename).toBe('StoneDungeonFloor.ts');
      expect(result.defaultRelativePath).toBe('models/terrain/StoneDungeonFloor.ts');
      expect(result.content).toContain('export function createStoneDungeonFloorTerrain(): THREE.Object3D');

      const validation = validateFactoryCode(result.content, 'terrain');
      expect(validation.valid).toBe(true);
    });

    it('scaffolds a valid SceneInventory JSON', () => {
      const result = scaffoldAsset('scene', 'grand-hall');
      expect(result.kind).toBe('scene');
      expect(result.defaultRelativePath).toBe('scenes/grand-hall/scene.json');

      const parsed = JSON.parse(result.content);
      expect(parsed.version).toBe(1);
      expect(parsed.id).toBe('grand-hall');
      expect(parsed.elements).toEqual([]);

      const validation = validateSceneJSON(result.content);
      expect(validation.valid).toBe(true);
    });

    it('scaffolds a valid LevelDefinition JSON', () => {
      const result = scaffoldAsset('level', 'chapter-1');
      expect(result.kind).toBe('level');
      expect(result.defaultRelativePath).toBe('levels/chapter-1/level.json');

      const validation = validateLevelJSON(result.content);
      expect(validation.valid).toBe(true);
      expect((validation.parsed as any)?.startScene).toBe('main');
    });
  });

  describe('resolveSafePath Security Boundary', () => {
    it('allows valid paths within project root', () => {
      const safe = resolveSafePath(tempDir, 'models/Lantern.ts');
      expect(safe).toBe(resolve(tempDir, 'models/Lantern.ts'));
    });

    it('throws error when path escapes project root via ..', () => {
      expect(() => resolveSafePath(tempDir, '../outside.ts')).toThrow(/escapes project root/);
    });

    it('prevents prefix-sibling directory traversal attacks', () => {
      const siblingDir = `${tempDir}-sibling/secret.ts`;
      expect(() => resolveSafePath(tempDir, siblingDir)).toThrow(/escapes project root/);
    });
  });

  describe('Factory Code Validation Rules', () => {
    it('rejects forbidden non-deterministic methods', () => {
      const badCode = `
        import * as THREE from 'three';
        export function createBadModel(): THREE.Object3D {
          const rand = Math.random();
          return new THREE.Group();
        }
      `;
      const validation = validateFactoryCode(badCode, 'model');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('Math.random'))).toBe(true);
    });

    it('rejects factories missing Three.js imports', () => {
      const missingImport = `
        export function createLanternModel(): any {
          return null;
        }
      `;
      const validation = validateFactoryCode(missingImport, 'model');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('import from "three"'))).toBe(true);
    });

    it('rejects factories missing expected export function signature', () => {
      const invalidExport = `
        import * as THREE from 'three';
        export const createLantern = () => new THREE.Group();
      `;
      const validation = validateFactoryCode(invalidExport, 'model');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('export function create'))).toBe(true);
    });
  });

  describe('Manifest Validation Rules', () => {
    it('rejects level definitions where startScene is not in scenes list', () => {
      const invalidLevel = JSON.stringify({
        version: 1,
        id: 'bad-level',
        startScene: 'missing-scene',
        scenes: [{ id: 'other-scene', file: 'scenes/other.json' }],
      });
      const validation = validateLevelJSON(invalidLevel);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('startScene'))).toBe(true);
    });
  });

  describe('CLI Command Execution', () => {
    it('executes "renderoni --help" with 0 exit code', () => {
      const output = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf-8' });
      expect(output).toContain('renderoni generate');
      expect(output).toContain('renderoni add');
    });

    it('executes "renderoni add model Chest --project=<temp>" successfully', () => {
      const output = execFileSync(
        process.execPath,
        [cliPath, 'add', 'model', 'Chest', `--project=${tempDir}`, '--json'],
        { encoding: 'utf-8' }
      );
      const res = JSON.parse(output.trim());
      expect(res.status).toBe('ok');
      expect(res.kind).toBe('model');
      expect(existsSync(res.path)).toBe(true);
    });

    it('executes "renderoni add terrain DungeonFloor --dry-run"', () => {
      const output = execFileSync(
        process.execPath,
        [cliPath, 'add', 'terrain', 'DungeonFloor', `--project=${tempDir}`, '--dry-run', '--json'],
        { encoding: 'utf-8' }
      );
      const res = JSON.parse(output.trim());
      expect(res.status).toBe('ok');
      expect(res.dryRun).toBe(true);
      expect(existsSync(res.path)).toBe(false);
    });

    it('protects existing files from being overwritten without --force', () => {
      // First write
      execFileSync(
        process.execPath,
        [cliPath, 'add', 'model', 'Shield', `--project=${tempDir}`],
        { encoding: 'utf-8' }
      );

      // Second write without --force should fail
      try {
        execFileSync(
          process.execPath,
          [cliPath, 'add', 'model', 'Shield', `--project=${tempDir}`, '--json'],
          { encoding: 'utf-8' }
        );
        expect.unreachable('Should have failed because file exists');
      } catch (err: any) {
        expect(err.status).toBe(1);
        const res = JSON.parse(err.stdout.trim());
        expect(res.code).toBe('FILE_EXISTS');
      }

      // Third write with --force should succeed
      const forceOutput = execFileSync(
        process.execPath,
        [cliPath, 'add', 'model', 'Shield', `--project=${tempDir}`, '--force', '--json'],
        { encoding: 'utf-8' }
      );
      const res = JSON.parse(forceOutput.trim());
      expect(res.status).toBe('ok');
    });
  });
});
