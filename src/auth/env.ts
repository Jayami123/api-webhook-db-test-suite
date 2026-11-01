import * as z from "zod";

const blank = (v: unknown): unknown => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = z.preprocess(blank, z.string().trim().min(1).optional());

/**
 * Credentials of the accounts the harness seeds. Defaults are the forks' public dev-seed values
 * (cited per line); Medusa has none because the admin user is created from these variables by the
 * harness seed(), so CI generates them per job.
 */
const schema = z.object({
  MEDUSA_ADMIN_EMAIL: optional,
  MEDUSA_ADMIN_PASSWORD: optional,
  P2_DOC_USER_EMAIL: z.preprocess(blank, z.string().trim().default("example@documenso.com")), // packages/prisma/seed/initial-seed.ts:57
  P2_DOC_USER_PASSWORD: z.preprocess(blank, z.string().trim().default("password")), // packages/prisma/seed/users.ts:28
  P2_CAL_USER_EMAIL: z.preprocess(blank, z.string().trim().default("pro@example.com")), // scripts/seed.ts:678
  P2_CAL_USER_PASSWORD: z.preprocess(blank, z.string().trim().default("pro")), // scripts/seed.ts:680
  TWENTY_EMAIL: z.preprocess(blank, z.string().trim().default("jane.austen@apple.dev")), // harness TWENTY_DEFAULT_ADMIN_EMAIL
  TWENTY_PASSWORD: z.preprocess(blank, z.string().trim().default("tim@apple.dev")), // harness TWENTY_DEV_SEED_PASSWORD
});

export type AuthEnv = z.infer<typeof schema>;

export function loadAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnv {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join("."));
    throw new Error(`TEST BUG: invalid auth environment: ${names.join(", ")}`);
  }
  return parsed.data;
}

export function requireVar(name: string, value: string | undefined): string {
  if (value === undefined)
    throw new Error(`TEST BUG: ${name} is required for this product (not shown)`);
  return value;
}
