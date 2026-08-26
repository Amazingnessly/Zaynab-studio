#!/usr/bin/env bash
set -euo pipefail

# Run once from a GitHub/Codex environment authenticated to Cloudflare.
# No Codespaces dependency.

npm install
npx wrangler whoami

echo "Creating Cloudflare resources if they do not already exist..."
npx wrangler d1 create zaynab-studio || true
npx wrangler r2 bucket create zaynab-studio-videos || true

cat <<'EOF'

NEXT ACTION
1. Copy the D1 database_id printed by Cloudflare into wrangler.jsonc.
2. Run: npm run d1:migrate:remote
3. Add RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID with `npx wrangler secret put ...`.
4. Keep ALLOW_REAL_GPU=false for staging.
5. Run: npm run deploy

The release validator will refuse deployment until all four official Zaynab JPEG references exist.
EOF
