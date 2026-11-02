# Cal v2 OpenAPI: source of the committed copy

- Product fork: Cal (`calcom`), pinned commit `c2b7ac44c66f24ffef1662b276f0653988a609a3` (the harness `cal` pin used by `scripts/bootstrap.sh`).
- Path in the fork: `docs/api-reference/v2/openapi.json`.
- Upstream sha256 (the fork file, as copied): `cac5ec02a46bfcb9a2cdab8263e778a0dc61cc6b2cd4ffddc04639ddf8987e65`
- Stored copy: `contracts/cal/openapi-v2.json`, formatted by the repo's Prettier (`npm run format:check` covers every JSON file). The formatter only reflows arrays onto several lines (57 lines differ, checked with `diff`).
- Stored sha256: `3c2849d89d8f352d719ef073bf9e0c39ce981aa1a6c9e5066b3a744b68bfc41a`
- Stored bytes: 560358
- Equality: `assert.deepStrictEqual(JSON.parse(stored), JSON.parse(upstream))` passed on 2026-11-02, so the content is the upstream document.

The product serves no runtime OpenAPI document in production mode (`apps/api/v2/src/main.ts`), so the committed file is the
contract. A unit test (`tests/unit/lanes/cal/contract-source.test.ts`) recomputes the stored sha256 and fails on any drift.
