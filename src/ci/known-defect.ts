import { test } from "@playwright/test";

/**
 * Marks the running test as an expected failure of a known defect. The description is "ID: evidence": the text
 * before the first colon is the defect ID and the rest is the evidence (a probe path and line). It pushes the
 * `issue` annotation the summary reads, then calls Playwright's own test.fail(true, description), so the expected
 * failure behaves exactly as the call it replaces. Call it where the bare test.fail() stood: after the setup and
 * cleanup asserts, right before the assertion that is expected to fail.
 */
export function expectedDefect(description: string): void {
  const parsed = parseDefectDescription(description);
  test.info().annotations.push({ type: "issue", description: `${parsed.id}: ${parsed.evidence}` });
  test.fail(true, description);
}

/** Pure, unit-tested. Throws unless the ID rule and the evidence rule hold. */
export function parseDefectDescription(description: string): { id: string; evidence: string } {
  const at = description.indexOf(":");
  const id = at < 0 ? "" : description.slice(0, at).trim();
  const evidence = at < 0 ? "" : description.slice(at + 1).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(id)) {
    throw new Error(
      `defect description must start with an ID (letters, digits, hyphens) then a colon: ${JSON.stringify(description)}`,
    );
  }
  if (evidence === "") throw new Error(`defect ${id} has no evidence after the colon`);
  return { id, evidence };
}
