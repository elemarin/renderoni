# Renderoni 0.9 beta release checklist

Everything a release needs, split into what a machine checks and what a person
checks. Run the automated part first:

```bash
npm run gate:beta
```

Nothing here publishes anything. Publishing is a separate, deliberate step.

---

## 1. Automated gates

| Gate | Command | What it protects |
| --- | --- | --- |
| Types | `npm run typecheck` | The public API compiles under `strict`. |
| Determinism | `npm run gate:determinism` | Same seed, same result. The literal golden hash is pinned on Node 22 / linux / x64 only; every other platform asserts run-to-run equality and gameplay outcomes. |
| MCP | `npm run gate:mcp` | Wrong agent calls fail loudly (`isError`), actions are discoverable, Tier 0 stays inside 500 UTF-8 bytes at a realistic entity count. |
| Lifecycle | `npm run gate:lifecycle` | Repeated init, baseline restore, overlap exits, throwing listeners, ownership order, native-move repair. |
| Tests | `npm test` | The whole suite, including the MVP validation gates and archetypes. |
| Build | `npm run build` | The published `dist/` is produced by tsup. |
| README | `npm run test:readme-examples` | Every TypeScript block in the README compiles against the real types. |
| Package | `npm run gate:package` | `npm pack` content, every public subpath from a clean Node consumer, a clean Vite consumer, framework-free `renderoni/testing` with no Vitest, and no `renderoni/network`. |
| Budget | `npm run build:web && npm run gate:budget` | Initial console load stays small and nipplejs stays a lazy chunk. |
| Release contract | `npm run gate:release` | Dry run of the publish: dist-tag, tarball contents, metadata. No registry publish. |
| Security | `npm run gate:security` | `npm audit --omit=dev` reports no high or critical production issue. |

CI runs the same commands. See `.github/workflows/ci.yml`.

### Platform scope of the golden hash

`tests/gates/determinism_hash_gate.test.ts` pins one literal digest, and only on
the matrix in `EXACT_STATE_HASH_MATRIX`: **Node 22, linux, x64**. macOS and
Windows jobs run the same scenario and assert deterministic gameplay outcomes
and run-to-run equality instead. Rapier's WASM float behaviour is not promised
to be bit-identical across operating systems, so promising one hash everywhere
would be a promise we cannot keep.

### Load budget baseline

Recorded from a Vite 5 production build on Node 22 / linux / x64, gzip bytes:

| Metric | Baseline | Cap |
| --- | --- | --- |
| Initial console shell JS | 15.9 kB | 20.0 kB |
| Initial CSS | 7.8 kB | 12.0 kB |
| `index.html` | 5.1 kB | 8.0 kB |
| **Total initial load** | **28.8 kB** | **36.0 kB** |
| Largest lazy chunk (three + Rapier + engine) | 902.2 kB | 1024.0 kB |
| All JS chunks together | 957.5 kB | 1126.4 kB |

The engine, every game, Model Studio and nipplejs are behind dynamic imports, so
the first paint downloads the shell only. Budgets live in
`scripts/bundle-budget.json`. After an intentional size change run
`node scripts/check-bundle-budget.mjs --update-baseline` and say why in the pull
request.

**Frame rate is not automated.** 45 FPS on mid and high current phones is a
product target, not a CI blocker. CI measures bytes; humans measure frames on
the devices below.

---

## 2. Manual browser and device matrix

There is **no browser automation** in this repository: no Playwright, no
Puppeteer, no headless Chrome. The rows below are checked by hand against the
deployed console before tagging a beta.

Per row, walk the same script:

