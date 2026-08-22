# Cloudflare architecture — bootstrap 4.1

Zaynab Studio is moving to a single Cloudflare Worker deployment:

- `app/` contains static/PWA assets.
- `src/worker.js` handles `/api/*` and delegates every other request to the static assets binding.
- `wrangler.jsonc` configures the Worker and static assets.
- Real GPU is disabled by default with `ALLOW_REAL_GPU=false`.
- RunPod secrets must never be committed; when needed they will be added as Cloudflare secrets.

## Financial safety gate

Even if RunPod secrets are accidentally configured, the current Worker refuses real generation until persistent job/video storage is implemented. This prevents a GPU task from producing a result that the application cannot reliably recover.

## Next infrastructure change

Add Cloudflare persistence before enabling RunPod:

1. durable job metadata (D1 or Durable Objects, decision after schema review),
2. R2 bucket for generated MP4 files,
3. signed/controlled result retrieval,
4. RunPod callback/polling integration,
5. only then permit `ALLOW_REAL_GPU=true`.

No GPU is launched by the current bootstrap implementation.
