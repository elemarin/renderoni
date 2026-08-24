import * as THREE from 'three';

let tsModulePromise;
function loadTypeScript() {
  if (!tsModulePromise) {
    tsModulePromise = import('https://esm.sh/typescript@5.7.2');
  }
  return tsModulePromise;
}

/** Per-tab editing state: null when creating something new, else the asset
 * being iterated on ({ relativePath, code|raw }). When editing an existing
 * asset, `code` here is always the ON-DISK version — the "Current" preview
 * pane renders this, never the freshly generated draft. */
const editing = { model: null, structure: null, terrain: null, level: null };
/** The most recently generated (not-yet-saved) draft per tab, rendered in
 * the "New" preview pane and written to disk on Save/Save-as-new. */
const draftCode = { model: '', structure: '', terrain: '', level: '' };
/** 'split' (current vs new side-by-side) or 'new' (new only) per tab. Only
 * meaningful while iterating on an existing asset — brand-new assets never
 * have a "Current" to compare against. */
const compareMode = { model: 'split', structure: 'split', terrain: 'split', level: 'split' };
let projectAssets = { models: [], levels: [] };

const statusEl = document.getElementById('status');

async function refreshStatus() {
  try {
    const res = await fetch('/api/status');
    const status = await res.json();
    if (status.connected && status.authenticated) {
      statusEl.textContent = `Copilot connected${status.login ? ` as ${status.login}` : ''}`;
      statusEl.className = 'status ok';
    } else if (status.connected) {
      statusEl.textContent = status.message || 'Copilot connected, not authenticated';
      statusEl.className = 'status err';
    } else {
      statusEl.textContent = status.message || 'Copilot CLI unavailable';
      statusEl.className = 'status err';
    }
  } catch (err) {
    statusEl.textContent = 'Editor server unreachable';
    statusEl.className = 'status err';
  }
}

function panelFor(tab) {
  return document.querySelector(`.panel[data-panel="${tab}"]`);
}

function field(panel, name) {
  return panel.querySelector(`[data-field="${name}"]`);
}

function activateTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
  document.querySelectorAll('[data-sidebar-group]').forEach((g) => g.classList.toggle('active', g.dataset.sidebarGroup === tab));
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

/** Preview/Code toggle: only one `[data-view-pane]` is shown at a time per
 * panel, defaulting to Preview since that's what people actually look at —
 * the code is there to copy/save, not to read line by line. */
function setActiveView(panel, view) {
  panel.querySelectorAll('[data-view-toggle] .view-toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  panel.querySelectorAll('[data-view-pane]').forEach((pane) => {
    pane.hidden = pane.dataset.viewPane !== view;
  });
}

document.querySelectorAll('[data-view-toggle]').forEach((toggle) => {
  const panel = toggle.closest('.panel');
  toggle.querySelectorAll('.view-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveView(panel, btn.dataset.view));
  });
});

/** Compare/New-only toggle for the two-pane 3D preview. Only shown once
 * there's both a "Current" (on-disk) asset and a freshly generated draft to
 * put next to it. */
function setCompareMode(tab, mode) {
  compareMode[tab] = mode;
  const panel = panelFor(tab);
  panel.querySelectorAll('[data-compare-toggle] .compare-toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.compare === mode);
  });
  const grid = panel.querySelector('[data-preview-grid]');
  const currentPane = panel.querySelector('[data-preview-pane="current"]');
  if (!grid || !currentPane) return;
  const showCurrent = mode === 'split' && !currentPane.hasAttribute('data-empty');
  grid.classList.toggle('split', showCurrent);
  currentPane.hidden = !showCurrent;
}

document.querySelectorAll('[data-compare-toggle]').forEach((toggle) => {
  const panel = toggle.closest('.panel');
  const tab = panel.dataset.panel;
  toggle.querySelectorAll('.compare-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => setCompareMode(tab, btn.dataset.compare));
  });
});

/** Drag-and-drop + click-to-browse affordance for the reference image input;
 * purely visual/UX, the underlying `<input type="file">` still drives state. */
document.querySelectorAll('[data-file-drop]').forEach((drop) => {
  const input = drop.querySelector('input[type="file"]');
  const label = drop.querySelector('[data-file-drop-label]');
  const setLabel = () => {
    label.textContent = input.files?.[0] ? input.files[0].name : 'Drop an image or click to browse';
  };
  input.addEventListener('change', setLabel);
  ['dragenter', 'dragover'].forEach((evt) =>
    drop.addEventListener(evt, (e) => {
      e.preventDefault();
      drop.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    drop.addEventListener(evt, () => drop.classList.remove('dragover'))
  );
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      input.files = e.dataTransfer.files;
      setLabel();
    }
  });
});