1. **Load** the console cold (empty cache) and wait for the launcher.
2. **Rotate** the device (mobile and tablet only) and confirm the HUD reflows.
3. **Resize** the window (desktop) and confirm the canvas and HUD follow.
4. **Keyboard/mouse**: arrows and `Enter` in the launcher, `Escape` to pause,
   `M` to mute, `` ` `` to toggle the inspector, mouse look inside a game.
5. **Dual touch sticks** (touch devices): move stick, look stick, action
   buttons, and confirm they appear only after the first touch.
6. **Pause/resume**: pause, tab away and back, resume, restart, return home.
7. Launch each of the three games and Model Studio at least once.

| # | Target | Browser | Load | Rotate | Resize | Keyboard/mouse | Touch sticks | Pause/resume | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Desktop | Chrome (current) | ☐ | n/a | ☐ | ☐ | n/a | ☐ | |
| 2 | Desktop | Firefox (current) | ☐ | n/a | ☐ | ☐ | n/a | ☐ | |
| 3 | macOS | Safari (current) | ☐ | n/a | ☐ | ☐ | n/a | ☐ | |
| 4 | iPhone 12 or newer | Safari iOS | ☐ | ☐ | n/a | n/a | ☐ | ☐ | |
| 5 | iPhone 12 or newer | Chrome iOS | ☐ | ☐ | n/a | n/a | ☐ | ☐ | |
| 6 | Pixel 6 or newer | Chrome Android | ☐ | ☐ | n/a | n/a | ☐ | ☐ | |
| 7 | Galaxy S21 or newer | Chrome Android | ☐ | ☐ | n/a | n/a | ☐ | ☐ | |
| 8 | Current iPad | Safari iPadOS | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Keyboard only if one is attached. |
| 9 | Current Android tablet | Chrome Android | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |

Performance note per mobile row: record the rough frame rate seen while playing.
Below ~45 FPS on a mid or high device is a release discussion, not an automatic
block.

Automated support for this area today:

- `tests/gates/console_input_a11y_gate.test.ts` checks the console markup, the
  keyboard routes, and that the touch layer loads nipplejs only on activation.
- `scripts/check-bundle-budget.mjs` proves nipplejs ships as a separate lazy
  chunk that first load never fetches.

That is static and build-level evidence. It is not proof that a real finger on a
real phone works.

---

## Accessibility checklist

Automated (in `npm test`):

- Every console button has an accessible name.
- The render canvas is focusable and nothing uses a positive `tabindex`.
- Both overlays are `role="dialog"`, `aria-modal="true"` and labelled.
- Launcher, shelf and inspector landmarks carry `aria-label`.
- `Escape` always leaves a menu, and `Tab` is never intercepted, so no focus
  trap can be introduced silently.
- Touch sticks and touch action buttons carry `aria-label`.

By hand, once per beta:

- Tab through the launcher: focus is always visible and the order matches the
  visual order.
- Open the pause menu: focus lands on **Resume**, arrows move between buttons,
  `Enter` activates, `Escape` closes and focus returns to the canvas.
- Nothing keyboard-reachable is a dead end; `Tab` can always leave a menu.
- Screen reader smoke test (VoiceOver or NVDA): the launcher, game titles, and
  both dialogs are announced with sensible names.
- Colour contrast of HUD and menu text against its background is legible; check
  the small telemetry text in the inspector especially.
- Text scaling at 200% browser zoom keeps the launcher usable.
- Motion: confirm nothing flashes rapidly on load or on game switch.

Known gaps to state in release notes, not to hide:

- The inspector filter and action inputs rely on placeholder text only; they
  have no visible `<label>`.
- Model Studio is preview-only, so its annotation flow is not part of the
  supported keyboard surface.

---

## 3. Publish (manual, after every gate is green)

1. `npm run gate:beta` passes locally and in CI.
2. `npm run gate:security` reports no high or critical production advisory.
3. `npm run gate:release` prints `dist-tag beta`.
4. `CHANGELOG.md` has an entry for this version.
5. Tag the release. `.github/workflows/publish.yml` publishes with
   `npm publish --tag beta` for any prerelease version, and only a clean semver
   version can ever reach `latest`.
6. After publishing, verify: `npm view renderoni dist-tags` shows the new
   version under `beta` and `latest` is unchanged.
