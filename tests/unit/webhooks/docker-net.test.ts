import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { networkGateway, parseGateway } from "../../../src/webhooks/docker-net.ts";

describe("docker network gateway", () => {
  test("parseGateway accepts an IPv4 address with surrounding whitespace", () => {
    assert.equal(parseGateway("172.17.0.1\n"), "172.17.0.1");
  });

  test("parseGateway rejects empty, IPv6, wildcard and text output", () => {
    for (const bad of ["", "\n", "::1", "0.0.0.0", "<no value>", "172.17.0"]) {
      assert.throws(() => parseGateway(bad), /not an IPv4 address/, bad);
    }
  });

  test("networkGateway asks docker for the first IPAM gateway of the named network", async () => {
    const calls: string[][] = [];
    const gateway = await networkGateway("qa-harness-twenty_default", (args) => {
      calls.push([...args]);
      return Promise.resolve("172.18.0.1\n");
    });
    assert.equal(gateway, "172.18.0.1");
    assert.deepEqual(calls, [
      [
        "network",
        "inspect",
        "qa-harness-twenty_default",
        "--format",
        "{{(index .IPAM.Config 0).Gateway}}",
      ],
    ]);
  });

  test("networkGateway rejects a network name that could be an option or contain spaces", async () => {
    for (const bad of ["", "--help", "a b", "x;y", "a".repeat(65)]) {
      await assert.rejects(
        () => networkGateway(bad, () => Promise.resolve("172.17.0.1")),
        /invalid docker network name/,
        bad,
      );
    }
  });

  test("networkGateway surfaces a docker failure without leaking arguments", async () => {
    await assert.rejects(
      () =>
        networkGateway("bridge", () => Promise.reject(new Error("docker network failed (exit 1)"))),
      /docker network failed/,
    );
  });
});
