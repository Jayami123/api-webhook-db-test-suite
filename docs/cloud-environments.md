# Cloud environments

This page covers the cloud session setup for Cursor and Claude Code. The repository automates the steps it can.
The owner pastes the rest into each product's environment settings. Secret values are never committed.
Back to the [technical guide](technical-guide.md).

## What is automatic from the repo

### Cursor cloud

Automatic from the repository (`.cursor/environment.json`):

- `install` runs `bash scripts/cloud-install.sh`. It installs `poppler-utils` when `pdfsig` or `pdftotext` is missing,
  runs `npm ci` when `package-lock.json` exists, then runs `scripts/bootstrap.sh` for the products
  (default `medusa twenty documenso cal`).
- `start` runs `sudo service docker start`, `scripts/ensure-receiver-hostname.sh` and `npm run qa:passwords`.

### Claude Code cloud

Automatic from the repository (the `SessionStart` hook in `.claude/settings.json`, cloud sessions only, running
`.claude/hooks/session-start.sh`):

- Puts `/usr/local/bin` (Node 22) first on `PATH`, and exports `NODE24` when `/opt/node24` exists (Documenso).
- Runs `npm run qa:passwords` and `scripts/ensure-receiver-hostname.sh`, and starts `dockerd` when it is installed.
- Does not run `npm ci` or `bootstrap.sh`.

`.claude/settings.json` disables co-author trailers and sets empty commit and PR attribution.

## Pasted by hand: Cursor cloud

The owner sets these in the Cursor environment settings (not committed):

- `PRODUCTS_ROOT=/home/user/products`. `scripts/bootstrap.sh` reads it.
- Any product secret that a lane plan requires. The names are in [`.env.example`](../.env.example) and the lane plans.

## Pasted by hand: Claude Code cloud environment

The owner sets these in the Claude cloud environment:

- Setup script: `bash scripts/cloud-install.sh`, the same entry point as Cursor.
- `PRODUCTS_ROOT=/home/user/products`.
- The same product secrets as Cursor.
