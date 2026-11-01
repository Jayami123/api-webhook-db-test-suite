# P2 Task 5 probe: where Twenty's server container reaches the host (2026-11-01)

Written after the probe, from the recorded output. Harness `qa-portfolio-harness` v0.3.0 (`be86e0e`), Twenty image
v2.44.0 from the pinned fork ref `7cbdfec`, Docker 29.9.2 on the Claude Code cloud VM. The stack was started with
`node node_modules/qa-portfolio-harness/scripts/up.mjs twenty` (exit 0, 132 s) and ended with `down.mjs twenty`
(exit 0). One stack at a time; no other stack was up.

## Question

Plan Task 5 D2 says `host.docker.internal` "resolves in its containers to the compose gateway, where the receiver
binds". Does it?

## Commands and trimmed output

```text
docker network inspect qa-harness-twenty_default --format '{{(index .IPAM.Config 0).Gateway}}'
  172.18.0.1
docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}'
  172.17.0.1
docker exec <twenty server container> getent hosts host.docker.internal
  172.17.0.1      host.docker.internal host.docker.internal
host listeners (node http, one per address, port 4411), probed from inside the server container:
  http://172.18.0.1:4411/        -> 200 ok-172.18.0.1
  http://172.17.0.1:4411/        -> 200 ok-172.17.0.1
  http://host.docker.internal:4411/ -> 200 ok-172.17.0.1
docker exec <twenty server container> printenv OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS
  host.docker.internal   (HR-2 environment pass-through works)
```

## Facts

| # | Fact | Status |
|---|---|---|
| F1 | `host.docker.internal` resolves inside the Twenty server container to the docker0 bridge address (`172.17.0.1`), not to the compose network gateway (`172.18.0.1`). | CONFIRMED |
| F2 | A host listener bound to the compose gateway `172.18.0.1` is reachable from the server container. | CONFIRMED |
| F3 | A host listener bound to `172.17.0.1` is reachable from the server container, and so is the name. | CONFIRMED |
| F4 | The HR-2 allow-list value reaches the server container from the `up` environment. | CONFIRMED |
| F5 | The resolver returns IPv6 only on hosts with an IPv6 bridge address. This VM has none, so the IPv6 path is not probed live. | UNPROBED here; covered by unit tests in `tests/unit/webhooks/reach.test.ts` |

## Decision (plan deviation D2)

The receiver binds `127.0.0.1` plus the address the server container's resolver returns for
`host.docker.internal` (`src/webhooks/reach.ts`, container-gateway case). The URL host stays `host.docker.internal`.
No address is hard-coded, `0.0.0.0` and `::` are refused, and the first address returned is used. The plan's
compose-gateway bind (D2) is not used, because F1 and F2 show a bind to the compose gateway alone would not be
reached by the name.

## Cleanup

Listeners ran for at most 50 s and exited. The stack was ended with `down.mjs twenty` (exit 0). No container was
left running.
