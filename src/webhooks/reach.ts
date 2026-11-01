import type { ProductId } from "../env.ts";
import { networkGateway, type DockerRunner } from "./docker-net.ts";

/**
 * How each product's process reaches the receiver (plan Task 5, probes P1/P3 on harness v0.2.18):
 *  - cal and documenso run as HOST processes, so loopback works. Documenso additionally refuses a
 *    literal private or loopback host when a webhook is CREATED (webhook-router/schema.ts), so it
 *    gets a hostname that resolves to 127.0.0.1 and is listed in
 *    NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS (read once at process start).
 *  - twenty: with HR-2 (`extra_hosts: host.docker.internal:host-gateway`) the name resolves in its containers to the
 *    compose gateway: the receiver binds that gateway and the URL uses the name. Before HR-2 (probe 2.1) the URL had to
 *    use the gateway IP literal.
 *  - medusa has no outgoing webhook; its Stripe route is inbound only.
 */
export type ReceiverReach =
  | { readonly kind: "host-loopback"; readonly urlHost: string }
  | { readonly kind: "container-gateway"; readonly network: string }
  | { readonly kind: "none" };

export const DOCUMENSO_RECEIVER_HOSTNAME = "p2-receiver.test";
export const TWENTY_COMPOSE_NETWORK = "qa-harness-twenty_default";

export const PRODUCT_REACH: Readonly<Record<ProductId, ReceiverReach>> = {
  cal: { kind: "host-loopback", urlHost: "127.0.0.1" },
  documenso: { kind: "host-loopback", urlHost: DOCUMENSO_RECEIVER_HOSTNAME },
  medusa: { kind: "none" },
  twenty: { kind: "container-gateway", network: TWENTY_COMPOSE_NETWORK },
};

export interface ReachDeps {
  readonly docker?: DockerRunner;
  /** Resolves a hostname to its first IPv4 address (dns.lookup in production). */
  readonly lookup: (hostname: string) => Promise<string>;
}

export interface ReceiverTarget {
  /** Addresses the receiver must bind for this product to reach it. */
  readonly bindHosts: readonly string[];
  /** Host part of the URL the product is told to call. */
  readonly urlHost: string;
}

export class ReachError extends Error {
  override readonly name = "ReachError";
  constructor(message: string) {
    super(`ENV: ${message}`);
  }
}

export async function resolveReceiverTarget(
  product: ProductId,
  deps: ReachDeps,
): Promise<ReceiverTarget> {
  const reach = PRODUCT_REACH[product];
  switch (reach.kind) {
    case "none":
      throw new ReachError(`${product} has no outgoing webhook, so no receiver URL`);
    case "host-loopback": {
      if (reach.urlHost !== "127.0.0.1") {
        const address = await deps.lookup(reach.urlHost).catch(() => "unresolved");
        if (address !== "127.0.0.1") {
          throw new ReachError(
            `${reach.urlHost} must resolve to 127.0.0.1 (found ${address}); add the line "127.0.0.1 ${reach.urlHost}" to the hosts file`,
          );
        }
      }
      return { bindHosts: ["127.0.0.1"], urlHost: reach.urlHost };
    }
    case "container-gateway": {
      const gateway = await networkGateway(reach.network, deps.docker).catch(() => {
        throw new ReachError(
          `docker network ${reach.network} not found: is the ${product} stack up?`,
        );
      });
      return { bindHosts: ["127.0.0.1", gateway], urlHost: "host.docker.internal" };
    }
  }
}
