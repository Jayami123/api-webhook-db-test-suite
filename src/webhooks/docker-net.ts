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
