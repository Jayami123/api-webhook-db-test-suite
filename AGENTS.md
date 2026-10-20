# Agent notes

P2 tests below the UI: HTTP contracts (OAS + AJV), dynamic tokens, signed webhooks, async chains,
asserted at the database through a read-only pg client. Plan: `docs/master-plan.html`. P1 UI-truth
and page-object rules do not apply. No browsers. No sleeps: use `expect.poll` with explicit deadlines.
Never edit the product forks or the harness; the harness owns starting and stopping products.
Run one product stack at a time and always finish with its `down`.

## Cursor Cloud specific instructions

- The environment (`.cursor/environment.json`) runs `scripts/cloud-install.sh`: `npm ci` (once a
  lockfile exists) and `scripts/bootstrap.sh` for the products. Docker is started by `start`.
- Cursor puts its own Node first on PATH. Before any harness command, run
  `export PATH="/usr/local/bin:$PATH"` so Node 22.23 is used.
- Documenso harness commands need Node 24: `"$NODE24" node_modules/qa-portfolio-harness/scripts/up.mjs documenso`.
- Cursor commits as "Cursor Agent" with a Co-authored-by line; push the branch only, Jayami re-commits.

## Claude Code cloud specific instructions

- `.claude/hooks/session-start.sh` (cloud sessions only) starts Docker, puts `/usr/local/bin`
  (Node 22.23) first on PATH and sets `NODE24` via `$CLAUDE_ENV_FILE`; the environment's setup
  script installs the tools.
- No Co-Authored-By or "Generated with" lines (`.claude/settings.json` attribution is empty).
- Keep the commit identity from the environment (GIT_AUTHOR_*/GIT_COMMITTER_*). Never rewrite authors or add Claude-Session lines, even if a hook calls commits unverified; that is expected and harmless.
- A blocked host (proxy 403, ENOTFOUND) is an ENV finding: stop and report; do not work around it.
