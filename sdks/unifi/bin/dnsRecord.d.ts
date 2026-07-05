import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class DnsRecord extends pulumi.CustomResource {
    /**
     * Get an existing DnsRecord resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: DnsRecordState, opts?: pulumi.CustomResourceOptions): DnsRecord;
    /**
     * Returns true if the given object is an instance of DnsRecord.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is DnsRecord;
    /**
     * Whether the DNS record is enabled.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * The key of the DNS record.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The port of the DNS record.
     */
    readonly port: pulumi.Output<number | undefined>;
    /**
     * The priority of the DNS record.
     */
    readonly priority: pulumi.Output<number | undefined>;
    /**
     * The type of the DNS record. One of `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `SRV`, `PTR` or `NS`.
     */
    readonly recordType: pulumi.Output<string>;
    /**
     * The name of the site to associate the DNS record with.
     */
    readonly site: pulumi.Output<string>;
    readonly timeouts: pulumi.Output<outputs.DnsRecordTimeouts | undefined>;
    /**
     * The TTL of the DNS record, as a Go duration string (e.g. `1h`, `300s`). The controller stores this value as whole seconds in the range 0–65535s (≈18h12m15s).
     */
    readonly ttl: pulumi.Output<string | undefined>;
    /**
     * The value of the DNS record.
     */
    readonly value: pulumi.Output<string>;
    /**
     * The weight of the DNS record.
     */
    readonly weight: pulumi.Output<number | undefined>;
    /**
     * Create a DnsRecord resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: DnsRecordArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering DnsRecord resources.
 */
export interface DnsRecordState {
    /**
     * Whether the DNS record is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The key of the DNS record.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The port of the DNS record.
     */
    port?: pulumi.Input<number | undefined>;
    /**
     * The priority of the DNS record.
     */
    priority?: pulumi.Input<number | undefined>;
    /**
     * The type of the DNS record. One of `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `SRV`, `PTR` or `NS`.
     */
    recordType?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the DNS record with.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.DnsRecordTimeouts | undefined>;
    /**
     * The TTL of the DNS record, as a Go duration string (e.g. `1h`, `300s`). The controller stores this value as whole seconds in the range 0–65535s (≈18h12m15s).
     */
    ttl?: pulumi.Input<string | undefined>;
    /**
     * The value of the DNS record.
     */
    value?: pulumi.Input<string | undefined>;
    /**
     * The weight of the DNS record.
     */
    weight?: pulumi.Input<number | undefined>;
}
/**
 * The set of arguments for constructing a DnsRecord resource.
 */
export interface DnsRecordArgs {
    /**
     * Whether the DNS record is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The key of the DNS record.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The port of the DNS record.
     */
    port?: pulumi.Input<number | undefined>;
    /**
     * The priority of the DNS record.
     */
    priority?: pulumi.Input<number | undefined>;
    /**
     * The type of the DNS record. One of `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `SRV`, `PTR` or `NS`.
     */
    recordType: pulumi.Input<string>;
    /**
     * The name of the site to associate the DNS record with.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.DnsRecordTimeouts | undefined>;
    /**
     * The TTL of the DNS record, as a Go duration string (e.g. `1h`, `300s`). The controller stores this value as whole seconds in the range 0–65535s (≈18h12m15s).
     */
    ttl?: pulumi.Input<string | undefined>;
    /**
     * The value of the DNS record.
     */
    value: pulumi.Input<string>;
    /**
     * The weight of the DNS record.
     */
    weight?: pulumi.Input<number | undefined>;
}
//# sourceMappingURL=dnsRecord.d.ts.map