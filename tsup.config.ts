import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'presets/index': 'src/presets/index.ts',
    'animation/index': 'src/animation/index.ts',
    'audio/index': 'src/audio/index.ts',
    'ui/index': 'src/ui/index.ts',
    'vfx/index': 'src/vfx/index.ts',
    'scene/index': 'src/scene/index.ts',
    'mcp/index': 'src/mcp/index.ts',
    'testing/index': 'src/testing/index.ts',
    'testing/matchers': 'src/testing/matchers.ts',
    'input/index': 'src/input/index.ts',
    'editor/index': 'src/editor/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: true,
  target: 'es2022',
  // Dynamically imported only by `renderoni editor`; never bundle it into the
  // core engine output so consumers who don't use the editor stay lean.
  external: ['@github/copilot-sdk'],
});
