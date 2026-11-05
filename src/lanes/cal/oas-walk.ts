export interface GetOperation {
  readonly method: "get";
  readonly path: string;
  readonly params: readonly string[];
}

/** Every GET operation of an OpenAPI 3.0 document (plain object, not dereferenced). Pure. */
export function listGetOperations(doc: {
  paths?: Record<string, Record<string, unknown>>;
}): GetOperation[] {
  const out: GetOperation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!("get" in item)) continue;
    const params = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? "");
    out.push({ method: "get", path, params });
  }
  return out;
}

/** Substitutes `{name}` with a value; throws when a parameter has no value (the crawler lists it as UNCRAWLED). */
export function fillPath(path: string, values: Readonly<Record<string, string>>): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const v = values[name];
    if (v === undefined)
      throw new Error(`TEST BUG: no value for path parameter ${name} in ${path}`);
    return encodeURIComponent(v);
  });
}

/** The header that selects the API version on every Cal v2 route. */
export const API_VERSION_HEADER = "cal-api-version";

interface OasParameter {
  readonly name?: unknown;
  readonly in?: unknown;
  readonly schema?: { readonly default?: unknown };
}

/**
 * The `cal-api-version` a GET operation declares: the default of its header parameter's schema. An operation-level
 * parameter overrides a path-level one of the same name (OpenAPI 3.0). Returns undefined when the operation has no such
 * header or the header has no schema default; the crawl then sends no version header for it. Pure.
 */
export function apiVersionFor(
  doc: { paths?: Record<string, Record<string, unknown>> },
  path: string,
): string | undefined {
  const item = doc.paths?.[path];
  if (item === undefined || !("get" in item)) return undefined;
  const pathLevel = (item["parameters"] as OasParameter[] | undefined) ?? [];
  const opLevel = (item["get"] as { parameters?: OasParameter[] } | undefined)?.parameters ?? [];
  const byName = new Map<string, OasParameter>();
  for (const p of [...pathLevel, ...opLevel]) {
    if (typeof p.name === "string" && p.in === "header") {
      byName.set(p.name.toLowerCase(), p);
    }
  }
  const declared = byName.get(API_VERSION_HEADER);
  const dflt = declared?.schema?.default;
  return typeof dflt === "string" ? dflt : undefined;
}
