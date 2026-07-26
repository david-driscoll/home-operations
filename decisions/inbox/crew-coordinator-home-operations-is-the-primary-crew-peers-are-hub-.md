### 2026-07-26T22-28-08: home-operations is the primary crew; peers are hub-and-spoke with inheritance flowing outward
**By:** Crew (Coordinator)
**What:** home-operations is the primary crew; peers are hub-and-spoke with inheritance flowing outward
**References:** home-operations, equestria-cluster, stargate-command-cluster, vault, .crew/manifest.json, .crew/crew-registry.json
**Why:** **Decision.** The estate runs four Crew installs in a hub-and-spoke topology, with `home-operations-crew` as the hub/primary crew managing all four repositories.

**Wiring:**
- The hub registers the three peers via `crew registry add` → `.crew/crew-registry.json`. This is **discovery + delegation only, no inheritance**.
- Each peer registers the hub via `crew upstream add ../home-operations --name home-operations-crew` → the peer's `.crew/upstream.json`. This IS inheritance: spokes pull the hub's skills, decisions, wisdom, and routing at session start.

**Why this direction and not the reverse.** If the hub listed the peers as `upstream`, the hub's coordinator would inherit three thin peers' routing and decisions at every session start — pure context bloat, since the spokes have no accumulated wisdom to contribute. Inverting it also fails to encode the actual governance relationship. Hub knows the spokes exist and can delegate to them; spokes are governed by the hub.

**Roster consequence.** Peer `team.md` files list the hub's cast (Morpheus, Trinity, Tank, Niobe, Dozer, Mouse) with charter paths pointing back into `../home-operations/.crew/agents/`. Peers deliberately do NOT re-cast their own agents — one identity across four repos. This also prevents a peer repo from dropping into Init Mode and fragmenting the estate.

**Cast.** Universe: The Matrix. Chosen because the two universes already in play (Equestria/Celestia/Luna and Stargate Command/Alpha Site) are load-bearing *infrastructure* names — casting from either would make agent names ambiguous with real cluster names. Names avoided for collision or spoiler reasons: Neo (neo4j), Apoc (Neo4j APOC plugin), Switch and Link (networking vocabulary), Cypher (spoiler).