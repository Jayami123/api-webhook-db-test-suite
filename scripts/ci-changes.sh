#!/usr/bin/env bash
# Decides which P2 lane jobs ci.yml runs (docs/plans/2026-11-05-p2-ci-gate.md, section 4.3).
# Stdin: changed paths, one per line (empty unless the event is a pull request).
# Env: EVENT_NAME (github.event_name). Output: p2_cal, p2_doc, p2_med, p2_tw as true or false,
# written to $GITHUB_OUTPUT, or to stdout when GITHUB_OUTPUT is unset (unit tests use that).
# Fail-safe: a path no rule matches runs every lane. An empty list on a pull request runs every lane.
set -euo pipefail

re_cal='^(src/lanes/cal/|tests/unit/lanes/cal/|tests/contracts/cal/|tests/integration/cal/|tests/webhooks/cal/|tests/serial/cal/|tests/fixtures/cal/|contracts/cal/|src/invariants/lanes/cal\.ts$|\.github/workflows/p2-cal\.yml$)'
re_med='^(src/lanes/med/|tests/unit/lanes/med/|tests/contracts/med/|tests/integration/med/|tests/webhooks/med/|tests/serial/med/|contracts/med/|src/invariants/lanes/medusa\.ts$|src/slo/medusa\.ts$|\.github/workflows/p2-med\.yml$)'
re_doc='^(src/lanes/doc/|tests/unit/lanes/doc/|tests/contracts/doc/|tests/integration/doc/|tests/webhooks/doc/|tests/serial/doc/|tests/billing/doc/|tests/fixtures/doc/|contracts/doc/|src/invariants/lanes/documenso\.ts$|src/slo/documenso\.ts$|\.github/workflows/p2-doc\.yml$)'
re_tw='^(src/lanes/tw/|tests/unit/lanes/tw/|tests/contracts/tw/|tests/integration/tw/|tests/webhooks/tw/|tests/serial/tw/|src/clients/twenty\.ts$|\.github/workflows/p2-tw\.yml$|\.github/workflows/tw-study\.yml$)'
re_neutral='^(docs/|README\.md$)'

cal=false; med=false; doc=false; tw=false; all=false
case "${EVENT_NAME:-}" in
  workflow_dispatch)
    all=true
    ;;
  pull_request)
    count=0
    # "|| [ -n ... ]" keeps a last line that has no trailing newline.
    while IFS= read -r path || [ -n "$path" ]; do
      [ -z "$path" ] && continue
      count=$((count + 1))
      if [[ $path =~ $re_cal ]]; then cal=true
      elif [[ $path =~ $re_med ]]; then med=true
      elif [[ $path =~ $re_doc ]]; then doc=true
      elif [[ $path =~ $re_tw ]]; then tw=true
      elif [[ $path =~ $re_neutral ]]; then :
      else all=true
      fi
    done
    if [ "$count" -eq 0 ]; then all=true; fi
    ;;
  *)
    # push and any other event: no lanes. api and env-check still run in ci.yml.
    ;;
esac

if [ "$all" = true ]; then cal=true; med=true; doc=true; tw=true; fi
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'p2_cal=%s\np2_doc=%s\np2_med=%s\np2_tw=%s\n' "$cal" "$doc" "$med" "$tw" >> "$GITHUB_OUTPUT"
else
  printf 'p2_cal=%s\np2_doc=%s\np2_med=%s\np2_tw=%s\n' "$cal" "$doc" "$med" "$tw"
fi
