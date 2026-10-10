import { describe, expect, it } from 'vitest';
import * as root from '../src/index.js';
import * as input from '../src/input/index.js';
import { RenderoniEngine } from '../src/core/engine.js';

describe('public exports', () => {
  it('exposes ActionRegistry, the type behind engine.actions, from renderoni and renderoni/input', () => {
    expect(root.ActionRegistry).toBe(input.ActionRegistry);
    expect(new RenderoniEngine({ mode: 'headless' }).actions).toBeInstanceOf(root.ActionRegistry);
  });
});
