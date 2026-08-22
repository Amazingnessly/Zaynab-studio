# Zaynab Studio — Agent instructions

## Mission
Develop and maintain Zaynab Studio, a personal iPhone/iPad-first application for creating short videos featuring the recurring character Zaynab from reference images.

Priorities, in order: visual quality; character consistency; simple iPhone/iPad UX; free/open-source solutions; low vendor lock-in; paid compute only when technically necessary. There is currently no commercial objective.

## Target architecture
- GitHub is the source of truth.
- Cloudflare hosts the application and lightweight backend/storage where appropriate.
- RunPod provides GPU compute only on demand.
- Wan 2.2 TI2V is the current target video engine.
- Keep the video engine replaceable; never couple the product to Runway.

## Financial safety
- Default to a 0-cost simulation mode.
- Never launch paid GPU compute automatically.
- Require explicit confirmation before any real GPU generation.
- No automatic paid retries after failure.
- Never trigger GPU work on page load.
- Keep draft mode cheaper than quality mode.

## Secrets
Never expose or commit RunPod keys, Cloudflare tokens, GitHub secrets, storage credentials, or other infrastructure secrets. Secrets belong only in server-side/platform secret stores.

## Zaynab consistency
Use the term **Fiche de référence de Zaynab**. Do not use the expression “bible Zaynab”. Preserve face, hijab/hair, proportions, clothing, colors, graphic style, expressions and distinctive characteristics. Video prompts should emphasize continuity without unnecessary repetition.

## UX
Primary devices are iPhone and iPad. Keep the interface touch-first, elegant, readable, responsive and compatible with Safari/iOS/iPadOS. Preserve PWA installability where possible. Do not expose JSON, raw API details, job IDs or complex GPU controls in the normal UX.

## PWA cache discipline
For every release: increment the cache version; remove obsolete caches; do not indefinitely cache index.html; activate new service workers correctly; show the current app version in the UI.

## Git workflow
Inspect existing code before changing it. Preserve working behavior. Prefer incremental changes over rewrites. Verify before committing. Use focused commits such as `feat: add persistent video jobs` or `fix: refresh PWA cache on new release`.

## Backend/GPU workflow
Desired flow: Zaynab Studio → backend → queued GPU task → Wan generation → persistent result storage → app status/result retrieval. Jobs must survive the app closing. A temporary file inside a GPU container is not sufficient storage.

## Generation modes
- **Brouillon**: validate motion/framing at minimum cost.
- **Qualité**: final rendering after parameters have been validated.

A project may contain several independently generated shots that are later assembled. Do not assume an entire episode should be generated in one video call.

## Immediate priorities
1. Make the repository itself the real source tree, not a collection of ZIP releases.
2. Stabilize the current backend simulation.
3. Add persistent video/job storage.
4. Finalize the Wan worker.
5. Connect RunPod without exposing secrets.
6. Perform one short real generation only after showing GPU, duration, resolution and estimated cost and obtaining explicit confirmation.

## Required verification before release
Verify app startup, visible version, service worker/cache behavior, required assets, relevant API routes, zero-cost simulation, absence of committed/frontend secrets, and iPhone/iPad compatibility as far as the environment allows. If something cannot be verified, state that explicitly rather than assuming success.
