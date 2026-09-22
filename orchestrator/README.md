# Zaynab Studio orchestrator

This directory defines a bounded multi-agent workflow.

## Rules
- Agents work on isolated `agent/*` branches and open PRs to `main`.
- Independent tasks may run in parallel; overlapping write scopes must not.
- CI is the gate. A failing validation blocks integration.
- Maximum automatic repair attempts: 2.
- The orchestrator never enables paid GPU work. `ALLOW_REAL_GPU` stays false unless a human explicitly approves a real render.
- A new wave is eligible only when dependencies from the previous wave are merged and validation is green.

## Agent roles
- `agent-pwa`: iPhone/iPad PWA and reference assets.
- `agent-cloudflare`: Workers, D1, R2, migrations and deployment.
- `agent-api`: job API and persistence behavior.
- `agent-qa`: release checks and regression tests.
- `agent-integrator`: reviews compatibility and prepares integration; it does not bypass failed checks.

GitHub issues labelled `agent-task` are the work queue. The workflow creates the bounded wave from `plan.json`; agents or an external agent runner can claim those issues. Completion/merge events cause the orchestrator to reevaluate the next wave.
