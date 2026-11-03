import type { ProductId } from "../env.ts";

/**
 * The only columns a test may change, and only to move time (plan Task 3, section 2.2).
 * Each entry names the master-plan cases that need it and the product line that makes the column
 * matter. Adding a column is a code change reviewed with its case id: there is no escape hatch.
 */
export interface FixtureColumn {
  readonly table: string;
  readonly pk: string;
  readonly pkKind: "text" | "int";
  readonly column: string;
  /** Only timestamps are movable. */
  readonly kind: "timestamp";
  readonly cases: readonly string[];
  readonly cite: string;
}

export const FIXTURE_ALLOWLIST: Readonly<Record<ProductId, readonly FixtureColumn[]>> = {
  cal: [
    {
      table: "Task",
      pk: "id",
      pkKind: "text",
      column: "scheduledAt",
      kind: "timestamp",
      cases: ["P2-CAL-TASK-001", "P2-CAL-TASK-002"],
      cite: "packages/prisma/schema.prisma:1830 (Task.scheduledAt); packages/features/tasker/repository.ts:136-141 (retry pushes scheduledAt out by minRetryIntervalMins)",
    },
    {
      table: "WebhookScheduledTriggers",
      pk: "id",
      pkKind: "int",
      column: "startAfter",
      kind: "timestamp",
      cases: ["P2-CAL-SCH-002", "P2-CAL-SCH-003"],
      cite: "packages/prisma/schema.prisma:1318 (startAfter); packages/features/webhooks/lib/handleWebhookScheduledTriggers.ts:16-22 (jobs with startAfter <= now run)",
    },
  ],
  documenso: [
    {
      table: "Recipient",
      pk: "id",
      pkKind: "int",
      column: "expiresAt",
      kind: "timestamp",
      cases: ["P2-DOC-EXP-001", "P2-DOC-EXP-002", "P2-DOC-EXP-003"],
      cite: "packages/prisma/schema.prisma:640 (Recipient.expiresAt); packages/lib/jobs/definitions/internal/expire-recipients-sweep.handler.ts:13",
    },
    {
      table: "Recipient",
      pk: "id",
      pkKind: "int",
      column: "nextReminderAt",
      kind: "timestamp",
      cases: ["P2-DOC-REM-001", "P2-DOC-REM-002"],
      cite: "packages/prisma/schema.prisma:645 (Recipient.nextReminderAt); packages/lib/jobs/definitions/internal/send-signing-reminders-sweep.handler.ts:13",
    },
  ],
  medusa: [],
  twenty: [],
};

/** Products that get a qa_fixture role at all. Medusa and Twenty have no time-travel case. */
export function fixtureProducts(): readonly ProductId[] {
  return (Object.keys(FIXTURE_ALLOWLIST) as ProductId[]).filter(
    (product) => FIXTURE_ALLOWLIST[product].length > 0,
  );
}
