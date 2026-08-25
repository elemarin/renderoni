import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InputManager } from '../../src/input/index.js';

/**
 * Console input and accessibility gate.
 *
 * There is no browser automation in this repository, so this gate checks what
 * can be checked honestly and cheaply: the console markup keeps its keyboard
 * and screen-reader affordances, the keyboard routes stay wired, and programmatic
 * vectors remain deterministic. Real browsers and real devices are covered by hand.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const consoleShell = readFileSync(resolve(root, 'src/demo/main.ts'), 'utf8');
const checklist = readFileSync(resolve(root, 'docs/beta-release-checklist.md'), 'utf8');

describe('Accessibility gate: console markup', () => {
  it('gives every button an accessible name', () => {
    const nameless: string[] = [];
    for (const [element, attributes, inner] of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const text = inner.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const labelled = /\btitle\s*=/.test(attributes) || /\baria-label\s*=/.test(attributes);
      if (!text && !labelled) nameless.push(element.slice(0, 80));
    }

    expect(nameless).toEqual([]);
  });

  it('keeps the render surface focusable and the tab order natural', () => {
    expect(html).toMatch(/<canvas id="render-canvas" tabindex="0">/);

    const tabIndexes = [...html.matchAll(/tabindex="(-?\d+)"/g)].map((match) => Number(match[1]));
    expect(tabIndexes.every((value) => value === 0)).toBe(true);
  });

  it('marks both overlays as labelled modal dialogs that start hidden', () => {
    for (const id of ['pause-menu', 'loop-overlay']) {
      const overlay = new RegExp(`<div id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
      expect(overlay, id).toContain('role="dialog"');
      expect(overlay, id).toContain('aria-modal="true"');
      expect(overlay, id).toMatch(/aria-labelledby="[^"]+"/);
      expect(overlay, id).toContain('hidden');
    }
  });

  it('labels the library landmarks that have no visible heading', () => {
    expect(html).toMatch(/<section class="album-section" aria-label="[^"]+"/);
    expect(html).toMatch(/<nav id="game-shelf"[^>]*aria-label="[^"]+"/);
    expect(html).toMatch(/<aside id="inspector-drawer"[^>]*aria-label="[^"]+"/);
  });
});

describe('Accessibility gate: keyboard routes', () => {
  it('drives the launcher and both overlays from the keyboard', () => {
    expect(consoleShell).toContain("e.code === 'Escape'");
    expect(consoleShell).toMatch(/ArrowLeft|ArrowRight/);
    expect(consoleShell).toMatch(/e\.code === 'Enter' \|\| e\.code === 'Space'/);
    expect(consoleShell).toContain('handleOverlayKeyboard');
    expect(consoleShell).toMatch(/querySelectorAll<HTMLButtonElement>\('button:not\(\[disabled\]\)'\)/);
  });

  it('moves focus into a menu when it opens and back to the canvas when it closes', () => {
    expect(consoleShell).toMatch(/getElementById\('pause-resume'\)\?\.focus\(\{ preventScroll: true \}\)/);
    expect(consoleShell).toMatch(/this\.canvas\.focus\(\{ preventScroll: true \}\)/);
    expect(consoleShell).toMatch(/buttons\[nextIndex\]\?\.focus\(\{ preventScroll: true \}\)/);
    expect(consoleShell).toMatch(/role="status" aria-live="polite"/);
  });

  it('never traps the keyboard: Tab is left to the browser and Escape always exits', () => {
    expect(consoleShell).not.toMatch(/code === 'Tab'/);
    expect(consoleShell).not.toMatch(/key === 'Tab'/);

    const overlayHandler = consoleShell.slice(
      consoleShell.indexOf('private handleOverlayKeyboard'),
      consoleShell.indexOf('private handleOverlayKeyboard') + 1800
    );
    expect(overlayHandler).toContain("e.code === 'Escape'");
    expect(overlayHandler).toContain('this.setPaused(false)');
  });
});

describe('Input gate: deterministic programmatic and desktop input', () => {
  it('operates headlessly without a DOM or window context', () => {
    const input = new InputManager();
    expect(input.getMoveVector()).toEqual({ x: 0, z: 0 });
    expect(input.getLookVector()).toEqual({ x: 0, y: 0 });
    expect(() => input.dispose()).not.toThrow();
  });

  it('clamps normalized move and look vectors to unit length', () => {
    const input = new InputManager();
    input.setMoveVector(3, 4);
    const move = input.getMoveVector();
    expect(Math.hypot(move.x, move.z)).toBeCloseTo(1.0, 5);
    expect(move.x).toBeCloseTo(0.6, 5);
    expect(move.z).toBeCloseTo(0.8, 5);

    input.setLookVector(10, 0);
    expect(input.getLookVector()).toEqual({ x: 1, y: 0 });
  });

  it('handles button presses and consumption deterministically', () => {
    const input = new InputManager();
    expect(input.isButtonPressed('jump')).toBe(false);
    expect(input.consumeButtonPress('jump')).toBe(false);

    input.setButton('jump', true);
    expect(input.isButtonPressed('jump')).toBe(true);
    expect(input.consumeButtonPress('jump')).toBe(true);
    expect(input.consumeButtonPress('jump')).toBe(false);
    expect(input.isButtonPressed('jump')).toBe(true);

    input.setButton('jump', false);
    expect(input.isButtonPressed('jump')).toBe(false);
  });

  it('consumes and resets look deltas', () => {
    const input = new InputManager();
    input.addLookDelta(5, -3);
    expect(input.consumeLookDelta()).toEqual({ dx: 5, dy: -3 });
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
  });
});

describe('Manual coverage gate: the checklist is honest and complete', () => {
  it('names every browser, device and input path a human must still verify', () => {
    for (const target of [
      'Chrome',
      'Firefox',
      'Safari',
      'iPhone 12',
      'Pixel 6',
      'Galaxy S21',
      'iPad',
      'rotate',
      'resize',
      'keyboard',
      'mouse',
      'touch sticks',
      'pause',
      'resume',
    ]) {
      expect(checklist.toLowerCase(), `checklist must cover: ${target}`).toContain(target.toLowerCase());
    }
  });

  it('says plainly that CI does not drive real browsers or measure frame rate', () => {
    expect(checklist).toMatch(/no browser automation/i);
    expect(checklist).toMatch(/45\s*FPS/i);
    expect(checklist).toMatch(/target, not/i);
  });

  it('keeps an accessibility section with the checks CI cannot make', () => {
    expect(checklist).toMatch(/## Accessibility/i);
    expect(checklist.toLowerCase()).toContain('focus');
    expect(checklist.toLowerCase()).toContain('screen reader');
    expect(checklist.toLowerCase()).toContain('contrast');
  });
});
