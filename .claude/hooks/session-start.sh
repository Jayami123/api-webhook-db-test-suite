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
if command -v dockerd >/dev/null && ! docker info >/dev/null 2>&1; then
  (sudo dockerd 2>&1 | tee /tmp/dockerd.log >/dev/null &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
exit 0
