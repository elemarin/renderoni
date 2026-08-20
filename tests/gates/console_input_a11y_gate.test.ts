import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InputManager, MobileControls } from '../../src/input/index.js';

/**
 * Console input and accessibility gate.
 *
 * There is no browser automation in this repository, so this gate checks what
 * can be checked honestly and cheaply: the console markup keeps its keyboard
 * and screen-reader affordances, the keyboard routes stay wired, and the touch
 * sticks stay lazy. Real browsers and real phones are covered by hand in
 * docs/beta-release-checklist.md.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const consoleShell = readFileSync(resolve(root, 'src/demo/main.ts'), 'utf8');
const mobileControls = readFileSync(resolve(root, 'src/input/mobile-controls.ts'), 'utf8');
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

describe('Touch gate: sticks stay lazy and labelled', () => {
  it('does nothing at all without a DOM, so headless and server runs never load nipplejs', () => {
    const input = new InputManager();
    const controls = new MobileControls(input);

    expect(controls.active).toBe(false);
    expect(() => controls.dispose()).not.toThrow();
  });

  it('loads nipplejs only inside activation, which a real touch triggers', () => {
    expect(mobileControls).not.toMatch(/^import .*['"]nipplejs['"]/m);
    expect(mobileControls).toContain("await import('nipplejs')");
    expect(mobileControls).toMatch(/addEventListener\('pointerdown'/);
    expect(mobileControls).toMatch(/addEventListener\('touchstart'/);
    expect(mobileControls).toContain("event.pointerType === 'touch'");

    // Activation happens once and unbinds itself.
    expect(mobileControls).toContain('if (this.activated || this.disposed) return;');
  });

  it('builds two sticks plus action buttons, all with screen-reader labels', () => {
    expect(mobileControls).toContain("moveStick.setAttribute('aria-label', 'Movement joystick')");
    expect(mobileControls).toContain("lookStick.setAttribute('aria-label', 'Look joystick')");
    expect(mobileControls).toContain("root.setAttribute('aria-label', 'Touch game controls')");
    expect(mobileControls).toMatch(/button\.setAttribute\('aria-label', config\.ariaLabel \?\? config\.label\)/);
  });

  it('keeps nipplejs in its own lazy chunk in the built console', () => {
    const manifestPath = resolve(root, 'dist-web/.vite/manifest.json');
    if (!existsSync(manifestPath)) {
      // The built console is checked by the budget gate after `npm run build:web`.
      expect(readFileSync(resolve(root, 'scripts/bundle-budget.json'), 'utf8')).toContain('nipplejs');
      return;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry)!;
    const initial = new Set<string>();
    const visit = (key: string) => {
      if (initial.has(key) || !manifest[key]) return;
      initial.add(key);
      for (const imported of manifest[key].imports ?? []) visit(imported);
    };
    visit(entryKey);

    const nipple = Object.keys(manifest).find((key) => key.includes('nipplejs'));
    expect(nipple).toBeDefined();
    expect(manifest[nipple!].isDynamicEntry).toBe(true);
    expect(initial.has(nipple!)).toBe(false);
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
