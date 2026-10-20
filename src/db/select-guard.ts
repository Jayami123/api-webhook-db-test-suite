/**
 * Client-side layer of the read-only oracle (plan D5; the server-side layers are in pg.ts).
 * Accepts one SELECT or WITH … SELECT statement. Rejects everything that can write, lock, change
 * session state or hide text from this check. Errs on the side of rejecting.
 */
export class ReadOnlyGuardError extends Error {
  override readonly name = "ReadOnlyGuardError";
  readonly reason: GuardReason;
  constructor(reason: GuardReason, detail: string) {
    super(`TEST BUG: read-only guard rejected SQL (${reason}): ${detail}`);
    this.reason = reason;
  }
}

export type GuardReason =
  | "empty"
  | "comment"
  | "dollar-quote"
  | "escape-string"
  | "unbalanced-quote"
  | "multi-statement"
  | "not-select"
  | "forbidden-keyword"
  | "row-lock"
  | "forbidden-function";

// Whole words, checked after string literals and quoted identifiers are masked.
const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "merge",
  "upsert",
  "truncate",
  "drop",
  "alter",
  "create",
  "grant",
  "revoke",
  "copy",
  "call",
  "do",
  "execute",
  "prepare",
  "deallocate",
  "lock",
  "vacuum",
  "analyze",
  "analyse",
  "explain",
  "cluster",
  "reindex",
  "refresh",
  "comment",
  "security",
  "set",
  "reset",
  "discard",
  "begin",
  "start",
  "commit",
  "rollback",
  "abort",
  "savepoint",
  "release",
  "listen",
  "unlisten",
  "notify",
  "load",
  "import",
  "into",
] as const;
const FORBIDDEN_KEYWORD_RE = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join("|")})\\b`, "i");
const ROW_LOCK_RE = /\bfor\s+(no\s+key\s+update|key\s+share|update|share)\b/i;
// Functions that have side effects even inside a READ ONLY transaction (probed on Postgres 15.19).
const FORBIDDEN_FUNCTION_RE =
  /\b(set_config|lo_\w+|pg_notify|pg_(try_)?advisory\w*|pg_cancel_backend|pg_terminate_backend|pg_reload_conf|pg_rotate_logfile|pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_reset\w*|dblink\w*|query_to_xml\w*|txid_current|pg_current_xact_id)\s*\(/i;

/**
 * Replace '…' literals and "…" identifiers with empty placeholders so keywords inside them are
 * ignored. With `keepIdentifiers`, "…" identifiers keep their content unquoted (case preserved),
 * so a quoted function name such as "pg_advisory_lock"(1) is still visible to the function check.
 */
function maskQuoted(sql: string, keepIdentifiers = false): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql.charAt(i);
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      for (;;) {
        if (j >= sql.length)
          throw new ReadOnlyGuardError("unbalanced-quote", "a quote is never closed");
        if (sql.charAt(j) === quote) {
          if (sql.charAt(j + 1) === quote) {
            j += 2; // doubled quote inside the literal
            continue;
          }
          break;
        }
        j += 1;
      }
      if (quote === "'") out += "''";
      else out += keepIdentifiers ? sql.slice(i + 1, j).replaceAll('""', '"') : '""';
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function assertSelectOnly(sql: string): void {
  if (sql.trim() === "") throw new ReadOnlyGuardError("empty", "no SQL");
  // Checked on the raw text: these can hide a second statement or a keyword from the masker.
  if (/--|\/\*/.test(sql)) throw new ReadOnlyGuardError("comment", "comments are not allowed");
  if (/\$[A-Za-z_]?\w*\$/.test(sql))
    throw new ReadOnlyGuardError("dollar-quote", "dollar quoting is not allowed");
  if (/(^|[^\w])(e'|u&['"])/i.test(sql))
    throw new ReadOnlyGuardError(
      "escape-string",
      "E'' strings and U&'' / U&\"\" escapes are not allowed",
    );

  const masked = maskQuoted(sql).trim().replace(/;\s*$/, "");
  if (masked.includes(";"))
    throw new ReadOnlyGuardError("multi-statement", "only one statement is allowed");
  if (!/^(select|with)\b/i.test(masked))
    throw new ReadOnlyGuardError("not-select", "must start with SELECT or WITH");
  if (ROW_LOCK_RE.test(masked))
    throw new ReadOnlyGuardError("row-lock", "FOR UPDATE/SHARE takes row locks");
  const keyword = FORBIDDEN_KEYWORD_RE.exec(masked);
  if (keyword?.[1]) throw new ReadOnlyGuardError("forbidden-keyword", keyword[1].toUpperCase());
  const fn = FORBIDDEN_FUNCTION_RE.exec(maskQuoted(sql, true));
  if (fn?.[1]) throw new ReadOnlyGuardError("forbidden-function", `${fn[1]}()`);
}
