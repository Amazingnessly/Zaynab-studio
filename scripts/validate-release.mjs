// Paid-render preflight checks run against the current PR base.
import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const required = [
  'app/index.html',
  'app/manifest.webmanifest',
  'app/sw.js',
  'app/assets/references/references.json',
  'src/worker.js',
  'wrangler.jsonc',
  'wrangler.staging.jsonc',
  'migrations/0001_jobs.sql',
  'migrations/0002_upload_grants.sql',
  'migrations/0003_real_gpu_audit.sql',
  'src/runpod.js',
  'scripts/test-runpod-client.mjs',
  'runpod-worker/handler.py',
  'runpod-worker/requirements.txt',
  'runpod-worker/Dockerfile',
  'runpod-worker/README.md'
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

const index = await readFile('app/index.html', 'utf8');
for (const legacy of ['assets/zaynab-1.jpeg', 'assets/zaynab-2.png', 'assets/zaynab-3.png']) {
  if (index.includes(legacy)) fail(`legacy PWA reference path still used: ${legacy}`);
}
for (const official of [
  'assets/references/portrait-main.jpg',
  'assets/references/portrait-alt.jpg',
  'assets/references/supermarket.jpg'
]) {
  if (!index.includes(official)) fail(`official PWA reference missing: ${official}`);
}
if (/Codespaces/i.test(index)) fail('PWA still contains obsolete Codespaces instructions');
else ok('PWA uses official references without obsolete setup copy');

for (const guardText of ['/v1/render-quote', 'Verrou coût actif', 'Confirmation explicite obligatoire']) {
  if (!index.includes(guardText)) fail(`PWA paid-render guard missing: ${guardText}`);
}
if (!failed) ok('PWA exposes cost estimate before paid rendering');

const migration = await readFile('migrations/0001_jobs.sql', 'utf8');
for (const column of ['cost_eur', 'video_key', 'error', 'updated_at']) {
  if (!migration.includes(column)) fail(`persistent job schema missing column: ${column}`);
}
if (!failed) ok('persistent job schema contains result and cost fields');

const uploadMigration = await readFile('migrations/0002_upload_grants.sql', 'utf8');
for (const column of ['upload_token_hash', 'upload_expires_at', 'uploaded_bytes']) {
  if (!uploadMigration.includes(column)) fail(`upload-grant schema missing column: ${column}`);
}
if (!failed) ok('one-time upload grant schema is present');

const gpuAuditMigration = await readFile('migrations/0003_real_gpu_audit.sql', 'utf8');
for (const column of ['approved_cost_eur', 'approval_at', 'provider_execution_ms']) {
  if (!gpuAuditMigration.includes(column)) fail(`real GPU audit schema missing column: ${column}`);
}
if (!failed) ok('real GPU approval audit schema is present');

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
try {
  execFileSync('node', ['--check', 'src/worker.js'], { stdio: 'pipe' });
  execFileSync('node', ['--check', 'src/runpod.js'], { stdio: 'pipe' });
  ok('Cloudflare worker and RunPod client syntax are valid');
} catch {
  fail('Cloudflare worker or RunPod client syntax is invalid');
}
const normalizedWorker = worker.replace(/\\\//g, '/');
for (const route of ['/api/health', '/api/v1/generate', '/api/v1/real-generate', '/api/v1/jobs/', '/api/v1/videos/', '/api/v1/uploads/']) {
  if (!normalizedWorker.includes(route)) fail(`worker route missing: ${route}`);
}
if (!worker.includes('real_gpu_allowed: false')) {
  fail('worker must explicitly report real_gpu_allowed=false');
} else {
  ok('worker reports the GPU safety lock');
}

for (const contract of ['ALLOWED_MODES', 'ALLOWED_FORMATS', 'ALLOWED_DURATIONS', 'PROMPT_TOO_LONG']) {
  if (!worker.includes(contract)) fail(`worker input contract missing: ${contract}`);
}
if (!failed) ok('worker validates bounded generation inputs');

for (const paidGuard of ['GPU_QUOTE', '/api/v1/render-quote', 'A6000 / A40 class', 'hourly_rate_usd', 'max_compute_estimate_eur_with_25pct_buffer']) {
  if (!worker.includes(paidGuard)) fail(`paid-render preflight contract missing: ${paidGuard}`);
}
if (!worker.includes('quote_status: "informational_only"')) fail('render quote must remain informational only');
else ok('render quote cannot activate paid compute');

for (const realGuard of ['REAL_GPU_APPROVAL_TOKEN', 'HUMAN_APPROVAL_REQUIRED', 'FIRST_REAL_RENDER_MAX_EUR', 'FIRST_REAL_RENDER_DURATION', 'approved_max_eur']) {
  if (!worker.includes(realGuard)) fail(`real GPU human gate missing: ${realGuard}`);
}
if (!worker.includes('env.ALLOW_REAL_GPU !== "true"')) fail('real GPU route must fail closed unless ALLOW_REAL_GPU=true');
else ok('real GPU route requires flag, secret approval and cost ceiling');

for (const uploadGuard of ['hashUploadToken', 'upload_token_hash', 'upload_expires_at', 'MAX_UPLOAD_BYTES', 'UPLOAD_TOKEN_REQUIRED', 'UPLOAD_TOKEN_USED']) {
  if (!worker.includes(uploadGuard)) fail(`secure upload contract missing: ${uploadGuard}`);
}
if (!worker.includes('Authorization') && !worker.includes('authorization')) fail('secure upload must require bearer authorization');
else ok('Cloudflare one-time upload route is authenticated');

const runpodHandler = await readFile('runpod-worker/handler.py', 'utf8');
const runpodRequirements = await readFile('runpod-worker/requirements.txt', 'utf8');
try {
  execFileSync('python3', ['-m', 'py_compile', 'runpod-worker/handler.py'], { stdio: 'pipe' });
  ok('RunPod handler Python syntax is valid');
} catch {
  fail('RunPod handler Python syntax is invalid');
}
if (!runpodHandler.includes('timeout=1200') && !runpodHandler.includes('timeout = 1200')) {
  fail('RunPod generation must have a bounded timeout');
} else {
  ok('RunPod generation timeout is bounded');
}
for (const literal of ['sk-proj-', 'CLOUDFLARE_API_TOKEN=', 'RUNPOD_API_KEY=', 'R2_SECRET_ACCESS_KEY=', 'R2_ACCESS_KEY_ID=', 'R2_ENDPOINT_URL=']) {
  if (runpodHandler.includes(literal)) fail(`possible committed secret literal in RunPod worker: ${literal}`);
}
for (const forbidden of ['boto3', 'R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID', 'R2_ENDPOINT_URL']) {
  if (runpodHandler.includes(forbidden)) fail(`RunPod worker must not require static R2 credentials: ${forbidden}`);
}
for (const uploadContract of ['upload_url', 'upload_token', 'Authorization', 'requests.put']) {
  if (!runpodHandler.includes(uploadContract)) fail(`RunPod one-time upload contract missing: ${uploadContract}`);
}
if (!runpodRequirements.includes('requests')) fail('RunPod secure upload requires requests');
if (runpodRequirements.includes('boto3')) fail('RunPod worker should not depend on boto3 after secure upload refactor');
if (!failed) ok('RunPod uploads through a one-time Cloudflare grant without R2 credentials');

for (const cacheContract of ['WAN_MODEL_ID', 'huggingface-cache', 'resolve_checkpoint_dir', 'Wan-AI/Wan2.2-TI2V-5B']) {
  if (!runpodHandler.includes(cacheContract)) fail(`RunPod cached-model contract missing: ${cacheContract}`);
}
if (!failed) ok('RunPod worker resolves the cached Wan model without a paid network volume');


const runpodClient = await readFile('src/runpod.js', 'utf8');
for (const contract of ['/run', '/status/', 'executionTimeout', 'ttl', 'Bearer']) {
  if (!runpodClient.includes(contract)) fail(`RunPod client contract missing: ${contract}`);
}
if (runpodClient.includes('/retry')) fail('automatic paid RunPod retry must remain disabled');
else ok('RunPod async client uses bounded execution without automatic paid retry');

try {
  execFileSync('node', ['scripts/test-runpod-client.mjs'], { stdio: 'pipe' });
  ok('RunPod client contract tests pass without network access');
} catch {
  fail('RunPod client contract tests failed');
}

const frontendFiles = ['app/index.html', 'app/sw.js', 'app/manifest.webmanifest'];
const forbiddenFrontendSecrets = [
  'RUNPOD_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'OPENAI_API_KEY',
  'REAL_GPU_APPROVAL_TOKEN',
  'sk-proj-'
];
for (const file of frontendFiles) {
  const text = await readFile(file, 'utf8');
  for (const token of forbiddenFrontendSecrets) {
    if (text.includes(token)) fail(`frontend secret marker found in ${file}: ${token}`);
  }
}
if (!failed) ok('no server-side secret markers exposed in PWA files');

const orchestratorPlan = JSON.parse(await readFile('orchestrator/plan.json', 'utf8'));
if (orchestratorPlan?.budget?.openai_api_monthly_eur !== 5 || orchestratorPlan?.budget?.hard_stop_required !== true) {
  fail('OpenAI API budget policy must keep a 5 EUR monthly hard stop');
} else {
  ok('OpenAI API budget hard stop remains 5 EUR/month');
}

if (failed) process.exit(1);
console.log('Release validation passed.');
