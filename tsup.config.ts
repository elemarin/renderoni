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
    'network/index': 'src/network/index.ts',
    'scene/index': 'src/scene/index.ts',
    'mcp/index': 'src/mcp/index.ts',
    'testing/index': 'src/testing/index.ts',
    'testing/matchers': 'src/testing/matchers.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: true,
  target: 'es2022',
});
