import { readFileSync } from "node:fs";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

/** Derived from observed bodies (contract file marks x-derived), not from upstream docs. */
export const WEBHOOK_SCHEMA_PATH = "tests/fixtures/cal/webhook-payload.schema.json";

type AddFormats = (ajv: Ajv2020) => Ajv2020;
const addFormats =
  (addFormatsModule as unknown as { default?: AddFormats }).default ??
  (addFormatsModule as unknown as AddFormats);

let compiled: ValidateFunction | undefined;

/** Errors (empty when valid) for one Cal outgoing body. Compiled once per worker. */
export function bookingWebhookErrors(body: unknown): string[] {
  if (compiled === undefined) {
    const schema = JSON.parse(readFileSync(WEBHOOK_SCHEMA_PATH, "utf8")) as object;
    const ajv = addFormats(new Ajv2020({ allErrors: true, strict: false }));
    compiled = ajv.compile(schema);
  }
  const valid = compiled(body);
  return valid
    ? []
    : (compiled.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`);
}
