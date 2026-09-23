# Wave 8 integration review

Date: 2026-09-23

## Integrated work

- GPU quote: PR #40 adds a read-only first-render quote for the planned RunPod Serverless RTX 4090 path.
- PWA quote: PR #41 displays GPU, resolution, hourly estimate, example runtimes and a buffered maximum before paid rendering.
- QA preflight: PR #42 enforces the informational-only quote, visible cost guard and the existing 5 EUR/month OpenAI API hard-stop policy.

## Current first-render quote

Pricing snapshot used by the application:
- Provider: RunPod Serverless
- Planned GPU: RTX 4090 (24 GB)
- Wan engine: wan-2.2-ti2v-5b
- Resolution: 704x1280
- RunPod rate snapshot: 1.10 USD/hour
- Approximate EUR rate snapshot: 0.97 EUR/hour
- Example compute estimates: 5 min ≈ 0.08 EUR; 10 min ≈ 0.16 EUR; 20 min ≈ 0.32 EUR
- Buffered maximum estimate for the current 20-minute generation timeout: 0.41 EUR

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
