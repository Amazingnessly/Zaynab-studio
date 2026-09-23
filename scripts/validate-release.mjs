import { access, readFile } from 'node:fs/promises';

const required = [
  'app/index.html',
  'app/manifest.webmanifest',
  'app/sw.js',
  'app/assets/references/references.json',
  'src/worker.js',
  'wrangler.jsonc',
  'wrangler.staging.jsonc',
  'migrations/0001_jobs.sql',
  'runpod-worker/handler.py'
];

let failed = false;
const ok = message => console.log(`✓ ${message}`);
const fail = message => { console.error(`✗ ${message}`); failed = true; };

for (const file of required) {
  try { await access(file); ok(file); }
  catch { fail(`missing ${file}`); }
}

const refs = JSON.parse(await readFile('app/assets/references/references.json', 'utf8'));
if (refs.character !== 'Zaynab' || !Array.isArray(refs.references) || refs.references.length < 4) {
  fail('invalid Zaynab reference manifest');
} else {
  ok(`${refs.references.length} official reference slots declared`);
}

for (const ref of refs.references ?? []) {
  const file = `app/assets/references/${ref.file}`;
  try { await access(file); ok(file); }
  catch { fail(`reference image not materialized: ${file}`); }
}

const sw = await readFile('app/sw.js', 'utf8');
for (const ref of refs.references ?? []) {
  const expected = `assets/references/${ref.file}`;
  if (!sw.includes(expected)) fail(`service worker does not cache official reference: ${expected}`);
}
if (!/zaynab-studio-v\d+\.\d+\.\d+/.test(sw)) {
  fail('service worker cache name must carry a release version');
} else {
  ok('service worker cache version is explicit');
}

const manifest = JSON.parse(await readFile('app/manifest.webmanifest', 'utf8'));
if (manifest.name !== 'Zaynab Studio' || manifest.display !== 'standalone' || !manifest.start_url) {
  fail('PWA manifest is incomplete');
} else {
  ok('PWA manifest is installable');
}

const staging = JSON.parse(await readFile('wrangler.staging.jsonc', 'utf8'));
if (staging?.vars?.ALLOW_REAL_GPU !== 'false') {
  fail('staging must keep ALLOW_REAL_GPU=false');
} else {
  ok('staging real GPU is disabled');
}
if (!staging?.d1_databases?.some(db => db.binding === 'DB' && db.database_name === 'zaynab-studio')) {
  fail('staging D1 binding DB is missing');
} else {
  ok('staging D1 binding is configured');
}
if (!staging?.r2_buckets?.some(bucket => bucket.binding === 'VIDEOS' && bucket.bucket_name === 'zaynab-studio-videos')) {
  fail('staging R2 binding VIDEOS is missing');
} else {
  ok('staging R2 binding is configured');
}

const worker = await readFile('src/worker.js', 'utf8');
const normalizedWorker = worker.replace(/\\\//g, '/');
for (const route of ['/api/health', '/api/v1/generate', '/api/v1/jobs/', '/api/v1/videos/']) {
  if (!normalizedWorker.includes(route)) fail(`worker route missing: ${route}`);
}
if (!worker.includes('real_gpu_allowed: false')) {
  fail('worker must explicitly report real_gpu_allowed=false');
} else {
  ok('worker reports the GPU safety lock');
}

const frontendFiles = ['app/index.html', 'app/sw.js', 'app/manifest.webmanifest'];
const forbiddenFrontendSecrets = [
  'RUNPOD_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'OPENAI_API_KEY',
  'sk-proj-'
];
for (const file of frontendFiles) {
  const text = await readFile(file, 'utf8');
  for (const token of forbiddenFrontendSecrets) {
    if (text.includes(token)) fail(`frontend secret marker found in ${file}: ${token}`);
  }
}
if (!failed) ok('no server-side secret markers exposed in PWA files');

if (failed) process.exit(1);
console.log('Release validation passed.');
