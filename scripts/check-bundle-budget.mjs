/**
 * Bundle and load budget gate.
 *
 * Reads the Vite manifest of the last `npm run build:web`, splits the emitted
 * chunks into "initial load" and "lazy" using the real static import graph, and
 * compares gzip sizes with scripts/bundle-budget.json.
 *
 * Usage:
 *   node scripts/check-bundle-budget.mjs
 *   node scripts/check-bundle-budget.mjs --update-baseline
 *
 * This measures bytes only. It does not measure frame rate.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const configPath = resolve(root, 'scripts/bundle-budget.json');

export function readBudgetConfig(path = configPath) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function gzipBytes(absolutePath) {
  return gzipSync(readFileSync(absolutePath)).length;
}

function formatBytes(bytes) {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes} B`;
}

/**
 * Collects the chunks a browser must download before the console shell runs:
 * the entry chunk plus every chunk reachable through static imports.
 */
export function collectInitialGraph(manifest) {
  const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
  if (!entryKey) {
    throw new Error('The Vite manifest has no entry chunk.');
  }

  const jsFiles = [];
  const cssFiles = [];
  const seen = new Set();

  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    if (chunk.file?.endsWith('.js')) jsFiles.push(chunk.file);
    for (const css of chunk.css ?? []) {
      if (!cssFiles.includes(css)) cssFiles.push(css);
    }
    // Only static imports are part of the initial load; dynamicImports are not.
    for (const imported of chunk.imports ?? []) visit(imported);
  };

  visit(entryKey);
  return { entryKey, jsFiles, cssFiles, keys: seen };
}

export function measure(manifest, outDir) {
  const initial = collectInitialGraph(manifest);
  const documentPath = resolve(outDir, 'index.html');

  const initialJsGzip = initial.jsFiles.reduce(
    (total, file) => total + gzipBytes(resolve(outDir, file)),
    0
  );
  const initialCssGzip = initial.cssFiles.reduce(
    (total, file) => total + gzipBytes(resolve(outDir, file)),
    0
  );
  const initialHtmlGzip = existsSync(documentPath) ? gzipBytes(documentPath) : 0;

  const chunks = Object.entries(manifest).map(([key, chunk]) => ({
    key,
    file: chunk.file,
    isDynamicEntry: chunk.isDynamicEntry === true,
    initial: initial.jsFiles.includes(chunk.file),
    rawBytes: statSync(resolve(outDir, chunk.file)).size,
    gzipBytes: gzipBytes(resolve(outDir, chunk.file)),
  }));

  const jsChunks = chunks.filter((chunk) => chunk.file.endsWith('.js'));
  const lazyChunks = jsChunks.filter((chunk) => !chunk.initial);

  return {
    initial,
    chunks,
    jsChunks,
    lazyChunks,
    metrics: {
      'initial-js-gzip': initialJsGzip,
      'initial-css-gzip': initialCssGzip,
      'initial-html-gzip': initialHtmlGzip,
      'initial-total-gzip': initialJsGzip + initialCssGzip + initialHtmlGzip,
      'largest-lazy-chunk-gzip': lazyChunks.reduce((max, chunk) => Math.max(max, chunk.gzipBytes), 0),
      'all-js-gzip': jsChunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
    },
  };
}

export function evaluateBudgets(config, metrics) {
  const tolerance = config.defaultTolerancePercent ?? 15;
  return config.budgets.map((budget) => {
    const current = metrics[budget.id];
    if (current === undefined) {
      return { ...budget, current: undefined, failures: [`No measurement produced for ${budget.id}.`] };
    }
    const regressionLimit = Math.round(budget.baselineBytes * (1 + (budget.tolerancePercent ?? tolerance) / 100));
    const failures = [];
    if (current > budget.maxBytes) {
      failures.push(`over hard cap by ${formatBytes(current - budget.maxBytes)}`);
    }
    if (current > regressionLimit) {
      failures.push(
        `regressed ${(((current - budget.baselineBytes) / budget.baselineBytes) * 100).toFixed(1)}% over the recorded baseline`
      );
    }
    return { ...budget, current, regressionLimit, failures };
  });
}

