#!/usr/bin/env bash
# Documenso refuses a literal private or loopback webhook URL when the webhook is CREATED, so the
# receiver is reached through a hostname that resolves to 127.0.0.1 (plan Task 5). This adds that name
# to the hosts file once. Idempotent. Needs root or passwordless sudo (Claude Code cloud: root;
# Cursor cloud and GitHub runners: sudo). Usage: bash scripts/ensure-receiver-hostname.sh [hostname]
set -euo pipefail
HOSTNAME_TO_ADD="${1:-p2-receiver.test}"
case "$HOSTNAME_TO_ADD" in
  *[!a-z0-9.-]* | "" ) echo "[hosts] invalid hostname" >&2; exit 2 ;;
esac
HOSTS_FILE="${P2_HOSTS_FILE:-/etc/hosts}"
if grep -Eq "^127\.0\.0\.1[[:space:]]+.*\b${HOSTNAME_TO_ADD//./\\.}\b" "$HOSTS_FILE"; then
  echo "[hosts] $HOSTNAME_TO_ADD already maps to 127.0.0.1"
  exit 0
fi
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
printf '127.0.0.1 %s\n' "$HOSTNAME_TO_ADD" | $SUDO tee -a "$HOSTS_FILE" >/dev/null
echo "[hosts] added $HOSTNAME_TO_ADD -> 127.0.0.1"
