import { access, readFile } from 'node:fs/promises';

const required = [
  'app/index.html',
  'app/manifest.webmanifest',
  'app/sw.js',
  'app/assets/references/references.json',
  'src/worker.js',
  'wrangler.jsonc',
  'migrations/0001_jobs.sql',
  'runpod-worker/handler.py'
];

let failed = false;
for (const file of required) {
  try { await access(file); console.log(`✓ ${file}`); }
  catch { console.error(`✗ missing ${file}`); failed = true; }
}

const refs = JSON.parse(await readFile('app/assets/references/references.json', 'utf8'));
if (refs.character !== 'Zaynab' || !Array.isArray(refs.references) || refs.references.length < 4) {
  console.error('✗ invalid Zaynab reference manifest');
  failed = true;
} else {
  console.log(`✓ ${refs.references.length} official reference slots declared`);
}

for (const ref of refs.references ?? []) {
  const file = `app/assets/references/${ref.file}`;
  try { await access(file); console.log(`✓ ${file}`); }
  catch { console.error(`✗ reference image not materialized: ${file}`); failed = true; }
}

// The service worker must pre-cache every official reference so PWA installation
// cannot silently succeed with missing identity assets.
const sw = await readFile('app/sw.js', 'utf8');
for (const ref of refs.references ?? []) {
  const expected = `assets/references/${ref.file}`;
  if (!sw.includes(expected)) {
    console.error(`✗ service worker does not cache official reference: ${expected}`);
    failed = true;
  }
}

// Legacy frontend paths are kept as aliases until index.html is migrated.
// Verify the aliases exist so the UI cannot ship broken thumbnails.
for (const file of [
  'app/assets/zaynab-1.jpeg',
  'app/assets/zaynab-2.png',
  'app/assets/zaynab-3.png'
]) {
  try { await access(file); console.log(`✓ ${file}`); }
  catch { console.error(`✗ missing frontend reference alias: ${file}`); failed = true; }
}

if (failed) process.exit(1);
console.log('Release validation passed.');
