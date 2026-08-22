#!/usr/bin/env bash
set -euo pipefail

# The repository historically stored releases as ZIP files. Materialize the
# newest verified package currently committed to Git so agents/Cloudflare can
# work with a normal source tree. This step itself never calls a GPU or API.

PACKAGE=""
for candidate in \
  zaynab-studio-v4-github.zip \
  zaynab-studio-v3.1-github.zip \
  zaynab-studio-v3-github.zip \
  zaynab-studio-v2-github.zip \
  zaynab-studio-cloudflare.zip; do
  if [[ -f "$candidate" ]]; then
    PACKAGE="$candidate"
    break
  fi
done

if [[ -z "$PACKAGE" ]]; then
  echo "No legacy Zaynab Studio package found." >&2
  exit 1
fi

echo "Materializing from: $PACKAGE"
rm -rf app .materialized
mkdir -p app .materialized
unzip -q "$PACKAGE" -d .materialized

# Packages may contain zaynab-studio/ or files directly at archive root.
if [[ -d .materialized/zaynab-studio ]]; then
  cp -a .materialized/zaynab-studio/. app/
else
  cp -a .materialized/. app/
fi
rm -rf .materialized

# Never materialize secrets or local dependency folders.
rm -rf app/node_modules app/.wrangler
find app -type f \( -name '.env' -o -name '.env.*' -o -name '.dev.vars' \) -delete

cat > app/SOURCE_STATUS.md <<EOF
# Source status

This directory is materialized from \`$PACKAGE\` so Zaynab Studio can move away from ZIP-only development.

The repository branch is now the working source of truth for subsequent agent changes.

Financial safety remains unchanged: no RunPod secret is present here and no GPU generation is triggered by this materialization step.
EOF

cat > app/.gitignore <<'EOF'
.DS_Store
.env
.env.*
.dev.vars
node_modules/
.wrangler/
EOF

echo "Materialized files:"
find app -maxdepth 3 -type f -print | sort
