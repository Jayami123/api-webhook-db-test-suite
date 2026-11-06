# P2-MED-CON-PRODUCT: Medusa store responses (public draft, not filed)

**Status:** draft; not filed. Filing is owner-only. See the [upstream index](README.md).

**Source:** new text from the closeout plan, section 6.1 (approved in review). Evidence: [deviation register](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/src/lanes/med/deviation-register.json), [product contract test](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/tests/contracts/med/product-contract.spec.ts), [pinned Store OpenAPI](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/contracts/med/upstream/store.openapi.full.yaml), [provenance](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/contracts/med/upstream/PROVENANCE.md).

---

Title: Store API responses omit properties required by the published OpenAPI schema

Observed: On fork `f677db4` using qa-portfolio-harness 0.3.1, successful Store API responses do not validate against the
pinned upstream Store OpenAPI document from tag `v2.21.2`. For example, `GET /store/products` omits `deleted_at`,
`external_id` and `status` at `/products/N`, although the corresponding schema requires them. The recorded operation and
path signatures are in `src/lanes/med/deviation-register.json`, class PRODUCT.

Reproduction: Use a seeded store with the publishable-key access and product setup described by this repository's Medusa
lane. Request `GET /store/products?limit=2` and validate the HTTP 200 JSON against
`contracts/med/upstream/store.openapi.full.yaml`. `tests/contracts/med/product-contract.spec.ts` records the broader cart,
payment, completion and list flow and asserts successful setup before it checks deviations.

Expected: The published schema and the default successful response should agree. Either the response returns the required
properties, or the response schema is adjusted to match the intended API.

Scope: This reports an observed schema and response mismatch. It does not establish which serializer or schema
declaration is the root cause. Nullability and content-type entries in the SPEC class are separate and are not included.

Evidence: `src/lanes/med/deviation-register.json`, `tests/contracts/med/product-contract.spec.ts`,
`contracts/med/upstream/store.openapi.full.yaml`, `contracts/med/upstream/PROVENANCE.md` (tag `v2.21.2`).
Draft only; not filed upstream.

Distinction preserved: the draft reports an observed contract mismatch. It claims no proven serializer root cause.
