# Wave 8 integration review

Date: 2026-09-23

## Integrated work

- GPU quote: PR #40 adds a read-only first-render quote for the planned RunPod Serverless A6000/A40 48 GB path.
- PWA quote: PR #41 displays GPU, resolution, hourly estimate, example runtimes and a buffered maximum before paid rendering.
- QA preflight: PR #42 enforces the informational-only quote, visible cost guard and the existing 5 EUR/month OpenAI API hard-stop policy.

## Current first-render quote

Pricing snapshot used by the application:
- Provider: RunPod Serverless
- Planned GPU: A6000 / A40 class (48 GB)
- Wan engine: wan-2.2-ti2v-5b
- Resolution: 704x1280
- RunPod rate snapshot: 1.22 USD/hour
- Approximate EUR rate snapshot: 1.07 EUR/hour
- Example compute estimates: 5 min ≈ 0.09 EUR; 10 min ≈ 0.18 EUR; 20 min ≈ 0.36 EUR
- Buffered maximum estimate for the current 20-minute generation timeout: 0.45 EUR

These are compute estimates, not a guarantee of final billed cost. The first real benchmark has not yet been run.

## Staging verification

Latest deployment after the preflight wave:
- deployment: success
- release validation: success
- staging smoke test: success
- D1: DB -> zaynab-studio
- R2: VIDEOS -> zaynab-studio-videos
- ALLOW_REAL_GPU = false
- Worker version: 8134e49f-d5ae-415b-bdda-edb3d67b373c

The existing smoke test validates live health and zero-cost persistent mock generation. The new render-quote endpoint is included in the deployed Worker but is not yet a separate smoke-test assertion.

## Safety state

No real GPU job was launched. The quote is informational only. The application cannot enable paid compute. A real render remains blocked until RunPod credentials/endpoints are configured server-side and the user explicitly approves the quoted first render.

## GPU quote correction

The initial 24 GB RTX 4090 quote was replaced before any paid run. Wan documentation presents 24 GB as sufficient with offloading, but public reports also show some 4090 OOM cases. The first benchmark therefore uses a 48 GB A6000/A40 class quote for more memory headroom at only a small rate increase.
