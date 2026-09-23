# RunPod worker deployment preflight

This directory contains the Zaynab Studio Wan 2.2 TI2V worker. The repository is prepared for a **future** paid RunPod Serverless benchmark, but real GPU execution remains disabled from the Cloudflare application.

## Container

The Dockerfile pins:
- RunPod PyTorch 2.8 / CUDA 12.8 base image.
- Wan2.2 source commit `1ea34ff48f87168174e12956e200b1d908b1c5ff`.
- Zaynab Studio's `handler.py` and R2 upload dependencies.

Model weights are deliberately **not** baked into the image. The expected checkpoint path is:

`/runpod-volume/Wan2.2-TI2V-5B`

Attach a RunPod Network Volume containing the model at `/runpod-volume`.

## Required RunPod worker environment variables

Configure these in the RunPod template/endpoint. Never commit their values:

- `R2_ENDPOINT_URL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET=zaynab-studio-videos`
- `WAN_DIR=/opt/Wan2.2`
- `WAN_CKPT_DIR=/runpod-volume/Wan2.2-TI2V-5B`

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

## Build command

When the user is ready to deploy the worker image, build it for RunPod's Linux architecture and push it to a private container registry:

```bash
docker build --platform linux/amd64 -t <registry>/zaynab-wan-worker:<version> runpod-worker
docker push <registry>/zaynab-wan-worker:<version>
```

Building and pushing the image does not itself launch a GPU job. Creating or invoking the Serverless endpoint can incur RunPod charges, so that step remains human-controlled.
