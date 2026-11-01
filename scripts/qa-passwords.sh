#!/usr/bin/env bash
# Ensure .env holds P2_QA_RO_PASSWORD and P2_QA_FIXTURE_PASSWORD (plan Task 3). Idempotent: an existing
# value is never replaced, so a provisioned database keeps working. Prints variable NAMES only.
# Works on a laptop, in Cursor cloud and in Claude Code cloud; CI generates its own per job instead.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
for name in P2_QA_RO_PASSWORD P2_QA_FIXTURE_PASSWORD; do
  if grep -Eq "^${name}=.+" "$ENV_FILE"; then
    echo "[qa-passwords] $name already set"
    continue
  fi
  # Drop an empty "NAME=" line, then append a fresh 32-hex value (matches [A-Za-z0-9_-]{16,128}).
  grep -Ev "^${name}=\s*$" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  printf '%s=%s\n' "$name" "$(openssl rand -hex 16)" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "[qa-passwords] $name generated"
done
