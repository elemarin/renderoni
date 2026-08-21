import { describe, expect, it } from 'vitest';
import { InputManager } from '../src/input/input-manager.js';
import { ActionRegistry } from '../src/input/actions.js';

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

  it('rejects unknown actions without queueing them and lists registered actions', () => {
    const actions = new ActionRegistry();
    let handled = 0;
    actions.register({ name: 'player.jump', handle: () => handled++ });

    expect(actions.list()).toEqual([{ name: 'player.jump', schema: undefined }]);
    expect(() => actions.dispatch('player.missing')).toThrow('Unknown action: player.missing');
    expect(actions.drain({})).toBe(0);

    actions.dispatch('player.jump');
    expect(actions.drain({})).toBe(1);
    expect(handled).toBe(1);
  });
});
