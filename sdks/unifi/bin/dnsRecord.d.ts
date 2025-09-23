import * as pulumi from "@pulumi/pulumi";
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
     * Whether the DNS record is active. Defaults to true. Set to false to temporarily disable resolution without removing the record.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * DNS record name.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The port number for SRV records. Valid values are between 1 and 65535. Only used with SRV records.
     */
    readonly port: pulumi.Output<number>;
    /**
     * Priority value for MX and SRV records. Lower values indicate higher priority. Required for MX and SRV records, ignored for other types.
     */
    readonly priority: pulumi.Output<number>;
    /**
     * The content of the DNS record. The expected value depends on the record type:
     *   * For A records: IPv4 address (e.g., '192.168.1.10')
     *   * For AAAA records: IPv6 address
     *   * For CNAME records: Canonical name (e.g., 'server1.example.com')
     *   * For MX records: Mail server hostname
     *   * For TXT records: Text content (e.g., 'v=spf1 include:_spf.example.com ~all')
     */
    readonly record: pulumi.Output<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Time To Live (TTL) in seconds, determines how long DNS resolvers should cache this record. Set to 0 for automatic TTL. Common values: 300 (5 minutes), 3600 (1 hour), 86400 (1 day).
     */
    readonly ttl: pulumi.Output<number>;
    /**
     * The type of DNS record. Valid values are:
     *   * `A` - Maps a hostname to IPv4 address
     *   * `AAAA` - Maps a hostname to IPv6 address
     *   * `CNAME` - Creates an alias for another domain name
     *   * `MX` - Specifies mail servers for the domain
     *   * `NS` - Delegates a subdomain to a set of name servers
     *   * `PTR` - Creates a pointer to a canonical name (reverse DNS)
     *   * `SOA` - Specifies authoritative information about the domain
     *   * `SRV` - Specifies location of services (hostname and port)
     *   * `TXT` - Holds descriptive text
     */
    readonly type: pulumi.Output<string>;
    /**
     * A relative weight for SRV records with the same priority. Higher values get proportionally more traffic. Only used with SRV records.
     */
    readonly weight: pulumi.Output<number>;
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
     * Whether the DNS record is active. Defaults to true. Set to false to temporarily disable resolution without removing the record.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * DNS record name.
     */
    name?: pulumi.Input<string>;
    /**
     * The port number for SRV records. Valid values are between 1 and 65535. Only used with SRV records.
     */
    port?: pulumi.Input<number>;
    /**
     * Priority value for MX and SRV records. Lower values indicate higher priority. Required for MX and SRV records, ignored for other types.
     */
    priority?: pulumi.Input<number>;
    /**
     * The content of the DNS record. The expected value depends on the record type:
     *   * For A records: IPv4 address (e.g., '192.168.1.10')
     *   * For AAAA records: IPv6 address
     *   * For CNAME records: Canonical name (e.g., 'server1.example.com')
     *   * For MX records: Mail server hostname
     *   * For TXT records: Text content (e.g., 'v=spf1 include:_spf.example.com ~all')
     */
    record?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Time To Live (TTL) in seconds, determines how long DNS resolvers should cache this record. Set to 0 for automatic TTL. Common values: 300 (5 minutes), 3600 (1 hour), 86400 (1 day).
     */
    ttl?: pulumi.Input<number>;
    /**
     * The type of DNS record. Valid values are:
     *   * `A` - Maps a hostname to IPv4 address
     *   * `AAAA` - Maps a hostname to IPv6 address
     *   * `CNAME` - Creates an alias for another domain name
     *   * `MX` - Specifies mail servers for the domain
     *   * `NS` - Delegates a subdomain to a set of name servers
     *   * `PTR` - Creates a pointer to a canonical name (reverse DNS)
     *   * `SOA` - Specifies authoritative information about the domain
     *   * `SRV` - Specifies location of services (hostname and port)
     *   * `TXT` - Holds descriptive text
     */
    type?: pulumi.Input<string>;
    /**
     * A relative weight for SRV records with the same priority. Higher values get proportionally more traffic. Only used with SRV records.
     */
    weight?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a DnsRecord resource.
 */
export interface DnsRecordArgs {
    /**
     * Whether the DNS record is active. Defaults to true. Set to false to temporarily disable resolution without removing the record.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * DNS record name.
     */
    name?: pulumi.Input<string>;
    /**
     * The port number for SRV records. Valid values are between 1 and 65535. Only used with SRV records.
     */
    port?: pulumi.Input<number>;
    /**
     * Priority value for MX and SRV records. Lower values indicate higher priority. Required for MX and SRV records, ignored for other types.
     */
    priority?: pulumi.Input<number>;
    /**
     * The content of the DNS record. The expected value depends on the record type:
     *   * For A records: IPv4 address (e.g., '192.168.1.10')
     *   * For AAAA records: IPv6 address
     *   * For CNAME records: Canonical name (e.g., 'server1.example.com')
     *   * For MX records: Mail server hostname
     *   * For TXT records: Text content (e.g., 'v=spf1 include:_spf.example.com ~all')
     */
    record: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Time To Live (TTL) in seconds, determines how long DNS resolvers should cache this record. Set to 0 for automatic TTL. Common values: 300 (5 minutes), 3600 (1 hour), 86400 (1 day).
     */
    ttl?: pulumi.Input<number>;
    /**
     * The type of DNS record. Valid values are:
     *   * `A` - Maps a hostname to IPv4 address
     *   * `AAAA` - Maps a hostname to IPv6 address
     *   * `CNAME` - Creates an alias for another domain name
     *   * `MX` - Specifies mail servers for the domain
     *   * `NS` - Delegates a subdomain to a set of name servers
     *   * `PTR` - Creates a pointer to a canonical name (reverse DNS)
     *   * `SOA` - Specifies authoritative information about the domain
     *   * `SRV` - Specifies location of services (hostname and port)
     *   * `TXT` - Holds descriptive text
     */
    type: pulumi.Input<string>;
    /**
     * A relative weight for SRV records with the same priority. Higher values get proportionally more traffic. Only used with SRV records.
     */
    weight?: pulumi.Input<number>;
}