async function fileToDataUrl(file) {
  return new Promise((resolvePromise, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolvePromise(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** POSIX-style dirname for project-relative paths (always uses '/'). */
function posixDirname(path) {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/** Join + normalize a relative import specifier against the importer's
 * directory, resolving './' and '../' segments (POSIX-style, no Node `path`
 * module available in the browser). Preserves leading '../' segments that
 * escape above the starting directory (rather than silently dropping them)
 * since real project files sometimes import shared helpers that live above
 * the game's own folder. */
function joinRelative(fromDir, specifier) {
  const combined = (fromDir ? fromDir.split('/') : []).concat(specifier.split('/'));
  const stack = [];
  for (const segment of combined) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
      else stack.push('..');
    } else {
      stack.push(segment);
    }
  }
  return stack.join('/');
}

const IMPORT_STATEMENT = /^(?:import\s[^\n]*?|export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+)from\s*(['"])([^'"]+)\1;?\s*$/gm;
const MAX_RESOLVE_DEPTH = 6;
const MAX_RESOLVED_FILES = 30;

/** Renderoni's own public module boundaries (`renderoni/presets`, etc., per
 * AGENTS.md). Real game files inside the engine's own repo import these via
 * deep relative paths straight into `src/` (e.g. `../../../../presets/index.js`);
 * an external consumer project imports them as `renderoni/presets`. Either
 * way, resolve them to the engine's own pre-built `/vendor/dist` bundle
 * instead of trying to re-transpile the engine's internal source (which pulls
 * in Rapier/typebox and other npm deps a blob-URL module can't load). */
const ENGINE_SUBSYSTEMS = new Set([
  'core', 'presets', 'animation', 'audio', 'ui', 'vfx', 'scene', 'input', 'testing', 'mcp',
]);

/** Resolves an import specifier to a fully-qualified `/vendor/dist/...` URL
 * (blob-URL modules can't resolve root-relative paths against their
 * `blob:` base, so this must be an absolute URL) if it refers to the
 * Renderoni engine's own public module boundary, else null. */
function resolveEngineVendorUrl(specifier, dir) {
  const vendorUrl = (subsystem) => new URL(`/vendor/dist/${subsystem}/index.js`, location.origin).href;
  if (specifier === 'renderoni') return new URL('/vendor/dist/index.js', location.origin).href;
  if (specifier.startsWith('renderoni/')) {
    const subsystem = specifier.slice('renderoni/'.length).split('/')[0];
    return ENGINE_SUBSYSTEMS.has(subsystem) ? vendorUrl(subsystem) : null;
  }
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const joined = joinRelative(dir, specifier);
  // Only relative imports that climb *above* the importer's own project tree
  // (leading '../' left over after normalization) can possibly be reaching
  // into the engine's own `src/` — anything else is a regular project file.
  const escapeMatch = /^(\.\.\/)+(.*)$/.exec(joined);
  if (!escapeMatch) return null;
  const rest = escapeMatch[2];
  const subsystem = rest.split('/')[0];
  if (!ENGINE_SUBSYSTEMS.has(subsystem)) return null;
  return vendorUrl(subsystem);
}

/** Bare npm specifiers the engine itself depends on, resolved via a
 * document-wide `<script type="importmap">` (see index.html) rather than
 * per-import rewriting — left untouched here since the browser's native
 * module loader already knows where to fetch them from. */
const IMPORT_MAPPED_SPECIFIERS = new Set([
  'three', '@sinclair/typebox', '@dimforge/rapier3d-compat', 'xxhash-wasm', 'zustand', 'nipplejs',
]);

/** Recursively resolves a module's relative imports into real Blob-URL ES
 * modules so previews work even when a factory genuinely depends on sibling
 * project helpers (e.g. a shared `materials.ts` texture generator), instead
 * of only working for THREE-only files.
 *
 * Nested files are resolved *atomically*: if anything a nested file needs
 * (a bare npm specifier like `@dimforge/rapier3d-compat`, or one of ITS OWN
 * nested imports) can't be resolved, the whole nested file is treated as
 * unresolvable and the import referencing it is stripped in its parent —
 * rather than loading a half-working module that throws a `ReferenceError`
 * the moment the browser evaluates it. Only the entry file (the one actually
 * being previewed) gets best-effort per-import stripping, since it's fine if
 * one of several sibling imports can't resolve as long as the previewed
 * factory doesn't actually need it. Anything left unresolved is reported
 * back via `skipped` so the caller can surface a clear message. */
async function resolveModuleGraph(entrySource, entryDir, cache) {
  const skipped = [];

  // Atomic: returns a blob URL only if every (transitive) import resolved.
  async function resolveFile(relativePath, depth) {
    if (cache.has(relativePath)) return cache.get(relativePath);
    if (depth > MAX_RESOLVE_DEPTH || cache.size >= MAX_RESOLVED_FILES) {
      skipped.push(relativePath);
      return null;
    }
    // Insert a placeholder before recursing so cyclic imports don't loop forever.
    cache.set(relativePath, null);
    let source;
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(relativePath)}`);
      if (!res.ok) throw new Error('not found');
      const body = await res.json();
      source = body.content;
    } catch {
      skipped.push(relativePath);
      return null;
    }
    const dir = posixDirname(relativePath);
    const blobUrl = await processSource(source, dir, depth, { atomic: true });
    cache.set(relativePath, blobUrl);
    return blobUrl;
  }

  async function processSource(source, dir, depth, { atomic }) {
    const ts = await loadTypeScript();
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    });

    const replacements = [];
    for (const match of outputText.matchAll(IMPORT_STATEMENT)) {
      const [statement, , specifier] = match;
      const vendorUrl = resolveEngineVendorUrl(specifier, dir);
      if (vendorUrl) {
        replacements.push([statement, statement.replace(specifier, vendorUrl)]);
      } else if (IMPORT_MAPPED_SPECIFIERS.has(specifier)) {
        // Left as-is — resolved by the document's import map.
      } else if (specifier.startsWith('.') || specifier.startsWith('/')) {
        const targetPath = joinRelative(dir, specifier);
        const resolved = await resolveFile(targetPath, depth + 1);
        if (resolved) {
          replacements.push([statement, statement.replace(specifier, resolved)]);
        } else if (atomic) {
          return null;
        } else {
          skipped.push(targetPath);
          replacements.push([statement, '']);
        }
      } else if (atomic) {
        // Bare npm-package specifier a nested module needs — can't resolve
        // in a blob-URL module, and unlike the entry file we can't safely
        // assume it's unused, so give up on this whole nested file.
        return null;
      } else {
        skipped.push(specifier);
        replacements.push([statement, '']);
      }
    }

    let rewritten = outputText;
    for (const [from, to] of replacements) rewritten = rewritten.replace(from, to);
    const blob = new Blob([rewritten], { type: 'text/javascript' });
    return URL.createObjectURL(blob);
  }

  const entryBlobUrl = await processSource(entrySource, entryDir, 0, { atomic: false });
  return { entryBlobUrl, skipped };
}

/** Splits a raw parameter-list (or object-type-literal-field-list) source on
 * top-level separators only, ignoring separators nested inside `{}`/`[]`/`()`
 * (e.g. an inline object-type parameter with several fields, or a tuple type). */
function splitTopLevel(source, separators) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of source) {
    if ('{[('.includes(ch)) depth++;
    if ('}])'.includes(ch)) depth--;
    if (depth === 0 && separators.includes(ch)) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Parses a single `name: Type = default` (or `name?: Type`, or bare `name`)
 * declaration into its parts, splitting on the top-level `:` and `=` only. */
function parseDecl(decl) {
  const [beforeEq] = splitTopLevel(decl, '=');
  const withoutDefault = (beforeEq ?? decl).trim();
  const colonIdx = (() => {
    let depth = 0;
    for (let i = 0; i < withoutDefault.length; i++) {
      const ch = withoutDefault[i];
      if ('{[('.includes(ch)) depth++;
      if ('}])'.includes(ch)) depth--;
      if (ch === ':' && depth === 0) return i;
    }
    return -1;
  })();
  if (colonIdx === -1) return { name: withoutDefault.replace(/\?$/, ''), type: null };
  const name = withoutDefault.slice(0, colonIdx).trim().replace(/\?$/, '');
  const type = withoutDefault.slice(colonIdx + 1).trim();
  return { name, type };
}

/** Best-effort synthesizes a plausible stand-in JS value for a TS type
 * annotation, so `build*(engine, ...)` factories can be called with a real
 * (throwaway) engine plus reasonable placeholder args instead of only ever
 * showing a "requires arguments" dead end. */
function synthesizeValue(type, nameHint) {
  const t = (type ?? '').trim();
  if (!t) return 0;
  const tupleMatch = /^\[([^\]]*)\]$/.exec(t);
  if (tupleMatch) {
    const items = splitTopLevel(tupleMatch[1], ',');
    return items.map((item) => synthesizeValue(item, null));
  }
  if (/^number$/.test(t)) return 0;
  if (/^boolean$/.test(t)) return false;
  if (/^string$/.test(t)) return nameHint ? `preview-${nameHint}` : 'preview';
  if (/^(['"]).*\1$/.test(t)) return t.slice(1, -1); // string literal type, e.g. 'none'
  if (t.startsWith('{') && t.endsWith('}')) {
    const fields = splitTopLevel(t.slice(1, -1), ';\n');
    const obj = {};
    for (const field of fields) {
      const { name, type: fieldType } = parseDecl(field);
      if (name) obj[name] = synthesizeValue(fieldType, name);
    }
    return obj;
  }
  // Unknown/union/complex type (e.g. `'a' | 'b'`, a custom interface) — best
  // guess of an empty object so property access on it doesn't throw outright.
  return {};
}

/** Renderoni model factories in this project follow the same convention as
 * `mountSceneInventory`: `(engine, id, position, ...)`. Synthesizes the
 * trailing arguments for a `build*(engine, ...)` factory from its declared
 * parameter types so it can be called with a real (throwaway) engine. */
function synthesizeArgsAfterEngine(paramList) {
  return paramList.slice(1).map((decl) => {
    const { name, type } = parseDecl(decl);
    return synthesizeValue(type, name);
  });
}

let enginePromise;
/** Lazily imports the engine's own pre-built bundle (served by the editor
 * server from its own `dist/`), so `createRenderoni` runs for real. */
function loadEngine() {
  if (!enginePromise) enginePromise = import('/vendor/dist/index.js');
  return enginePromise;
}

/** Finds every exported `create*`/`build*` factory in the source and picks
 * the best one to preview: prefer one the server already flagged
 * `previewable` (all-defaulted, or `engine`-first); otherwise fall back to
 * the first previewable-looking match found by scanning locally (covers
 * freshly-generated code that hasn't been through /api/assets yet). This
 * avoids blindly grabbing the first exported function in the file, which
 * may be an internal helper (e.g. `createManorDoorModel(options: {...})`)
 * rather than the actual previewable entry point
 * (`buildInteractiveManorDoor`). */
function pickPreviewFactory(code, factories) {
  const FACTORY_RE = /export function ((?:create|build)\w*)\s*\(([^)]*)\)/g;
  const found = [];
  let m;
  while ((m = FACTORY_RE.exec(code))) {
    found.push({ name: m[1], paramsSrc: m[2] });
  }
  if (found.length === 0) return { fnName: null, paramList: [] };

  const paramListFor = (paramsSrc) => splitTopLevel(paramsSrc, ',');
  const isPreviewableLocally = (paramList) =>
    paramList.length === 0 ||
    paramList.every((p) => p.includes('=')) ||
    /^engine\s*:\s*RenderoniEngine\b/.test(paramList[0] ?? '');

  let chosen = null;
  if (Array.isArray(factories)) {
    const previewableNames = new Set(factories.filter((f) => f.previewable).map((f) => f.name));
    chosen = found.find((f) => previewableNames.has(f.name));
  }
  if (!chosen) {
    chosen = found.find((f) => isPreviewableLocally(paramListFor(f.paramsSrc)));
  }
  if (!chosen) chosen = found[0];

  return { fnName: chosen.name, paramList: paramListFor(chosen.paramsSrc) };
}

/** Fully tears down a preview container: cancels its render loop, disposes
 * the WebGL renderer/context and any THREE resources it created, and clears
 * the DOM. This is the fix for the editor feeling "slow" over time — every
 * previous preview render (each keystroke-driven regenerate, each asset
 * click) was leaving a live WebGLRenderer + requestAnimationFrame loop
 * running forever, since only the rAF was ever cancelled. Browsers cap the
 * number of live WebGL contexts (typically ~16), so after a handful of
 * generations every subsequent preview would silently fail to acquire a
 * context and the page would degrade further from N leaked render loops
 * still ticking in the background. */
function teardownPreview(container) {
  if (container._cleanup) {
    container._cleanup();
    container._cleanup = null;
  }
  container.innerHTML = '';
  container.classList.remove('preview-loading');
}

function setPreviewLoading(container) {
  teardownPreview(container);
  container.classList.add('preview-loading');
  container.innerHTML = '<span class="spinner"></span> Rendering preview…';
}

async function renderThreePreview(container, code, sourcePath, factories) {
  teardownPreview(container);
  const { fnName, paramList } = pickPreviewFactory(code, factories);
  if (!fnName) {
    container.textContent = 'No factory function found to preview.';
    return;
  }
  const engineMode = paramList.length > 0 && /^engine\s*:/.test(paramList[0]);

  let factory;
  let skipped = [];
  const blobUrls = [];
  try {
    const entryDir = posixDirname(sourcePath || '');
    const cache = new Map();
    const result = await resolveModuleGraph(code, entryDir, cache);
    skipped = result.skipped;
    for (const url of cache.values()) if (url) blobUrls.push(url);
    blobUrls.push(result.entryBlobUrl);

    const mod = await import(/* @vite-ignore */ result.entryBlobUrl);
    factory = mod[fnName];
    if (typeof factory !== 'function') {
      throw new Error(`Generated module has no export named ${fnName}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    container.textContent = skipped.length > 0
      ? `Preview unavailable: this file depends on module(s) we couldn't resolve for preview (${skipped.join(', ')}) — ${message}. Save and test it in-engine instead.`
      : `Preview failed: ${message}`;
    return;
  } finally {
    for (const url of blobUrls) URL.revokeObjectURL(url);
  }

  if (engineMode) {
    await renderEnginePreview(container, factory, fnName, paramList);
  } else {
    renderStandalonePreview(container, factory, fnName);
  }
}

/** Preview path for self-contained `create*()` factories that just return a
 * `THREE.Object3D` (or a wrapper with one), no engine involved. */
function renderStandalonePreview(container, factory, fnName) {
  let object3D;
  try {
    const built = factory();
    object3D = built instanceof THREE.Object3D
      ? built
      : built?.object ?? built?.group ?? built?.model ?? built?.root ??
        (built && typeof built === 'object'
          ? Object.values(built).find((v) => v instanceof THREE.Object3D)
          : undefined);
    if (!(object3D instanceof THREE.Object3D)) {
      throw new Error(`${fnName}() did not return a THREE.Object3D`);
    }
  } catch (err) {
    container.textContent = `Preview failed: ${err instanceof Error ? err.message : String(err)}`;
    return;
  }

  const width = container.clientWidth || 320;
  const height = container.clientHeight || 320;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(object3D);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.1));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(4, 6, 4);
  scene.add(dir);

  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length(), 0.5);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, radius * 20);
  camera.position.set(center.x + radius, center.y + radius * 0.7, center.z + radius);
  camera.lookAt(center);

  let frame = 0;
  let raf;
  let disposed = false;
  function animate() {
    if (disposed) return;
    frame += 1;
    object3D.rotation.y = frame * 0.008;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }
  animate();

  container._cleanup = () => {
    disposed = true;
    cancelAnimationFrame(raf);
    disposeHierarchy(object3D);
    renderer.dispose();
    renderer.forceContextLoss();
  };
}

