/**
 * Echoes of Blackwood — Zustand Quest State Store
 */

import { createStore } from 'zustand/vanilla';

export interface HorrorState {
  quest: 'find_journal' | 'wind_clock' | 'take_crest' | 'escape_gate' | 'escaped';
  objective: string;
  hasKey: boolean;
  clockSolved: boolean;
  hasCrest: boolean;
  gateUnlocked: boolean;
  flashlightOn: boolean;
  inspectingText: string | null;
  hoverPrompt: string | null;

  // Actions
  readJournal: () => void;
  pickupKey: () => void;
  solveClock: () => void;
  pickupCrest: () => void;
  unlockGate: () => void;
  toggleFlashlight: () => void;
  setHoverPrompt: (prompt: string | null) => void;
  dismissInspect: () => void;
  resetQuest: () => void;
}

const INITIAL_STATE = {
  quest: 'find_journal' as const,
  objective: 'Walk the hall. First room on the left: read the journal on the desk.',
  hasKey: false,
  clockSolved: false,
  hasCrest: false,
  gateUnlocked: false,
  flashlightOn: true,
  inspectingText: null,
  hoverPrompt: null,
};

export const useHorrorStore = createStore<HorrorState>((set) => ({
  ...INITIAL_STATE,

  readJournal: () =>
    set({
      quest: 'wind_clock',
      objective: 'Journal Read: The Victorian wall clock must be set to 11:45. Search for the clock key in Room 2 (Right).',
      inspectingText:
        '📜 Blackwood Journal #44:\n\n"The master clock holds our family crest inside the hidden chamber. Wind the clock to 11:45 with the winding key to release the latch!"',
    }),

  pickupKey: () =>
    set({
      hasKey: true,
      objective: 'Clock Key Acquired! Go to Room 3 (Left) and wind the Victorian Wall Clock.',
    }),

  solveClock: () =>
    set({
      clockSolved: true,
      quest: 'take_crest',
      objective: 'Clock Solved (11:45)! The secret bookcase has opened. Retrieve the Blackwood Crest from Room 4 (Right)!',
    }),

  pickupCrest: () =>
    set({
      hasCrest: true,
      quest: 'escape_gate',
      objective: 'Blackwood Crest Acquired! Run to the iron gate at the end of the hall and escape!',
    }),

  unlockGate: () =>
    set({
      gateUnlocked: true,
      quest: 'escaped',
      objective: 'Gate Unlocked! You successfully escaped Blackwood Manor!',
    }),

  toggleFlashlight: () =>
    set((s) => ({ flashlightOn: !s.flashlightOn })),

  setHoverPrompt: (hoverPrompt) => set({ hoverPrompt }),

  dismissInspect: () => set({ inspectingText: null }),

  resetQuest: () => set(INITIAL_STATE),
}));
