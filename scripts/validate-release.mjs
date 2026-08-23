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

// Images are intentionally checked separately: deployment must fail rather than silently
// ship a release without the official identity references.
for (const ref of refs.references ?? []) {
  const file = `app/assets/references/${ref.file}`;
  try { await access(file); console.log(`✓ ${file}`); }
  catch { console.error(`✗ reference image not materialized: ${file}`); failed = true; }
}

if (failed) process.exit(1);
console.log('Release validation passed.');
