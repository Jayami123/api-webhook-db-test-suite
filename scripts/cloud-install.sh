#!/usr/bin/env bash
# One install entry point for cloud environments (Cursor `install`, Claude setup script).
# Safe on a bare repo: skips npm ci until package-lock.json exists.
# Products to prepare: P2_BOOTSTRAP_PRODUCTS (default: all four; space-separated).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/local/bin:$PATH"
if [ -f package-lock.json ]; then
  npm ci
else
  echo "[cloud-install] no package-lock.json yet; skipping npm ci"
fi
# shellcheck disable=SC2086
bash scripts/bootstrap.sh ${P2_BOOTSTRAP_PRODUCTS:-medusa twenty documenso cal}
