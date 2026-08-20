# Changelog

All notable changes to Renderoni are documented in this file.

## 0.9.0-beta.1

- First installable beta package with explicit ESM subpath exports.
- Three.js and `@dimforge/rapier3d-compat` are required peer dependencies.
- Added stable `renderoni/input` and `RenderoniEngine` from `renderoni/core`.
- Split framework-free assertion checks (`renderoni/testing`) from Vitest matchers
  (`renderoni/testing/matchers`). Vitest is optional unless matchers are imported.
- `renderoni/assets`, `renderoni/replays`, and `renderoni/network` are not public
  package APIs in this beta.

## Beta compatibility

The 0.9 beta API may change before 1.0. Pin a beta version or use the `beta`
dist-tag; do not rely on unpublished source paths.
