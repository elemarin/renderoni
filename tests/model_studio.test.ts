import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GAMES_METADATA } from '../src/demo/main.js';
import {
  STUDIO_MODELS,
  STUDIO_PIN_GEOMETRY,
  STUDIO_PIN_MATERIAL,
  createAnnotationPinMesh,
  createStudyDeskJournalModel,
} from '../src/demo/model-studio.js';

describe('Model Studio preview slice', () => {
  it('is preview-only with no hardcoded approval state', () => {
    expect(GAMES_METADATA.studio.subtitle.toLowerCase()).not.toContain('approval');
    expect(GAMES_METADATA.studio.description.toLowerCase()).not.toContain('approve');
    for (const model of STUDIO_MODELS) {
      expect(Object.prototype.hasOwnProperty.call(model, 'approved')).toBe(false);
    }
  });

  it('builds a scoped study desk preview model without requiring an engine', () => {
    const model = createStudyDeskJournalModel();
    let meshCount = 0;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) meshCount++;
    });
    expect(meshCount).toBeGreaterThan(8);
    expect(model.children.length).toBeGreaterThan(0);
  });

  it('reuses annotation pin GPU resources across rerenders', () => {
    const pinA = createAnnotationPinMesh({ id: 'a', note: 'A', position: [0, 0, 0] }, 0);
    const pinB = createAnnotationPinMesh({ id: 'b', note: 'B', position: [1, 1, 1] }, 1);
    expect(pinA.geometry).toBe(STUDIO_PIN_GEOMETRY);
    expect(pinB.geometry).toBe(STUDIO_PIN_GEOMETRY);
    expect(pinA.material).toBe(STUDIO_PIN_MATERIAL);
    expect(pinB.material).toBe(STUDIO_PIN_MATERIAL);
  });

  it('guards lazy scene assignment and stale load errors by token', () => {
    const source = readFileSync(new URL('../src/demo/main.ts', import.meta.url), 'utf8');
    const studioSource = readFileSync(new URL('../src/demo/model-studio.ts', import.meta.url), 'utf8');
    expect(source).toContain('let nextGame: DemoScene | null = null');
    expect(source).toContain('this.currentGame = nextGame');
    expect(source).toContain('await studio.init({ activate: false })');
    expect(source).toContain('activateStudio');
    expect(source).toContain('if (token === this.loadingToken) this.showLoadError(mode, err)');
    expect(studioSource).toContain('if (this.activated) {');
    expect(studioSource).toContain('activate(): void');
    expect(source).not.toMatch(/this\.currentGame = new /);
    expect(source).not.toMatch(/this\.homeScene = new /);
  });

  it('keeps coarse-pointer Studio controls compact enough to leave canvas touch space', () => {
    const css = readFileSync(new URL('../src/demo/index.css', import.meta.url), 'utf8');
    const coarseStudio = css.slice(css.indexOf('@media (max-width: 700px), (any-pointer: coarse)'));
    expect(coarseStudio).toContain('.studio-ui-container');
    expect(coarseStudio).toContain('pointer-events: none');
    expect(coarseStudio).toContain('max-height: 22dvh');
    expect(coarseStudio).toContain('max-height: 28dvh');
    expect(coarseStudio).toContain('.studio-model-list');
    expect(coarseStudio).toContain('flex-direction: row');
    expect(coarseStudio).not.toContain('max-height: 54dvh');
  });
});
