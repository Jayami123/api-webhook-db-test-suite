import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DOCUMENSO_RECEIVER_HOSTNAME,
  PRODUCT_REACH,
  ReachError,
  resolveReceiverTarget,
  TWENTY_COMPOSE_PROJECT,
  TWENTY_SERVER_SERVICE,
} from "../../../src/webhooks/reach.ts";

const lookupTo = (address: string) => (): Promise<string> => Promise.resolve(address);

describe("receiver reach per product", () => {
  test("the table matches the probes: cal and documenso on the host, twenty in a container, medusa inbound only", () => {
    assert.deepEqual(PRODUCT_REACH, {
      cal: { kind: "host-loopback", urlHost: "127.0.0.1" },
      documenso: { kind: "host-loopback", urlHost: DOCUMENSO_RECEIVER_HOSTNAME },
      medusa: { kind: "none" },
      twenty: { kind: "container-gateway" },
    });
    assert.equal(TWENTY_COMPOSE_PROJECT, "qa-harness-twenty");
    assert.equal(TWENTY_SERVER_SERVICE, "server");
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

  /** A fake docker: `ps` answers the container id, `exec ... getent` answers the given lines. */
  function fakeDocker(getent: string, container = "a1b2c3d4e5f6") {
    const calls: string[][] = [];
    const run = (args: readonly string[]): Promise<string> => {
      calls.push([...args]);
      if (args[0] === "ps") return Promise.resolve(`${container}\n`);
      if (args[0] === "exec") return Promise.resolve(getent);
      return Promise.reject(new Error(`unexpected docker ${args.join(" ")}`));
    };
    return { run, calls };
  }

  test("twenty binds loopback and the address the server container resolves, IPv4", async () => {
    const fake = fakeDocker("172.17.0.1      host.docker.internal\n");
    const target = await resolveReceiverTarget("twenty", {
      lookup: lookupTo("127.0.0.1"),
      docker: fake.run,
    });
    assert.deepEqual(target, {
      bindHosts: ["127.0.0.1", "172.17.0.1"],
      urlHost: "host.docker.internal",
    });
    assert.deepEqual(fake.calls[0], [
      "ps",
      "-q",
      "--filter",
      "label=com.docker.compose.project=qa-harness-twenty",
      "--filter",
      "label=com.docker.compose.service=server",
    ]);
    assert.deepEqual(fake.calls[1], [
      "exec",
      "a1b2c3d4e5f6",
      "getent",
      "hosts",
      "host.docker.internal",
    ]);
  });

  test("twenty binds the IPv6 address the server container resolves, and never a wildcard", async () => {
    const fake = fakeDocker("fd00:dead:beef::1  host.docker.internal\n");
    const target = await resolveReceiverTarget("twenty", {
      lookup: lookupTo("127.0.0.1"),
      docker: fake.run,
    });
    assert.deepEqual(target, {
      bindHosts: ["127.0.0.1", "fd00:dead:beef::1"],
      urlHost: "host.docker.internal",
    });
    assert.ok(!target.bindHosts.includes("0.0.0.0") && !target.bindHosts.includes("::"));
  });

  test("twenty uses the first address when the resolver returns both families", async () => {
    const fake = fakeDocker(
      "172.17.0.1      host.docker.internal\nfd00::1           host.docker.internal\n",
    );
    const target = await resolveReceiverTarget("twenty", {
      lookup: lookupTo("127.0.0.1"),
      docker: fake.run,
    });
    assert.deepEqual(target.bindHosts, ["127.0.0.1", "172.17.0.1"]);
  });

  test("twenty without a running server container is an ENV error that names the project", async () => {
    await assert.rejects(
      resolveReceiverTarget("twenty", {
        lookup: lookupTo("127.0.0.1"),
        docker: (args) => Promise.resolve(args[0] === "ps" ? "\n" : ""),
      }),
      (e: unknown) =>
        e instanceof ReachError &&
        e.message.startsWith("ENV:") &&
        e.message.includes("qa-harness-twenty"),
    );
  });

  test("twenty refuses a wildcard or empty answer from the container resolver", async () => {
    for (const bad of ["0.0.0.0 host.docker.internal\n", ":: host.docker.internal\n", ""]) {
      await assert.rejects(
        resolveReceiverTarget("twenty", {
          lookup: lookupTo("127.0.0.1"),
          docker: fakeDocker(bad).run,
        }),
        /TEST BUG|does not resolve/,
        JSON.stringify(bad),
      );
    }
  });

  test("medusa has no outgoing webhook and refuses a receiver URL", async () => {
    await assert.rejects(
      resolveReceiverTarget("medusa", { lookup: lookupTo("127.0.0.1") }),
      /no outgoing webhook/,
    );
  });
});
