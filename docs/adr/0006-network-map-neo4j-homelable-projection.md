---
status: accepted
---

# The network map lives in Neo4j; Homelable is a read-only projection of it

We want one network map (GLOSSARY.md) of the UniFi site LANs, the tailnet and NetBird, with the machines and apps on them, that answers four questions: where a thing is, the path from A to B, what a user group can reach, and where the estate has drifted from what main declares. Homelable already draws homelab topologies, but it stores device facts and canvas layout in SQLite, keys devices by IP or MAC, and has no way to ask a question across networks. We decided that Neo4j (Community, dedicated to the map, in the `database` namespace) holds the whole model, and that Homelable only displays it. A sync owns four Homelable designs (UniFi, Tailscale, NetBird, Apps), replaces each one in full every hour with a layout it computes itself, and discards any hand edits. Hand-made diagrams go in other designs, which the sync never touches. Paths, reach and drift are answered from Neo4j: through saved Cypher queries, and through a read-only Neo4j MCP in the `toolport-networking` profile.

The model has two layers that are loaded on different clocks. The declared layer is loaded by a Forgejo workflow on each push to main that touches its sources. That workflow has the repo checked out, so it can import the TypeScript data modules (the NetBird policy and sites, the app definitions, the compose files, and a small mapping of UniFi zones to networks). The observed layer is written by an hourly CronJob from the UniFi, Tailscale, NetBird, Kubernetes, Proxmox and Docker APIs. So drift means git against reality, not one control plane's settings against another's.

## Considered options

- **Homelable as the source of truth, edited by hand or by its own UniFi and Proxmox importers.** It needs no new database, but it cannot model reach or paths, its importers cover only two of the six sources, and every browser tab saves a whole canvas. Rejected.
- **NeoDash, or a custom viewer over Neo4j.** NeoDash would mean less glue code and a custom viewer would look better, but either one is a new UI to host and keep running, while Homelable is already deployed and admins-only. Rejected in favour of projecting the graph into Homelable.
- **Collecting the declared layer in the hourly job, from Flux's source artifact.** That is one job instead of two, but the job could not import the TypeScript modules where most of the declared state lives. Rejected.
- **Treating the control planes' live settings as "declared".** This needs no repo parsing, but a policy edited by hand in a console would then never count as drift. Rejected.
- **A database-scoped read-only Neo4j user for the MCP.** That needs Enterprise. We accept a soft limit instead: the MCP offers only the read tool and opens only READ transactions. Any stray write is overwritten by the next hourly rebuild.

## Consequences

- Everything in Neo4j can be rebuilt (by rerunning the declared workflow and waiting one collector cycle), so it has no backup. First- and last-seen times come from the source APIs wherever they report them.
- Neo4j and Homelable are excluded from the nightly downscaler. Otherwise the map would go stale every night and the collector would fail during the window.
- Homelable's `X-MCP-Service-Key` is stripped at its frontend. The sync reaches the backend through its own Service, which a CiliumNetworkPolicy opens only to the collector.
