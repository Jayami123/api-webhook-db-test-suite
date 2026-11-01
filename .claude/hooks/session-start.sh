#!/bin/bash
# Cloud sessions only: put Node 22.23 (/usr/local/bin) first on PATH, expose Node 24 for
# Documenso as $NODE24, and start Docker. Exports must go through $CLAUDE_ENV_FILE to persist.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"/usr/local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  if [ -x /opt/node24/bin/node ]; then
    echo 'export NODE24=/opt/node24/bin/node' >> "$CLAUDE_ENV_FILE"
  fi
fi
# Idempotent password setup (scripts/qa-passwords.sh, through npm run qa:passwords).
if ! passwords_out=$(cd "${CLAUDE_PROJECT_DIR:-.}" && npm run -s qa:passwords 2>&1); then
  echo "WARNING: npm run qa:passwords failed; the product stacks cannot start until it passes:"
  echo "$passwords_out"
fi
# Documenso webhooks reach the receiver through a hostname that resolves to 127.0.0.1 (plan Task 5).
if ! hosts_out=$(bash "${CLAUDE_PROJECT_DIR:-.}/scripts/ensure-receiver-hostname.sh" 2>&1); then
  echo "WARNING: scripts/ensure-receiver-hostname.sh failed; Documenso webhook tests cannot reach the receiver:"
  echo "$hosts_out"
fi
if command -v dockerd >/dev/null && ! docker info >/dev/null 2>&1; then
  (sudo dockerd 2>&1 | tee /tmp/dockerd.log >/dev/null &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
# The hook can't block the session, so tell Claude plainly when Docker is unusable.
if ! docker info >/dev/null 2>&1; then
  echo "WARNING: Docker is not available (dockerd missing or failed to start; see /tmp/dockerd.log). Product stacks will not start."
fi
exit 0
