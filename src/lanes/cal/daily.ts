import { signDaily, type SignedRequest } from "../../webhooks/sign.ts";

/** The test-request body Cal answers before any signature check (route.ts:57). */
export const DAILY_TEST_BODY = '{"test":"test"}';

/** A body signed as Cal verifies it (JSON.stringify of the parsed body) unless `mode` is "raw". */
export function signedDailyRequest(input: {
  secretBase64: string;
  body: string;
  timestamp: string;
  mode?: "raw" | "reserialised";
}): SignedRequest {
  return signDaily({
    secretBase64: input.secretBase64,
    body: input.body,
    timestamp: input.timestamp,
    mode: input.mode ?? "reserialised",
  });
}
