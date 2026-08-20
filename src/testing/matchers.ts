/**
 * Renderoni Vitest / Jest Custom Matchers (@renderoni/testing/matchers)
 *
 * Provides human-friendly assertion matchers for 3D simulation testing.
 */

import { expect } from 'vitest';
import 'vitest';
import type { RenderoniEngine } from '../core/engine.js';
import type { EntityInstance } from '../presets/define-preset.js';

interface CustomMatchers<R = unknown> {
  toHaveTick(expected: number): R;
  toEmitEvent(event: string, payload?: unknown): R;
  toHaveState(partialState: Record<string, unknown>): R;
  toHavePassedDiagnostics(): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

if (typeof expect !== 'undefined' && expect.extend) {
  expect.extend({
    toHaveTick(received: RenderoniEngine, expected: number) {
      const pass = received.tick === expected;
      return {
        pass,
        message: () => `expected game to have tick ${expected}, but got ${received.tick}`,
      };
    },

    toEmitEvent(received: RenderoniEngine, eventName: string, payloadMatcher?: any) {
      const recent = received.events.getRecentEvents(eventName);
      let pass = recent.length > 0;

      if (pass && payloadMatcher) {
        pass = recent.some((e) => {
          if (typeof payloadMatcher === 'object' && payloadMatcher !== null) {
            return Object.entries(payloadMatcher).every(([k, v]) => (e.payload as any)?.[k] === v);
          }
          return e.payload === payloadMatcher;
        });
      }

      return {
        pass,
        message: () =>
          pass
            ? `expected game not to emit event '${eventName}'`
            : `expected game to emit event '${eventName}' with payload ${JSON.stringify(payloadMatcher)}`,
      };
    },

    toHaveState(received: EntityInstance, partialState: Record<string, unknown>) {
      const state = received.state;
      const pass = Object.entries(partialState).every(([k, v]) => state[k] === v);

      return {
        pass,
        message: () =>
          pass
            ? `expected entity '${received.id}' not to have state ${JSON.stringify(partialState)}`
            : `expected entity '${received.id}' to have state ${JSON.stringify(partialState)}, got ${JSON.stringify(state)}`,
      };
    },

    toHavePassedDiagnostics(received: RenderoniEngine) {
      const hasErrors = received.diagnostics.hasErrors();
      return {
        pass: !hasErrors,
        message: () =>
          hasErrors
            ? `expected game to have no fatal diagnostics, but found errors: ${JSON.stringify(received.diagnostics.getRecords('error'))}`
            : `expected game to have diagnostic errors`,
      };
    },
  });
}

/** Marker type that preserves Vitest module resolution for this augmentation. */
export type VitestMatcherRegistration = import('vitest').Assertion;
