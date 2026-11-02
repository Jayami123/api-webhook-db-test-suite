import { CANARY_MARGIN_MS, POLL_INTERVALS, SLO, TWENTY_WEBHOOK_MEMO_MS } from "../../slo.ts";

/** call-webhook.job.ts:117: the outbound request timeout. */
export const TW_OUTBOUND_TIMEOUT_MS = 5_000;
/** A retry, if the product had one, would land inside this window (one timeout plus 1 s). P-TW-3: none seen in 12 s. */
export const TW_QUIET_WINDOW_MS = TW_OUTBOUND_TIMEOUT_MS + 1_000;
/** Poll budget for a quiet check: the window plus one second of margin. */
export const TW_QUIET_TIMEOUT_MS = TW_QUIET_WINDOW_MS + 1_000;
/** Canary wait: one memo window (workspace-cache.service.ts:56) plus CANARY_MARGIN_MS (src/slo.ts). */
export const TW_VISIBLE_TIMEOUT_MS = TWENTY_WEBHOOK_MEMO_MS + CANARY_MARGIN_MS;
/** Study delivery budget (P2-TW-WH-010): the 5 s outbound timeout plus a 10 s margin. Measured arrivals were within 0.2 s (P-TW-2a/b/c). */
export const TW_STUDY_DELIVERY_MS = TW_OUTBOUND_TIMEOUT_MS + 10_000;
/** CONTROLLED VARIABLE of the study: the idle gap before each `idle12` case (the experiment's independent variable). It is a FIXED WAIT, not a condition: memo expiry is time-based and emits no observable event, so the gap is a set time (memo window 10 s, workspace-cache.service.ts:56, plus 2 s), identical for every idle12 case. */
export const TW_STUDY_IDLE_MS = TWENTY_WEBHOOK_MEMO_MS + 2_000;
/** P2 receiver policy for |timestamp - receipt| (TW-WH-001). The product documents no tolerance. */
export const TW_RECEIPT_TOLERANCE_MS = 5_000;

export { CANARY_MARGIN_MS, POLL_INTERVALS, SLO, TWENTY_WEBHOOK_MEMO_MS };
