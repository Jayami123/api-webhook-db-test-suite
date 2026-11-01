/**
 * Known vectors, recomputed independently of Node's crypto with Python 3 `hmac` (plan Task 2,
 * probe P4). Secrets here are throwaway test strings. Each vector names the product line whose
 * construction it encodes.
 */
export const SECRET = "p2-vector-secret";

// sendPayload.ts:296-299 (HMAC-SHA256 hex over the body string, no timestamp).
// The two spellings of "é" are built from char codes so no editor or tool can normalise one into
// the other: E_ACUTE is the single character U+00E9, ESCAPE_E_ACUTE is the six characters \ u 0 0 e 9.
const E_ACUTE = String.fromCharCode(0xe9);
const ESCAPE_E_ACUTE = String.fromCharCode(0x5c) + "u00e9";
const calBody = (title: string): string =>
  `{"triggerEvent":"BOOKING_CREATED","payload":{"title":"p${title}"}}`;
export const CAL_BODY_UTF8 = calBody(E_ACUTE);
export const CAL_SIG_UTF8 = "b3403fa7484a56062b61553c4fa28fd869bffe58df47720e2086b4874cbb28d5";
export const CAL_BODY_ESCAPED = calBody(ESCAPE_E_ACUTE);
export const CAL_SIG_ESCAPED = "ccfc180210c06d0cd626e92498924f4fe6b5227364d676c76fbb989215900fa9";

// call-webhook.job.ts generateSignature: HMAC-SHA256 hex over `${timestamp}:${body}`
export const TW_TS_MS = 1793519354730;
export const TW_BODY = '{"eventName":"person.created","webhookId":"w1"}';
export const TW_SIG = "d07fa726a2a40b1ba8ce839566da9216739b25533f9d131e227f8a6adc980832";
export const TW_NONCE = "07b9da07b9da07b9da07b9da07b9da07";

// recorded-daily-video/route.ts:40-45: base64-decoded key, `${ts}.${compact JSON}`, base64 digest
export const DAILY_SECRET_B64 = "ZGFpbHktdmVjdG9yLWtleS1ieXRlcw==";
export const DAILY_TS = "1793519354";
export const DAILY_BODY_COMPACT =
  '{"type":"recording.ready-to-download","payload":{"room_name":"r1"}}';
export const DAILY_BODY_SPACED =
  '{ "type": "recording.ready-to-download",  "payload": {"room_name": "r1"} }';
export const DAILY_SIG_COMPACT = "7qUiQ0ToaUCs0YYrmFqxbcT0rCb0Sq3tPjBWb6rkDBE=";
export const DAILY_SIG_OVER_SPACED_RAW = "HxN1uK3/96nAxsGzbC/+UwMMBxLGAbhpoc+vvP0DJQA=";
export const DAILY_SIG_NULL_TS = "+qZNNGtNV1/mzeRMaVr1or37qQfrRK9rURGvkad8WDU=";
