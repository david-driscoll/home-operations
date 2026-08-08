/**
 * The KV v2 client moved to `components/bao.ts` when Phase 8a gave it a
 * second consumer (the Pulumi `BaoKvSecret` dynamic resource). This module
 * stays as a re-export so the migration script keeps its original import
 * shape; it gets deleted with the rest of op-to-bao after Phase 11.
 */
export { BaoClient, type KvReadResult } from "@components/bao.ts";
