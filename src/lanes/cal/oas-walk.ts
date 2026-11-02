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