export function checkLazyRules(config, measurement) {
  const failures = [];

  for (const rule of config.mustStayLazy ?? []) {
    const chunk = measurement.chunks.find((candidate) => candidate.key === rule.module);
    if (!chunk) {
      failures.push(
        `${rule.module} has no chunk of its own any more. It must stay a separate lazy chunk: ${rule.why}`
      );
      continue;
    }
    if (chunk.initial) {
      failures.push(`${rule.module} is downloaded on first load. ${rule.why}`);
    }
    if (!chunk.isDynamicEntry) {
      failures.push(`${rule.module} is no longer a dynamic import entry. ${rule.why}`);
    }
  }

  const initialChunks = measurement.jsChunks.filter((chunk) => chunk.initial);
  if (initialChunks.length > (config.maxInitialJsChunks ?? Infinity)) {
    failures.push(
      `initial load pulls ${initialChunks.length} JS chunks, more than the allowed ${config.maxInitialJsChunks}.`
    );
  }
  for (const chunk of initialChunks) {
    if (chunk.rawBytes > (config.maxInitialChunkRawBytes ?? Infinity)) {
      failures.push(
        `initial chunk ${chunk.file} is ${formatBytes(chunk.rawBytes)} raw, over the ${formatBytes(
          config.maxInitialChunkRawBytes
        )} cap. Heavy libraries (three, Rapier) must stay behind a dynamic import.`
      );
    }
  }

  return failures;
}

function main() {
  const config = readBudgetConfig();
  const outDir = resolve(root, 'dist-web');
  const manifestPath = resolve(root, config.measurement.manifest);

  if (!existsSync(manifestPath)) {
    console.error(
      `Bundle budget gate: ${config.measurement.manifest} is missing. Run \`${config.measurement.buildCommand}\` first.`
    );
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const measurement = measure(manifest, outDir);
  const results = evaluateBudgets(config, measurement.metrics);
  const updateBaseline = process.argv.includes('--update-baseline');

  console.log('Bundle & load budgets (gzip bytes)\n');
  const cell = (value, width = 14) => String(value).padEnd(width);
  console.log(`${cell('metric', 26)}${cell('current')}${cell('baseline')}${cell('cap')}status`);
  console.log('-'.repeat(82));
  for (const result of results) {
    const status = result.failures.length === 0 ? 'ok' : `FAIL (${result.failures.join('; ')})`;
    console.log(
      cell(result.id, 26) +
        cell(formatBytes(result.current ?? 0)) +
        cell(formatBytes(result.baselineBytes)) +
        cell(formatBytes(result.maxBytes)) +
        status
    );
  }

  console.log('\nInitial load:');
  console.log(`  document  dist-web/index.html`);
  for (const file of measurement.initial.jsFiles) console.log(`  script    ${file}`);
  for (const file of measurement.initial.cssFiles) console.log(`  style     ${file}`);
  console.log('\nLazy chunks (fetched on demand):');
  for (const chunk of [...measurement.lazyChunks].sort((a, b) => b.gzipBytes - a.gzipBytes)) {
    console.log(`  ${formatBytes(chunk.gzipBytes).padStart(10)}  ${chunk.file}  <- ${chunk.key}`);
  }

  if (updateBaseline) {
    const next = {
      ...config,
      measurement: { ...config.measurement, baselineRecordedAt: new Date().toISOString().slice(0, 10) },
      budgets: config.budgets.map((budget) => ({
        ...budget,
        baselineBytes: measurement.metrics[budget.id] ?? budget.baselineBytes,
      })),
    };
    writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log('\nBaselines rewritten in scripts/bundle-budget.json. Explain the change in the pull request.');
    return;
  }

  const failures = [
    ...results.flatMap((result) => result.failures.map((failure) => `${result.id}: ${failure}`)),
    ...checkLazyRules(config, measurement),
  ];

  if (failures.length > 0) {
    console.error('\nBundle budget gate failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\nEither make it smaller, or, if the growth is intentional, run `node scripts/check-bundle-budget.mjs --update-baseline` and say why in the pull request.'
    );
    process.exit(1);
  }

  console.log('\nBundle budget gate passed.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
