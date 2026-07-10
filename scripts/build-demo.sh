#!/usr/bin/env bash
# Build the static demo bundle into docs/ for CDN hosting (raw.githack).
# The API route cannot be statically exported, so it is set aside during
# the build; the browser falls back to mock mode on hosts with no API.
#
# Usage: scripts/build-demo.sh [asset-prefix-url]

set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH=$(git rev-parse --abbrev-ref HEAD)
PREFIX="${1:-https://raw.githack.com/goldytalks/derby-dashboard/refs/heads/${BRANCH}/docs}"
GUIDES_DIR=$(mktemp -d)

if [[ -d docs ]]; then
  find docs -maxdepth 1 -type f -name '*.md' -exec cp {} "$GUIDES_DIR" \;
fi

mv app/api .demo-api-hold
trap 'mv .demo-api-hold app/api; rm -rf "$GUIDES_DIR"' EXIT

NEXT_STATIC_DEMO=1 NEXT_PUBLIC_STATIC_DEMO=1 NEXT_DEMO_ASSET_PREFIX="$PREFIX" npx next build

rm -rf docs
cp -R out docs
find "$GUIDES_DIR" -maxdepth 1 -type f -name '*.md' -exec cp {} docs \;
touch docs/.nojekyll
echo "Static demo written to docs/ with asset prefix $PREFIX"
