/**
 * The opt-in Gotenberg service of the harness overlay (docker/documenso.gotenberg.compose.yml). These are the only
 * container and endpoint the lane touches; every use goes through these names.
 */
export const GOTENBERG_CONTAINER = "qa-harness-documenso-gotenberg";
export const GOTENBERG_HEALTH_URL = "http://127.0.0.1:3010/health";
