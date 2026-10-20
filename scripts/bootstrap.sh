#!/usr/bin/env bash
# Clone the product forks qa-portfolio-harness needs into PRODUCTS_ROOT and install their deps.
# Usage: bash scripts/bootstrap.sh [medusa|cal|documenso|twenty ...]   (default: medusa)
# Idempotent: an existing checkout is never reset, pulled or overwritten. Never prints secrets.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Same refs as P1 CI (playwright-e2e-ci-framework .github/workflows/e2e.yml), except Cal:
# P1 pins `main`; P2 pins the same SHA as P6 Task 3 (fork main head, probe 2026-10-20).
MEDUSA_REF="f677db438f27294fc50e4c7c6612e71ff38eeff5"
DOCUMENSO_REF="f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c"
TWENTY_REF="7cbdfec6f346b43715bc2056932f4fad5886f733"
CAL_REF="c2b7ac44c66f24ffef1662b276f0653988a609a3"
MEDUSA_PNPM="10.11.1"
ALL_PRODUCTS=(cal documenso medusa twenty)

log() { printf '[bootstrap] %s\n' "$*"; }

# Folder names the harness resolves under PRODUCTS_ROOT (harness v0.2.11 src/config.ts).
product_dir() {
  case "$1" in
    cal) echo cal ;;
    documenso) echo documenso ;;
    medusa) echo medusa-dtc-starter ;;
    twenty) echo twenty-CRM ;;
    *) return 1 ;;
  esac
}
product_repo() {
  case "$1" in
    cal) echo https://github.com/Jayami123/cal.git ;;
    documenso) echo https://github.com/Jayami123/documenso.git ;;
    medusa) echo https://github.com/Jayami123/medusa-dtc-starter.git ;;
    twenty) echo https://github.com/Jayami123/twenty-CRM.git ;;
  esac
}
product_ref() {
  case "$1" in
    cal) echo "$CAL_REF" ;;
    documenso) echo "$DOCUMENSO_REF" ;;
    medusa) echo "$MEDUSA_REF" ;;
    twenty) echo "$TWENTY_REF" ;;
  esac
}

