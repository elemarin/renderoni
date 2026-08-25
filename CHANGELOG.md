# Changelog

All notable changes to Renderoni are documented in this file.

## 1.0.0

- **Runtime Scene Hierarchy & Lifecycle (`Game -> Level -> Scene`)**:
  - Introduced `SceneManager` and `SceneContext` with deterministic RAII resource ownership, lifecycle hooks (`setup`, `enter`, `exit`, `teardown`), and error-resilient teardown.
  - Added persistent cross-scene store (`persistent.get`/`set`) and entity allowlists.
  - Added entry point teleportation with automatic physics buffer syncing (`physics.markDirty`).
- **Unified CLI & Scaffolding Tooling (`renderoni generate`, `renderoni add`)**:
  - Added `renderoni generate <model|terrain|scene|level> "<prompt>"` for agentic/Copilot asset authoring.
  - Added `renderoni add <model|terrain|scene|level> <name>` for offline zero-turn boilerplate scaffolding.
  - Added strict path traversal protection (`resolveSafePath`) and syntax/signature validation for generated TypeScript factories and JSON manifests.
- **Dual-Mode Audio Subsystem (`renderoni/audio`)**:
  - Interactive browser Web Audio with one-shot user gesture autoplay resume, HRTF 3D spatial panning, master volume control, and procedural synthesis.
  - Headless deterministic event logging without DOM shims and `RND_0301` missing clip diagnostics.
- **High-Performance VFX Subsystem (`renderoni/vfx`)**:
  - Structure-of-Arrays (SoA) pooled `ParticleEmitter` with zero heap allocation during gameplay and `THREE.InstancedMesh` rendering.
  - Deterministic procedural `ScreenShake` driven by engine PRNG.
- **Subsystem Deprecations & Cleanup**:
  - Removed deprecated `renderoni/network` stub.
  - Removed `mobile-controls.ts` and `nipplejs` dependency in favor of deterministic keyboard, pointer, and programmatic vector controls.
- **Release Stability & Quality Gates**:
  - Full suite of 225+ tests covering determinism, transform buffer isolation, headless parity, memory safety, MCP contracts, and package tarball integrity.

## 0.9.0-beta.1

- First installable beta package with explicit ESM subpath exports.
- Three.js and `@dimforge/rapier3d-compat` are required peer dependencies.
- Added stable `renderoni/input` and `RenderoniEngine` from `renderoni/core`.
- Split framework-free assertion checks (`renderoni/testing`) from Vitest matchers
  (`renderoni/testing/matchers`). Vitest is optional unless matchers are imported.
- `renderoni/assets`, `renderoni/replays`, and `renderoni/network` are not public
  package APIs in this beta.
