import { runScopedName } from "../../run/prefix.ts";

/** Customer email that the leak rule (`med-leak-customer-email`, prefix LIKE) can find. */
export function buyerEmail(label: string): string {
  return `${runScopedName(label)}@example.test`;
}

/** Product or region title that the product leak rule can find. */
export function runTitle(label: string): string {
  return runScopedName(label);
}
