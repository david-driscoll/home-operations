/**
 * Who holds the NetBird DNS lease, as Pulumi config says (#3001).
 *
 * `netbird.<root domain>` has two writers. The Equestria watchdog repoints it
 * at the standby when the primary dies (kubernetes/apps/netbird-system/
 * failover-watchdog), and a human moves it back through the
 * `netbird-edge:primary` config switch (docs/runbooks/netbird-failback.md).
 * Pulumi must never undo the watchdog on an unrelated run.
 *
 * So the `cloudflare.DnsRecord` ignores its content after create, and this
 * resource writes the content only when the configured holder's address
 * changes: a PATCH on create and on update, and nothing on a run where config
 * did not move. It never reads the live record back into its diff, which is
 * what keeps a watchdog flip standing until a human acknowledges it.
 *
 * Deleting it leaves the record alone: the DnsRecord owns its lifetime.
 */
import * as pulumi from "@pulumi/pulumi";

export interface DnsLeaseAssignmentArgs {
  zoneId: pulumi.Input<string>;
  recordId: pulumi.Input<string>;
  /** The holder's public IPv4. */
  content: pulumi.Input<string>;
  /** The `netbird-edge:primary` value, for the diff and the state. */
  holder: pulumi.Input<string>;
  /** A token with DNS edit on the zone. */
  apiToken: pulumi.Input<string>;
}

export interface LeaseState {
  zoneId: string;
  recordId: string;
  content: string;
  holder: string;
}

interface ProviderInputs extends LeaseState {
  apiToken: string;
}

/**
 * Whether a run writes the record: only when the assignment itself moved.
 * A new API token, or a live record the watchdog changed, is not a change.
 */
export function leaseChanged(olds: LeaseState, news: LeaseState): boolean {
  return olds.content !== news.content || olds.holder !== news.holder || olds.recordId !== news.recordId || olds.zoneId !== news.zoneId;
}

/** Cloudflare's v4 envelope. Errors never quote the request: it carried the token. */
export function parseCloudflareResult(status: number, body: unknown): { content: string } {
  const envelope = body as { success?: boolean; errors?: { code?: number; message?: string }[]; result?: { content?: string } } | null;
  if (status < 200 || status >= 300 || !envelope?.success || !envelope.result?.content) {
    const errors = (envelope?.errors ?? []).map(e => `${e.code ?? "?"} ${e.message ?? ""}`.trim()).join("; ");
    throw new Error(`Cloudflare PATCH dns_records: HTTP ${status}${errors ? `: ${errors}` : ""}`);
  }
  return { content: envelope.result.content };
}

async function patchContent(inputs: ProviderInputs): Promise<void> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(inputs.zoneId)}/dns_records/${encodeURIComponent(inputs.recordId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${inputs.apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: inputs.content }),
  });
  const written = parseCloudflareResult(response.status, await response.json().catch(() => null));
  if (written.content !== inputs.content) throw new Error(`Cloudflare kept ${written.content} instead of ${inputs.content}`);
}

const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ProviderInputs) {
    await patchContent(inputs);
    return { id: inputs.recordId, outs: inputs };
  },
  async diff(_id: string, olds: ProviderInputs, news: ProviderInputs) {
    return { changes: leaseChanged(olds, news), replaces: [], deleteBeforeReplace: false };
  },
  async update(_id: string, olds: ProviderInputs, news: ProviderInputs) {
    // Only a token rotation reaches here without a lease change: keep the
    // new token in state, write nothing.
    if (leaseChanged(olds, news)) await patchContent(news);
    return { outs: news };
  },
  async delete() {
    // The record belongs to its cloudflare.DnsRecord.
  },
};

export class DnsLeaseAssignment extends pulumi.dynamic.Resource {
  public declare readonly content: pulumi.Output<string>;
  public declare readonly holder: pulumi.Output<string>;

  constructor(name: string, args: DnsLeaseAssignmentArgs, opts?: pulumi.CustomResourceOptions) {
    super(provider, name, args, { additionalSecretOutputs: ["apiToken"], ...opts });
  }
}
