import { describe, expect, it } from 'vitest';
import { InputManager } from '../src/input/input-manager.js';

describe('InputManager', () => {
  it('normalizes movement outside the unit circle', () => {
    const input = new InputManager();
    input.setMoveVector(3, 4);

    expect(input.getMoveVector()).toEqual({ x: 0.6, z: 0.8 });
  });

  it('consumes each button press once while preserving held state', () => {
    const input = new InputManager();
    input.setButton('jump', true);

    expect(input.isButtonPressed('jump')).toBe(true);
    expect(input.consumeButtonPress('jump')).toBe(true);
    expect(input.consumeButtonPress('jump')).toBe(false);

    input.setButton('jump', true);
    expect(input.consumeButtonPress('jump')).toBe(false);

    input.setButton('jump', false);
    input.setButton('jump', true);
    expect(input.consumeButtonPress('jump')).toBe(true);
  });

  it('accumulates and consumes look deltas', () => {
    const input = new InputManager();
    input.addLookDelta(4, -2);
    input.addLookDelta(1, 3);

    expect(input.consumeLookDelta()).toEqual({ dx: 5, dy: 1 });
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
  });

  it('normalizes a held look vector independently from pointer deltas', () => {
    const input = new InputManager();
    input.setLookVector(3, 4);

    expect(input.getLookVector()).toEqual({ x: 0.6, y: 0.8 });
    expect(input.consumeLookDelta()).toEqual({ dx: 0, dy: 0 });
  });
});
