import { execFile } from "node:child_process";
import { isIP } from "node:net";

/**
 * Host-side address that containers on a Docker network use to reach this machine: the network's
 * gateway. Containers reach a host listener bound to it (plan Task 2, probe P3). The default
 * bridge is called "bridge"; a compose project network is "<project>_default".
 */
export type DockerRunner = (args: readonly string[]) => Promise<string>;

export const dockerRunner: DockerRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile("docker", [...args], { timeout: 10_000, windowsHide: true }, (error, stdout) => {
      if (error) reject(new Error(`docker ${args[0] ?? ""} failed (exit ${String(error.code)})`));
      else resolve(stdout);
    });
  });

export function parseGateway(output: string): string {
  const value = output.trim();
  if (isIP(value) !== 4 || value === "0.0.0.0") {
    throw new Error(
      `TEST BUG: docker network gateway is not an IPv4 address: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export async function networkGateway(
  network: string,
  run: DockerRunner = dockerRunner,
): Promise<string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(network)) {
    throw new Error(`TEST BUG: invalid docker network name ${JSON.stringify(network)}`);
  }
  const output = await run([
    "network",
    "inspect",
    network,
    "--format",
    "{{(index .IPAM.Config 0).Gateway}}",
  ]);
  return parseGateway(output);
}

/** Container id of a compose service, found by its compose labels. Empty output means no such container. */
export async function composeServiceContainer(
  project: string,
  service: string,
  run: DockerRunner = dockerRunner,
): Promise<string> {
  for (const value of [project, service]) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)) {
      throw new Error(`TEST BUG: invalid compose label ${JSON.stringify(value)}`);
    }
  }
  const output = await run([
    "ps",
    "-q",
    "--filter",
    `label=com.docker.compose.project=${project}`,
    "--filter",
    `label=com.docker.compose.service=${service}`,
  ]);
  return output.trim().split("\n")[0] ?? "";
}

/**
 * Addresses a container's resolver returns for `name` (`getent hosts`), in the order the resolver
 * gives them. The first line's address is the one a client in that container connects to. Wildcard
 * and non-IP output is refused: a receiver is only ever bound to an explicit address.
 */
export function parseGetentAddresses(output: string): string[] {
  const addresses: string[] = [];
  for (const line of output.split("\n")) {
    const first = line.trim().split(/\s+/)[0];
    if (first === undefined || first === "") continue;
    if (isIP(first) === 0 || first === "0.0.0.0" || first === "::") {
      throw new Error(`TEST BUG: getent returned a non-explicit address: ${JSON.stringify(first)}`);
    }
    addresses.push(first);
  }
  return addresses;
}

export async function resolveInContainer(
  container: string,
  name: string,
  run: DockerRunner = dockerRunner,
): Promise<string[]> {
  if (!/^[A-Za-z0-9]{12,64}$/.test(container)) {
    throw new Error("TEST BUG: invalid container id");
  }
  if (!/^[a-z0-9][a-z0-9.-]{0,252}$/.test(name)) {
    throw new Error(`TEST BUG: invalid host name ${JSON.stringify(name)}`);
  }
  return parseGetentAddresses(await run(["exec", container, "getent", "hosts", name]));
}
