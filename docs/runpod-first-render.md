# First real Wan render — guarded runbook

This runbook is for the **first paid benchmark only**. It does not authorize a render by itself.

## Safety invariants

- Keep `ALLOW_REAL_GPU=false` while infrastructure is being configured and tested.
- Never put `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, or `REAL_GPU_APPROVAL_TOKEN` in source, issues, PR comments, browser storage, or chat.
- The normal `/api/v1/generate` route stays mock-only.
- Do not configure automatic paid retries.
- The first real profile is fixed to **Brouillon · 5 s · 9:16 · 704x1280**.
- The first request must explicitly approve a maximum cost no greater than **€0.50**.
- One RunPod worker maximum; zero active workers at idle.

## 1. Worker artifact

The GitHub workflow `Build RunPod Wan worker` builds `runpod-worker/Dockerfile` on every relevant PR and publishes the main-branch image to GHCR.

Before endpoint setup, require:
- repository validation green;
- container build green;
- the main image published successfully;
- GHCR pull access confirmed.

GitHub Container Registry packages are private on first publication even when the source repository is public. For this worker, the preferred setup is to make **only the container package** `zaynab-wan-worker` public, because the image contains no model weights or credentials. That lets RunPod pull it anonymously and avoids creating an extra GitHub package-read token. If the package must remain private, configure RunPod registry credentials separately instead.

Final pre-benchmark worker image after startup fitness checks and upload-host restrictions:
- source commit tag: `ghcr.io/amazingnessly/zaynab-wan-worker:sha-9fb2426`
- immutable image: `ghcr.io/amazingnessly/zaynab-wan-worker@sha256:ef6432228dd72dc8bdcd5bad11376886d6233dfe4a03d14f3ef1191cec840897`

Use the immutable digest above for the first real benchmark. Do not use the moving `:main` tag for that paid run.

## 2. RunPod endpoint

Create a queue-based Serverless endpoint for the worker.

First-benchmark resource policy:
- GPU class: **A6000 / A40 class, 48 GB VRAM**;
- active/min workers: **0**;
- max workers: **1**;
- short idle timeout / scale-to-zero;
- no automatic retry;
- cached Hugging Face model: `Wan-AI/Wan2.2-TI2V-5B`;
- no paid Network Volume unless cached-model scheduling is unavailable.

The worker resolves the cached model from RunPod's Hugging Face cache. `WAN_CKPT_DIR` remains an optional fallback only.

## 3. Secrets

After the endpoint exists, configure server-side secrets without pasting their values into any ticket or chat:

Cloudflare Worker:
- `RUNPOD_API_KEY`
- `RUNPOD_ENDPOINT_ID`
- `REAL_GPU_APPROVAL_TOKEN`

GitHub Actions, for the read-only readiness workflow:
- `RUNPOD_API_KEY`
- optionally `RUNPOD_ENDPOINT_ID`

Leave `ALLOW_REAL_GPU=false`.

## 4. Read-only preflight

Run the GitHub workflow `Check RunPod readiness`.

It may:
- list visible Serverless endpoints;
- read endpoint health.

It must not call:
- `/run`;
- `/runsync`;
- retry;
- any other job-submission endpoint.

Then deploy staging and confirm:
- `/api/health` is healthy;
- persistence is ready;
- `real_gpu_allowed=false`;
- `/api/v1/real-generate` still returns `REAL_GPU_DISABLED`;
- mock generation still completes at `cost_eur: 0`.

## 5. Human approval checkpoint

Only after the user explicitly approves the displayed benchmark quote:

- GPU: A6000/A40 48 GB class
- engine: Wan 2.2 TI2V 5B
- resolution: 704x1280
- duration: 5 s
- mode: Brouillon
- approved maximum: ≤ €0.50

may `ALLOW_REAL_GPU` be changed to `true` for the controlled benchmark.

The paid request still requires the separate server-only approval token in `x-zaynab-render-approval`. The flag alone is not enough to start a GPU job.

## 6. Benchmark execution

Submit exactly one request to `/api/v1/real-generate`.

Expected chain:

`Cloudflare -> RunPod /run -> Wan -> one-time Cloudflare upload grant -> private R2 -> D1 completion`

Observe the existing job endpoint. Do not retry automatically if the job fails.

Capture:
- RunPod job status;
- provider execution time;
- generated MP4 size;
- resulting R2 key;
- identity/visual quality result;
- final provider billing when available.

## 7. Immediate post-benchmark action

Set `ALLOW_REAL_GPU=false` again after the single benchmark, regardless of success or failure.

Any second paid render requires a fresh review of:
- measured execution time;
- actual billed cost;
- output quality;
- whether the GPU class or Wan settings should change.