/** Disposes every geometry/material/texture in an object's hierarchy, per
 * Renderoni's own resource-cleanup convention (see the renderoni skill's
 * "Resource Disposal" section) — necessary here because the preview creates
 * a brand-new THREE.Object3D on every single generation/click and none of
 * that GPU memory was ever being freed. */
function disposeHierarchy(node) {
  node.traverse((child) => {
    if (child.geometry) child.geometry.dispose?.();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose?.());
    else if (material) material.dispose?.();
  });
}

/** Preview path for `build*(engine, ...)` factories: spins up a real
 * (throwaway, headless-of-physics-stepping) Renderoni engine, calls the
 * factory against it with synthesized stand-in arguments for everything
 * after `engine`, then orbits a camera around whatever it added to the
 * engine's own scene. This is the only reliable way to preview these,
 * since they mutate a live engine (`engine.add(...)`, `engine.native.scene`)
 * rather than just returning a `THREE.Object3D`. */
async function renderEnginePreview(container, factory, fnName, paramList) {
  const width = container.clientWidth || 320;
  const height = container.clientHeight || 320;
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  let engine;
  try {
    const { createRenderoni } = await loadEngine();
    engine = await createRenderoni({ mode: 'interactive', canvas, gravity: [0, -9.81, 0] });
    engine.native.renderer.setSize(width, height);
    engine.native.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    engine.native.camera.aspect = width / height;
    engine.native.camera.updateProjectionMatrix();
    engine.native.scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(4, 6, 4);
    engine.native.scene.add(dirLight);

    const args = [engine, ...synthesizeArgsAfterEngine(paramList)];
    factory(...args);
  } catch (err) {
    engine?.dispose();
    container.textContent = `Preview failed: ${err instanceof Error ? err.message : String(err)}. Save and test it in-engine instead.`;
    return;
  }

  const box = new THREE.Box3().setFromObject(engine.native.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Number.isFinite(size.length()) && size.length() > 0 ? size.length() : 8;
  engine.native.camera.near = Math.max(radius / 200, 0.01);
  engine.native.camera.far = radius * 20;
  engine.native.camera.updateProjectionMatrix();

  let angle = 0;
  let raf;
  let disposed = false;
  function animate() {
    if (disposed) return;
    angle += 0.006;
    engine.native.camera.position.set(
      center.x + Math.sin(angle) * radius,
      center.y + radius * 0.6,
      center.z + Math.cos(angle) * radius
    );
    engine.native.camera.lookAt(center);
    engine.native.renderer.render(engine.native.scene, engine.native.camera);
    raf = requestAnimationFrame(animate);
  }
  animate();

  container._cleanup = () => {
    disposed = true;
    cancelAnimationFrame(raf);
    engine.dispose();
  };
}

const KIND_COLORS = {
  terrain: '#78716c',
  prop: '#94a3b8',
  actor: '#38bdf8',
  pickup: '#fbbf24',
  decor: '#c084fc',
};

function renderLevelView(panel, code) {
  const plot = panel.querySelector('[data-level-plot]');
  const tbody = panel.querySelector('[data-level-table] tbody');
  const ctx = plot.getContext('2d');
  ctx.clearRect(0, 0, plot.width, plot.height);
  tbody.innerHTML = '';

  let inventory;
  try {
    inventory = JSON.parse(code);
  } catch {
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Invalid JSON', 10, 20);
    return;
  }
  const elements = Array.isArray(inventory.elements) ? inventory.elements : [];
  if (elements.length === 0) return;

  const xs = elements.map((e) => e.position?.[0] ?? 0);
  const zs = elements.map((e) => e.position?.[2] ?? 0);
  const minX = Math.min(...xs, -1);
  const maxX = Math.max(...xs, 1);
  const minZ = Math.min(...zs, -1);
  const maxZ = Math.max(...zs, 1);
  const pad = 24;
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;

  const toCanvas = (x, z) => [
    pad + ((x - minX) / spanX) * (plot.width - pad * 2),
    pad + ((z - minZ) / spanZ) * (plot.height - pad * 2),
  ];

  // Axes
  ctx.strokeStyle = '#2a2f3a';
  ctx.strokeRect(pad, pad, plot.width - pad * 2, plot.height - pad * 2);

  // Batch table rows into a single fragment instead of one reflow per row.
  const frag = document.createDocumentFragment();
  for (const el of elements) {
    const [x, , z] = el.position ?? [0, 0, 0];
    const [cx, cy] = toCanvas(x, z);
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = KIND_COLORS[el.kind] ?? '#e5e7eb';
    ctx.fill();
    ctx.strokeStyle = '#05070a';
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px sans-serif';
    ctx.fillText(el.id ?? '', cx + 8, cy + 3);

    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${el.id ?? ''}</td><td>${el.factory ?? ''}</td><td>${el.kind ?? ''}</td><td>${JSON.stringify(el.position ?? [])}</td>`;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

function setEditingBanner(panel, relativePath) {
  const banner = panel.querySelector('[data-editing-banner]');
  const pathEl = panel.querySelector('[data-editing-path]');
  if (relativePath) {
    pathEl.textContent = relativePath;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

/** Save UI has two distinct modes:
 *  - Brand-new asset (not editing anything existing): only a "Save as"
 *    path input + a single "Save to project" button, so the user picks a
 *    name once when the file doesn't exist yet.
 *  - Iterating on an existing asset: the path is fixed (shown read-only in
 *    the editing banner), a single "Update" button overwrites that same
 *    file in place, and a secondary "Save as new…" button is available for
 *    forking the draft into a new file without touching the original. */
function setSaveMode(tab, { isExisting, relativePath }) {
  const panel = panelFor(tab);
  const saveRow = panel.querySelector('[data-save-row]');
  const newLabel = panel.querySelector('[data-save-row-new-label]');
  const pathInput = field(panel, 'savePath');
  const saveLabel = panel.querySelector('[data-save-label]');
  const saveAsNewBtn = panel.querySelector('[data-action="save-as-new"]');

  if (isExisting) {
    newLabel.hidden = true;
    pathInput.hidden = true;
    pathInput.value = relativePath;
    saveLabel.textContent = 'Update';
    saveAsNewBtn.hidden = false;
  } else {
    newLabel.hidden = false;
    pathInput.hidden = false;
    saveLabel.textContent = 'Save to project';
    saveAsNewBtn.hidden = true;
  }
  saveRow.dataset.mode = isExisting ? 'existing' : 'new';
}

function loadAssetIntoPanel(tab, relativePath, code, factories) {
  const panel = panelFor(tab);
  editing[tab] = { relativePath, code, factories };
  draftCode[tab] = '';
  setEditingBanner(panel, relativePath);
  setSaveMode(tab, { isExisting: true, relativePath });
  field(panel, 'prompt').value = '';
  field(panel, 'prompt').placeholder = 'Describe what to change…';
  panel.querySelector('[data-action="save"]').disabled = true;
  panel.querySelector('[data-code]').textContent = code;

  activateTab(tab);
  highlightSelectedCard(tab, relativePath);

  const currentPane = panel.querySelector('[data-preview-pane="current"]');
  const newPane = panel.querySelector('[data-preview-pane="new"]');
  const compareToggle = panel.querySelector('[data-compare-toggle]');

  if (tab === 'level') {
    renderLevelView(panel, code);
    return;
  }

  // "Current" pane shows the on-disk asset as-is; "New" pane is empty until
  // the user actually generates a revision, so we're never comparing two
  // copies of the same thing.
  currentPane.removeAttribute('data-empty');
  currentPane.querySelector('.preview-pane-label').textContent = 'Current (on disk)';
  const currentPreview = currentPane.querySelector('[data-preview="current"]');
  setPreviewLoading(currentPreview);
  renderThreePreview(currentPreview, code, relativePath, factories);

  const newPreview = newPane.querySelector('[data-preview="new"]');
  teardownPreview(newPreview);
  newPreview.textContent = 'Generate a revision to preview it here.';
  newPane.querySelector('[data-preview-new-label]').textContent = 'New (not saved)';

  compareToggle.hidden = false;
  setCompareMode(tab, 'split');
}

function discardEditing(tab) {
  const panel = panelFor(tab);
  editing[tab] = null;
  draftCode[tab] = '';
  setEditingBanner(panel, null);
  setSaveMode(tab, { isExisting: false });
  field(panel, 'prompt').value = '';
  field(panel, 'prompt').placeholder = tab === 'level'
    ? 'A courtyard with a crate, lantern, tree, and well'
    : tab === 'terrain'
      ? 'Rolling grassy hills with a dirt path'
      : tab === 'structure'
        ? 'A paneled hallway wall segment with a doorway'
        : 'A weathered wooden crate with iron bands';
  field(panel, 'savePath').value = '';
  panel.querySelector('[data-code]').textContent = '';
  highlightSelectedCard(tab, null);

  const currentPreview = panel.querySelector('[data-preview="current"]');
  const newPreview = panel.querySelector('[data-preview="new"]');
  if (currentPreview) teardownPreview(currentPreview);
  if (newPreview) {
    teardownPreview(newPreview);
    newPreview.textContent = '';
  }
  const compareToggle = panel.querySelector('[data-compare-toggle]');
  if (compareToggle) compareToggle.hidden = true;
  const grid = panel.querySelector('[data-preview-grid]');
  if (grid) grid.classList.remove('split');
}

document.querySelectorAll('[data-action="discard"]').forEach((btn) => {
  const tab = btn.closest('.panel').dataset.panel;
  btn.addEventListener('click', () => discardEditing(tab));
});

document.querySelectorAll('[data-new]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.new;
    discardEditing(tab);
    activateTab(tab);
  });
});

function highlightSelectedCard(tab, relativePath) {
  const listName = tab === 'level' ? 'levels' : tab;
  document.querySelectorAll(`[data-asset-list="${listName}"] .asset-card`).forEach((card) => {
    card.classList.toggle('selected', relativePath != null && card.dataset.path === relativePath);
  });
}

function renderAssetLists() {
  const modelLists = {
    model: document.querySelector('[data-asset-list="model"]'),
    structure: document.querySelector('[data-asset-list="structure"]'),
    terrain: document.querySelector('[data-asset-list="terrain"]'),
  };
  const levelsList = document.querySelector('[data-asset-list="levels"]');

  for (const list of Object.values(modelLists)) list.innerHTML = '';
  const grouped = { model: [], structure: [], terrain: [] };
  for (const model of projectAssets.models) {
    (grouped[model.kind] ?? grouped.model).push(model);
  }
  for (const [kind, list] of Object.entries(modelLists)) {
    if (grouped[kind].length === 0) {
      list.innerHTML = `<p class="empty-hint">No existing ${kind === 'model' ? 'models' : kind} found in this project.</p>`;
      continue;
    }
    const frag = document.createDocumentFragment();
    for (const model of grouped[kind]) {
      const card = document.createElement('button');
      card.className = 'asset-card';
      card.dataset.path = model.relativePath;
      const factoryNames = model.factories.map((f) => f.name).join(', ');
      const noPreview = model.factories.every((f) => !f.previewable);
      const badge = noPreview ? '<span class="badge">no live preview</span>' : '';
      card.innerHTML = `<span class="name">${model.relativePath.split('/').pop()}${badge}</span><span class="meta">${model.kind} · ${factoryNames}</span>`;
      card.title = noPreview
        ? 'Every exported factory here requires arguments (e.g. an engine instance) — save and test in-engine instead of previewing.'
        : '';
      card.addEventListener('click', () => loadAssetIntoPanel(model.kind, model.relativePath, model.code, model.factories));
      frag.appendChild(card);
    }
    list.appendChild(frag);
  }

  levelsList.innerHTML = '';
  if (projectAssets.levels.length === 0) {
    levelsList.innerHTML = '<p class="empty-hint">No scene-inventory files found in this project.</p>';
  }
  const levelFrag = document.createDocumentFragment();
  for (const level of projectAssets.levels) {
    const card = document.createElement('button');
    card.className = 'asset-card';
    card.dataset.path = level.relativePath;
    card.innerHTML = `<span class="name">${level.relativePath.split('/').pop()}</span><span class="meta">${level.elementCount} elements</span>`;
    card.addEventListener('click', () => loadAssetIntoPanel('level', level.relativePath, level.raw));
    levelFrag.appendChild(card);
  }
  levelsList.appendChild(levelFrag);
}

async function refreshAssets() {
  try {
    const res = await fetch('/api/assets');
    projectAssets = await res.json();
  } catch {
    projectAssets = { models: [], levels: [] };
  }
  renderAssetLists();
}

async function onGenerate(tab) {
  const panel = panelFor(tab);
  const button = panel.querySelector('[data-action="generate"]');
  const btnLabel = button.querySelector('[data-btn-label]');
  const saveButton = panel.querySelector('[data-action="save"]');
  const codeEl = panel.querySelector('[data-code]');
  const newPreview = panel.querySelector('[data-preview="new"]');

  const prompt = field(panel, 'prompt')?.value?.trim();
  if (!prompt) {
    codeEl.textContent = editing[tab] ? 'Describe the change you want, then Generate.' : 'Enter a prompt first.';
    return;
  }

  const imageInput = field(panel, 'image');
  const imageDataUrl = imageInput?.files?.[0] ? await fileToDataUrl(imageInput.files[0]) : undefined;
  const context = field(panel, 'context')?.value?.trim();
  const existingCode = editing[tab]?.code;

  button.disabled = true;
  btnLabel.innerHTML = '<span class="spinner"></span>Generating…';
  codeEl.textContent = '';
  if (tab !== 'level') setPreviewLoading(newPreview);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab, prompt, imageDataUrl, context: context || undefined, existingCode }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Generation failed');

    draftCode[tab] = result.code;
    codeEl.textContent = result.code;
    saveButton.disabled = false;

    if (tab === 'level') {
      renderLevelView(panel, result.code);
    } else {
      const sourcePath = editing[tab]?.relativePath || field(panel, 'savePath')?.value?.trim();
      await renderThreePreview(newPreview, result.code, sourcePath);
      const newPane = panel.querySelector('[data-preview-pane="new"]');
      const compareToggle = panel.querySelector('[data-compare-toggle]');
      if (editing[tab]) {
        compareToggle.hidden = false;
        setCompareMode(tab, compareMode[tab] ?? 'split');
      } else {
        newPane.querySelector('[data-preview-new-label]').textContent = 'Preview';
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    codeEl.textContent = `Error: ${message}`;
    if (tab !== 'level') {
      teardownPreview(newPreview);
      newPreview.textContent = `Error: ${message}`;
    }
  } finally {
    button.disabled = false;
    btnLabel.textContent = 'Generate';
  }
}

/** Writes `content` to `relativePath`. When `adoptAsCurrent` is true (the
 * normal "Update"/"Save to project" path), the panel's editing state is
 * switched to treat this path as the on-disk asset going forward. When
 * false (the "Save as new…" fork), the original asset being iterated on is
 * left completely untouched — only a new file is written and the sidebar
 * is refreshed, so the user can keep comparing against their original. */
async function saveToPath(tab, relativePath, content, { adoptAsCurrent }) {
  const panel = panelFor(tab);
  const statusEl = panel.querySelector('[data-save-status]');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.classList.remove('save-status-ok', 'save-status-error');
  }

  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relativePath, content }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Save failed');

  if (adoptAsCurrent) {
    editing[tab] = { relativePath, code: content, factories: editing[tab]?.factories };
    draftCode[tab] = '';
    setEditingBanner(panel, relativePath);
    setSaveMode(tab, { isExisting: true, relativePath });
    panel.querySelector('[data-action="save"]').disabled = true;
  }

  await refreshAssets();
  highlightSelectedCard(tab, adoptAsCurrent ? relativePath : editing[tab]?.relativePath ?? null);

  if (statusEl) {
    statusEl.textContent = `Saved to ${result.savedTo ?? relativePath}`;
    statusEl.classList.add('save-status-ok');
  }
  return result;
}

async function onSave(tab) {
  const panel = panelFor(tab);
  const button = panel.querySelector('[data-action="save"]');
  const statusEl = panel.querySelector('[data-save-status]');
  const isExisting = panel.querySelector('[data-save-row]').dataset.mode === 'existing';
  const relativePath = isExisting ? editing[tab]?.relativePath : field(panel, 'savePath')?.value?.trim();
  if (!relativePath) return;
  const content = draftCode[tab] || editing[tab]?.code;
  if (!content) return;

  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = isExisting ? 'Updating…' : 'Saving…';

  try {
    await saveToPath(tab, relativePath, content, { adoptAsCurrent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (statusEl) {
      statusEl.textContent = `Save failed: ${message}`;
      statusEl.classList.add('save-status-error');
    } else {
      alert(`Save failed: ${message}`);
    }
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function onSaveAsNew(tab) {
  const panel = panelFor(tab);
  const button = panel.querySelector('[data-action="save-as-new"]');
  const statusEl = panel.querySelector('[data-save-status]');
  const content = draftCode[tab];
  if (!content) return;

  const suggested = editing[tab]?.relativePath
    ? editing[tab].relativePath.replace(/(\.\w+)$/, '-new$1')
    : '';
  const relativePath = window.prompt('Save this revision as a new file (relative path):', suggested);
  if (!relativePath) return;

  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = 'Saving…';

  try {
    await saveToPath(tab, relativePath.trim(), content, { adoptAsCurrent: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (statusEl) {
      statusEl.textContent = `Save failed: ${message}`;
      statusEl.classList.add('save-status-error');
    } else {
      alert(`Save failed: ${message}`);
    }
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

document.querySelectorAll('[data-action="generate"]').forEach((btn) => {
  const tab = btn.closest('.panel').dataset.panel;
  btn.addEventListener('click', () => onGenerate(tab));
});

document.querySelectorAll('[data-action="save"]').forEach((btn) => {
  const tab = btn.closest('.panel').dataset.panel;
  btn.addEventListener('click', () => onSave(tab));
});

document.querySelectorAll('[data-action="save-as-new"]').forEach((btn) => {
  const tab = btn.closest('.panel').dataset.panel;
  btn.addEventListener('click', () => onSaveAsNew(tab));
});

// Initialize every panel into "new asset" save mode on first load.
for (const tab of Object.keys(editing)) {
  setSaveMode(tab, { isExisting: false });
}

refreshStatus();
refreshAssets();
