# p2-backend-webhook-db

## Develop

Node 22 (`.nvmrc`); in cloud sessions run `export PATH="/usr/local/bin:$PATH"` first.

    npm ci
    npm run check      # format, lint, typecheck, unit tests (no product, no browser)
    npm run unit       # unit tests only (node:test)
    npm run list:api   # Playwright API projects: cal-api, doc-api, med-api, tw-api

API tests never start products; qa-portfolio-harness does. No browsers are installed or used.
