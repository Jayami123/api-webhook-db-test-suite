import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DOCUMENSO_RECEIVER_HOSTNAME,
  PRODUCT_REACH,
  ReachError,
  resolveReceiverTarget,
  TWENTY_COMPOSE_NETWORK,
} from "../../../src/webhooks/reach.ts";

const lookupTo = (address: string) => (): Promise<string> => Promise.resolve(address);

describe("receiver reach per product", () => {
  test("the table matches the probes: cal and documenso on the host, twenty in a container, medusa inbound only", () => {
    assert.deepEqual(PRODUCT_REACH, {
      cal: { kind: "host-loopback", urlHost: "127.0.0.1" },
      documenso: { kind: "host-loopback", urlHost: DOCUMENSO_RECEIVER_HOSTNAME },
      medusa: { kind: "none" },
      twenty: { kind: "container-gateway", network: TWENTY_COMPOSE_NETWORK },
    });
    assert.equal(TWENTY_COMPOSE_NETWORK, "qa-harness-twenty_default");
  });

  test("cal binds and calls loopback without any lookup", async () => {
    const target = await resolveReceiverTarget("cal", {
      lookup: () => Promise.reject(new Error("must not be called")),
    });
    assert.deepEqual(target, { bindHosts: ["127.0.0.1"], urlHost: "127.0.0.1" });
  });

  test("documenso needs a hostname that resolves to 127.0.0.1", async () => {
    const ok = await resolveReceiverTarget("documenso", { lookup: lookupTo("127.0.0.1") });
    assert.deepEqual(ok, { bindHosts: ["127.0.0.1"], urlHost: "p2-receiver.test" });
    await assert.rejects(
      resolveReceiverTarget("documenso", { lookup: lookupTo("93.184.216.34") }),
      (e: unknown) =>
        e instanceof ReachError &&
        /must resolve to 127\.0\.0\.1 \(found 93\.184\.216\.34\).*hosts file/.test(e.message),
    );
    await assert.rejects(
      resolveReceiverTarget("documenso", { lookup: () => Promise.reject(new Error("ENOTFOUND")) }),
      /found unresolved/,
    );
  });

  test("twenty binds loopback plus the compose gateway and is called by host.docker.internal", async () => {
    const asked: string[][] = [];
    const target = await resolveReceiverTarget("twenty", {
      lookup: lookupTo("127.0.0.1"),
      docker: (args) => {
        asked.push([...args]);
        return Promise.resolve("172.18.0.1\n");
      },
    });
    assert.deepEqual(target, {
      bindHosts: ["127.0.0.1", "172.18.0.1"],
      urlHost: "host.docker.internal",
    });
    assert.deepEqual(asked[0]?.slice(0, 3), ["network", "inspect", "qa-harness-twenty_default"]);
  });

  test("twenty without its stack up is an ENV error that names the network", async () => {
    await assert.rejects(
      resolveReceiverTarget("twenty", {
        lookup: lookupTo("127.0.0.1"),
        docker: () => Promise.reject(new Error("docker network failed (exit 1)")),
      }),
      (e: unknown) =>
        e instanceof ReachError &&
        e.message.startsWith("ENV:") &&
        e.message.includes("qa-harness-twenty_default"),
    );
  });

  test("medusa has no outgoing webhook and refuses a receiver URL", async () => {
    await assert.rejects(
      resolveReceiverTarget("medusa", { lookup: lookupTo("127.0.0.1") }),
      /no outgoing webhook/,
    );
  });
});
