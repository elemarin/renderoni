import { afterEach, describe, expect, it, vi } from 'vitest';
import { EchoesOfBlackwoodGame } from '../src/demo/games/echoes-of-blackwood/game.js';
import { clockHandRotations } from '../src/demo/games/echoes-of-blackwood/models/VictorianWallClock.js';
import { useHorrorStore } from '../src/demo/games/echoes-of-blackwood/state.js';

describe('Echoes of Blackwood interactions', () => {
  afterEach(() => {
    useHorrorStore.getState().resetQuest();
  });

  it('dispatches the gate unlock instead of treating its crest prompt as a pickup', () => {
    useHorrorStore.setState({
      clockSolved: true,
      hasCrest: true,
      gateUnlocked: false,
      inspectingText: null,
      hoverPrompt: '[ E ] Unlock Manor Gate with Crest',
    });

    const act = vi.fn();
    const context = { engine: { act } };
    const tryInteract = Reflect.get(EchoesOfBlackwoodGame.prototype, 'tryInteract') as (
      this: typeof context
    ) => void;

    tryInteract.call(context);

    expect(act).toHaveBeenCalledOnce();
    expect(act).toHaveBeenCalledWith({ name: 'quest.unlockGate' });
  });

  it('points the clock hands to 11:45', () => {
    const rotations = clockHandRotations(11, 45);

    expect(rotations.minute).toBeCloseTo(-Math.PI * 1.5);
    expect(rotations.hour).toBeCloseTo(-Math.PI * (23.5 / 12));
  });
});
