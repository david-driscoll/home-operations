# Graph Report - home-operations  (2026-08-27)

## Corpus Check
- 2031 files · ~1,805,366 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 313 nodes · 292 edges · 21 communities (17 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5edb3afb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- What You Must Do When Invoked
- authentik/bin/package.json
- authentik/package.json
- forgejo/package.json
- pbs/bin/package.json
- pbs/package.json
- tailscale/package.json
- technitium/package.json
- terrifi/package.json
- unifi/bin/package.json
- unifi/package.json
- CLAUDE.md
- graphify reference: extra exports and benchmark
- graphify reference: query, path, explain
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- graphify
- extraction-spec.md

## God Nodes (most connected - your core abstractions)
1. `What You Must Do When Invoked` - 12 edges
2. `/graphify` - 10 edges
3. `graphify reference: extra exports and benchmark` - 8 edges
4. `graphify reference: query, path, explain` - 5 edges
5. `pulumi` - 5 edges
6. `pulumi` - 5 edges
7. `pulumi` - 5 edges
8. `pulumi` - 5 edges
9. `pulumi` - 5 edges
10. `pulumi` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (21 total, 4 thin omitted)

### Community 0 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 1 - "authentik/bin/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 2 - "authentik/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 3 - "forgejo/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 4 - "pbs/bin/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 5 - "pbs/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 6 - "tailscale/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 7 - "technitium/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 8 - "terrifi/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 9 - "unifi/bin/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 10 - "unifi/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @pulumi/pulumi, @types/node, typescript, description, @pulumi/pulumi, @types/node, typescript (+15 more)

### Community 11 - "CLAUDE.md"
Cohesion: 0.18
Nodes (9): Agent comment signing (estate rule), Architecture, Conventions, Crew — your AI team, Developer Workflow, graphify, Key Files, Safety (+1 more)

### Community 12 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 13 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 14 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 15 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 16 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

## Knowledge Gaps
- **210 isolated node(s):** `graphify`, `Usage`, `What graphify is for`, `Step 0 - GitHub repos and multi-path merge (only if a URL or several paths)`, `Step 1 - Ensure graphify is installed` (+205 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `graphify`, `Usage`, `What graphify is for` to the rest of the system?**
  _210 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `authentik/bin/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `authentik/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `forgejo/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `pbs/bin/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `pbs/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._