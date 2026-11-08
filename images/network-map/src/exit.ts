/**
 * The collector's exit status. 1 only when nothing could be read: every
 * source failed. A failed or partial source is normal (it keeps its last-good
 * nodes, and CollectorSource records it), and a Neo4j write failure throws
 * before this is reached, so main() exits 1 for it too. See main.ts's header.
 * The Homelable sync applies the same rule to its designs (./homelable-sync.ts).
 */
export function exitCode(outcomes: readonly { status: string }[]): 0 | 1 {
  return outcomes.length > 0 && outcomes.every(o => o.status === "failed") ? 1 : 0;
}
