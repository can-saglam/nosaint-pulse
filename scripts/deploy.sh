#!/usr/bin/env bash
# Build Pulse and publish dist/ to the gh-pages branch (GitHub Pages).
# Usage: npm run deploy
set -euo pipefail

REPO_URL="$(git config --get remote.origin.url)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Building…"
( cd "$ROOT" && npm run build )

echo "▶ Publishing dist/ to gh-pages…"
cd "$ROOT/dist"
rm -rf .git
git init -q
git checkout -q -b gh-pages
touch .nojekyll
git add -A
git -c user.email="cansaglam@gmail.com" -c user.name="can-saglam" \
    commit -q -m "Deploy Pulse $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q -f "$REPO_URL" gh-pages
rm -rf .git

echo "✓ Deployed. Live at the repo's GitHub Pages URL (Settings → Pages)."
