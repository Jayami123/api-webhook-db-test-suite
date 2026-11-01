import type { ProductId } from "../env.ts";
import {
  composeServiceContainer,
  dockerRunner,
  resolveInContainer,
  type DockerRunner,
} from "./docker-net.ts";

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
  | { readonly kind: "container-gateway" }
  | { readonly kind: "none" };

export const DOCUMENSO_RECEIVER_HOSTNAME = "p2-receiver.test";
export const TWENTY_COMPOSE_PROJECT = "qa-harness-twenty";
export const TWENTY_SERVER_SERVICE = "server";
/** The name the product calls; the receiver binds the address this name resolves to inside the server container. */
export const TWENTY_RECEIVER_NAME = "host.docker.internal";

export const PRODUCT_REACH: Readonly<Record<ProductId, ReceiverReach>> = {
  cal: { kind: "host-loopback", urlHost: "127.0.0.1" },
  documenso: { kind: "host-loopback", urlHost: DOCUMENSO_RECEIVER_HOSTNAME },
  medusa: { kind: "none" },
  twenty: { kind: "container-gateway" },
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
      // D2 (deviation from the plan, probe 2026-11-01): the name resolves inside the server container to
      // the docker0 bridge address, not to the compose gateway. The receiver binds exactly what the
      // server container's resolver returns for the name, so the URL and the bind address agree.
      const run = deps.docker ?? dockerRunner;
      const container = await composeServiceContainer(
        TWENTY_COMPOSE_PROJECT,
        TWENTY_SERVER_SERVICE,
        run,
      );
      if (container === "") {
        throw new ReachError(
          `no running ${TWENTY_COMPOSE_PROJECT} ${TWENTY_SERVER_SERVICE} container: is the ${product} stack up?`,
        );
      }
      const addresses = await resolveInContainer(container, TWENTY_RECEIVER_NAME, run);
      const address = addresses[0];
      if (address === undefined) {
        throw new ReachError(
          `${TWENTY_RECEIVER_NAME} does not resolve inside the ${product} server container`,
        );
      }
      return { bindHosts: ["127.0.0.1", address], urlHost: TWENTY_RECEIVER_NAME };
    }
  }
}
