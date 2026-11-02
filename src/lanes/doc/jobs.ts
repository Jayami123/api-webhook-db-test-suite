import { createHash } from "node:crypto";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { managedNonce } from "@noble/ciphers/webcrypto";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils";
import { sha256 } from "@noble/hashes/sha2";

/**
 * Mirrors the Documenso fork's job-signing scheme (fork f4105e4). Random nonce per call: compare
 * by round trip, never by bytes.
 * Same as packages/lib/universal/crypto.ts:11-32.
 */
export function forkEncrypt(key: string, data: string): string {
  return bytesToHex(managedNonce(xchacha20poly1305)(sha256(key)).encrypt(utf8ToBytes(data)));
}

export function forkDecrypt(key: string, hex: string): string {
  return new TextDecoder().decode(
    managedNonce(xchacha20poly1305)(sha256(key)).decrypt(hexToBytes(hex)),
  );
}

/** Same as packages/lib/server-only/crypto/sign.ts: sha512 of JSON.stringify(options), wrapped as {data}. */
export function signJobOptions(
  secondaryKey: string,
  options: { name: string; payload: unknown },
): string {
  const hashed = createHash("sha512").update(JSON.stringify(options)).digest("hex");
  return forkEncrypt(secondaryKey, JSON.stringify({ data: hashed }));
}

/**
 * Same as packages/lib/server-only/crypto/verify.ts:4-12. A signature that does not decrypt under this
 * key (wrong key, or a tampered ciphertext) is a failed verification, not an exception.
 */
export function verifyJobOptions(
  secondaryKey: string,
  options: unknown,
  signature: string,
): boolean {
  const hashed = createHash("sha512").update(JSON.stringify(options)).digest("hex");
  let data: string;
  try {
    ({ data } = JSON.parse(forkDecrypt(secondaryKey, signature)) as { data: string });
  } catch {
    return false;
  }
  return data === hashed;
}

export interface ReplayResult {
  readonly status: number;
  readonly text: string;
}

/**
 * Re-dispatch a job exactly as the product does (local.ts:228-230 headers). Redirects are not
 * followed. The response body is cut to 80 characters so no long payload is echoed into a log.
 */
export async function replayDispatch(input: {
  baseUrl: string;
  jobDefinitionId: string;
  jobId: string;
  options: { name: string; payload: unknown };
  signature: string;
}): Promise<ReplayResult> {
  const res = await fetch(`${input.baseUrl}/api/jobs/${input.jobDefinitionId}/${input.jobId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-job-id": input.jobId,
      "x-job-signature": input.signature,
    },
    body: JSON.stringify(input.options),
    redirect: "manual",
  });
  return { status: res.status, text: (await res.text()).slice(0, 80) };
}

/**
 * Secondary key from the fork's .env, read in memory only (never printed, never returned to a log).
 * The caller supplies the loader (process.loadEnvFile in the runner).
 */
export function readSecondaryKey(
  env: NodeJS.ProcessEnv,
  readEnvFile: (path: string) => void,
): string {
  readEnvFile(`${env.DOCUMENSO_PRODUCT_DIR ?? "/home/user/products/documenso"}/.env`);
  const key = process.env.NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY;
  if (!key) throw new Error("ENV: NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY not in the fork .env");
  return key;
}
