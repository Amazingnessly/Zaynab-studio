# RunPod worker deployment preflight

This directory contains the Zaynab Studio Wan 2.2 TI2V worker. It is prepared for a **future** paid RunPod Serverless benchmark, while real GPU execution remains disabled from the Cloudflare application.

## Container

The Dockerfile pins:
- RunPod PyTorch 2.8 / CUDA 12.8 base image.
- Wan2.2 source commit `1ea34ff48f87168174e12956e200b1d908b1c5ff`.
- Zaynab Studio's `handler.py`.

Model weights are deliberately **not** baked into the image. The expected checkpoint path is:

`/runpod-volume/Wan2.2-TI2V-5B`

Attach a RunPod Network Volume containing the model at `/runpod-volume`.

## RunPod worker configuration

Only non-secret model paths need to be configured as persistent environment variables:

- `WAN_DIR=/opt/Wan2.2`
- `WAN_CKPT_DIR=/runpod-volume/Wan2.2-TI2V-5B`

The worker no longer needs Cloudflare R2 access keys. For each future real job, the Cloudflare Worker will mint a short-lived, one-time upload grant and pass these values in the RunPod job input:

- `upload_url`: HTTPS endpoint under `/api/v1/uploads/<job-id>`
- `upload_token`: one-time bearer token, stored only as a SHA-256 hash in D1

After Wan produces the MP4, the RunPod worker uploads it to Cloudflare using that one-time token. Cloudflare streams the file into the private R2 binding and consumes the token.

## First benchmark safety profile

Planned class: **A6000 / A40, 48 GB VRAM**.

Use a Serverless endpoint with:
- zero idle workers / scale to zero,
- maximum workers: 1,
- request timeout no higher than the worker's 1200 second generation timeout plus a small platform margin,
- no automatic client retry,
- no warm/always-on worker for the first benchmark.

The Cloudflare worker must keep `ALLOW_REAL_GPU=false` until the user has seen the GPU, 704x1280 resolution, target duration, and estimated cost and has explicitly approved the first paid render.

## Secrets needed by Cloudflare later

The Cloudflare Worker will eventually need these server-side secrets:

- `RUNPOD_API_KEY`
- `RUNPOD_ENDPOINT_ID`

Do not put either value in the PWA, GitHub source, issue bodies, PR comments, or chat messages.

No R2 S3 credential is required in RunPod.

## Build command

When the user is ready to deploy the worker image, build it for RunPod's Linux architecture and push it to a private container registry:

```bash
docker build --platform linux/amd64 -t <registry>/zaynab-wan-worker:<version> runpod-worker
docker push <registry>/zaynab-wan-worker:<version>
```

Building and pushing the image does not itself launch a GPU job. Creating or invoking the Serverless endpoint can incur RunPod charges, so that step remains human-controlled.
