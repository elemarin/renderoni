import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-web',
    // The manifest is the dependency graph that scripts/check-bundle-budget.mjs
    // reads to separate initial-load chunks from lazy ones.
    manifest: true,
  },
});