# PRODUCTS_ROOT: environment, then .env, then ../products next to this repo.
resolve_products_root() {
  local root="${PRODUCTS_ROOT:-}"
  if [ -z "$root" ] && [ -f "$REPO_ROOT/.env" ]; then
    root="$(sed -n 's/^PRODUCTS_ROOT=//p' "$REPO_ROOT/.env" | tail -n 1 | tr -d '\r"'"'")"
  fi
  if [ -n "$root" ]; then
    case "$root" in
      /* | [A-Za-z]:*) ;;
      *) root="$REPO_ROOT/$root" ;;
    esac
    mkdir -p "$root"
    (cd "$root" && pwd)
    return
  fi
  root="$(cd "$REPO_ROOT/.." && pwd)/products"
  if mkdir -p "$root" 2>/dev/null && [ -w "$root" ]; then
    (cd "$root" && pwd)
    return
  fi
  # Parent not writable (e.g. a cloud VM with the repo at /workspace): use $HOME and record it.
  root="$HOME/products"
  mkdir -p "$root"
  printf 'PRODUCTS_ROOT=%s\n' "$root" >> "$REPO_ROOT/.env"
  log "$(dirname "$REPO_ROOT") is not writable; using $root and wrote PRODUCTS_ROOT to .env" >&2
  printf '%s\n' "$root"
}

clone_pinned() {
  local url="$1" ref="$2" dest="$3"
  if [ -d "$dest/.git" ] && git -C "$dest" rev-parse --verify -q HEAD >/dev/null; then
    local head
    head="$(git -C "$dest" rev-parse HEAD)"
    if [[ "$ref" =~ ^[0-9a-f]{40}$ ]] && [ "$head" != "$ref" ]; then
      log "WARN $dest is at $head, pinned ref is $ref. Left as is."
    else
      log "$dest already cloned ($head). Left as is."
    fi
    return
  fi
  if [ -d "$dest/.git" ]; then
    # A .git with no commit means an earlier fetch failed; finish that clone instead of skipping it.
    log "WARN $dest has a .git but no commit (interrupted clone). Fetching $ref again."
  else
    if [ -d "$dest" ] && [ -n "$(ls -A "$dest")" ]; then
      log "ERROR $dest exists, is not empty and is not a git checkout. Move it away and rerun."
      exit 1
    fi
    log "cloning $url at $ref into $dest (depth 1)"
    mkdir -p "$dest"
    git -C "$dest" init -q
  fi
  git -C "$dest" remote get-url origin >/dev/null 2>&1 || git -C "$dest" remote add origin "$url"
  git -C "$dest" fetch -q --depth 1 origin "$ref"
  git -C "$dest" -c advice.detachedHead=false checkout -q FETCH_HEAD
  log "cloned $(git -C "$dest" rev-parse HEAD)"
}

skip_install() { [ "${BOOTSTRAP_SKIP_INSTALL:-0}" = "1" ]; }

install_medusa_deps() {
  local dest="$1"
  if skip_install; then log "BOOTSTRAP_SKIP_INSTALL=1; skipping Medusa pnpm install."; return; fi
  local pnpm_cmd=(corepack "pnpm@$MEDUSA_PNPM")
  log "pnpm $(COREPACK_ENABLE_STRICT=0 "${pnpm_cmd[@]}" --version)"
  log "pnpm install --frozen-lockfile in $dest"
  (cd "$dest" && COREPACK_ENABLE_STRICT=0 "${pnpm_cmd[@]}" install --frozen-lockfile)
}

# Documenso needs Node 24 + npm >= 11.17 (fork engines). Same as P1 CI: npm ci under Node 24.
install_documenso_deps() {
  local dest="$1"
  if skip_install; then log "BOOTSTRAP_SKIP_INSTALL=1; skipping Documenso npm ci."; return; fi
  if [ -d "$dest/node_modules" ]; then log "$dest/node_modules exists. Left as is."; return; fi
  local node24="${NODE24:-/opt/node24/bin/node}"
  if [ ! -x "$node24" ]; then
    log "ERROR Node 24 not found at $node24 (set NODE24). Documenso needs Node >= 24."
    exit 1
  fi
  log "npm ci in $dest (Node $("$node24" --version))"
  (cd "$dest" && PATH="$(dirname "$node24"):$PATH" npm ci)
}

# Corepack fetches the fork's packageManager Yarn (4.12.0) from repo.yarnpkg.com.
install_cal_deps() {
  local dest="$1"
  if skip_install; then log "BOOTSTRAP_SKIP_INSTALL=1; skipping Cal yarn install."; return; fi
  log "yarn install --immutable in $dest"
  (cd "$dest" && TURBO_TELEMETRY_DISABLED=1 COREPACK_ENABLE_STRICT=0 corepack yarn install --immutable)
}

# Same steps as P1 CI "Prepare Cal product .env". Never prints the generated values.
prepare_cal_env() {
  local dest="$1"
  if [ -f "$dest/.env" ]; then log "$dest/.env exists. Left as is."; return; fi
  cp "$dest/.env.example" "$dest/.env"
  sed -i 's|http://localhost:3000|http://127.0.0.1:3000|g' "$dest/.env"
  grep -v '^NEXTAUTH_SECRET=' "$dest/.env" | grep -v '^CALENDSO_ENCRYPTION_KEY=' > "$dest/.env.tmp"
  mv "$dest/.env.tmp" "$dest/.env"
  printf 'NEXTAUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> "$dest/.env"
  printf 'CALENDSO_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 24)" >> "$dest/.env"
  log "wrote $dest/.env (generated secrets not shown)"
}

main() {
  local products=("$@")
  [ "${#products[@]}" -gt 0 ] || products=(medusa)
  local p
  for p in "${products[@]}"; do
    product_dir "$p" >/dev/null || {
      log "ERROR unknown product '$p' (expected: ${ALL_PRODUCTS[*]})"
      exit 1
    }
  done

  local root
  root="$(resolve_products_root)"
  log "PRODUCTS_ROOT=$root"

  for p in "${products[@]}"; do
    local dest
    dest="$root/$(product_dir "$p")"
    clone_pinned "$(product_repo "$p")" "$(product_ref "$p")" "$dest"
    case "$p" in
      medusa) install_medusa_deps "$dest" ;;
      documenso) install_documenso_deps "$dest" ;;
      cal) install_cal_deps "$dest"; prepare_cal_env "$dest" ;;
      twenty) log "twenty: runs from Docker images (twentycrm/twenty:v2.44.0); no install." ;;
    esac
  done

  # The harness resolves every product folder on load, so the others must at least exist.
  for p in "${ALL_PRODUCTS[@]}"; do
    mkdir -p "$root/$(product_dir "$p")"
  done
  log "done"
}

main "$@"
