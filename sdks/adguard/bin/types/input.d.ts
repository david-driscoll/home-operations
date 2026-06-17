import * as pulumi from "@pulumi/pulumi";
import * as inputs from "../types/input";
export interface ClientBlockedServicesPauseSchedule {
    /**
     * Paused service blocking interval for `Friday`
     */
    fri?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleFri | undefined>;
    /**
     * Paused service blocking interval for `Monday`
     */
    mon?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleMon | undefined>;
    /**
     * Paused service blocking interval for `Saturday`
     */
    sat?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleSat | undefined>;
    /**
     * Paused service blocking interval for `Sunday`
     */
    sun?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleSun | undefined>;
    /**
     * Paused service blocking interval for `Thursday`
     */
    thu?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleThu | undefined>;
    /**
     * Time zone name according to IANA time zone database. For example `America/New_York`. `Local` represents the system's local time zone.
     */
    timeZone?: pulumi.Input<string | undefined>;
    /**
     * Paused service blocking interval for `Tueday`
     */
    tue?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleTue | undefined>;
    /**
     * Paused service blocking interval for `Wednesday`
     */
    wed?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleWed | undefined>;
}
export interface ClientBlockedServicesPauseScheduleFri {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ClientBlockedServicesPauseScheduleMon {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ClientBlockedServicesPauseScheduleSat {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ClientBlockedServicesPauseScheduleSun {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ClientBlockedServicesPauseScheduleThu {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ClientBlockedServicesPauseScheduleTue {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ClientBlockedServicesPauseScheduleWed {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ClientSafesearch {
    /**
     * Whether Safe Search is enabled. Defaults to `false`
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Services which SafeSearch is enabled.
     */
    services?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface ConfigBlockedServicesPauseSchedule {
    /**
     * Paused service blocking interval for `Friday`
     */
    fri?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleFri | undefined>;
    /**
     * Paused service blocking interval for `Monday`
     */
    mon?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleMon | undefined>;
    /**
     * Paused service blocking interval for `Saturday`
     */
    sat?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleSat | undefined>;
    /**
     * Paused service blocking interval for `Sunday`
     */
    sun?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleSun | undefined>;
    /**
     * Paused service blocking interval for `Thursday`
     */
    thu?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleThu | undefined>;
    /**
     * Time zone name according to IANA time zone database. For example `America/New_York`. `Local` represents the system's local time zone.
     */
    timeZone?: pulumi.Input<string | undefined>;
    /**
     * Paused service blocking interval for `Tueday`
     */
    tue?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleTue | undefined>;
    /**
     * Paused service blocking interval for `Wednesday`
     */
    wed?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleWed | undefined>;
}
export interface ConfigBlockedServicesPauseScheduleFri {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ConfigBlockedServicesPauseScheduleMon {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ConfigBlockedServicesPauseScheduleSat {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ConfigBlockedServicesPauseScheduleSun {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ConfigBlockedServicesPauseScheduleThu {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ConfigBlockedServicesPauseScheduleTue {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ConfigBlockedServicesPauseScheduleWed {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string | undefined>;
}
export interface ConfigDhcp {
    /**
     * Whether the DHCP server is enabled. Defaults to `false`
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The interface to use for the DHCP server
     */
    interface: pulumi.Input<string>;
    ipv4Settings?: pulumi.Input<inputs.ConfigDhcpIpv4Settings | undefined>;
    ipv6Settings?: pulumi.Input<inputs.ConfigDhcpIpv6Settings | undefined>;
    /**
     * Static leases for the DHCP server
     */
    staticLeases?: pulumi.Input<pulumi.Input<inputs.ConfigDhcpStaticLease>[] | undefined>;
}
export interface ConfigDhcpIpv4Settings {
    /**
     * The gateway IP for the DHCP server scope
     */
    gatewayIp: pulumi.Input<string>;
    /**
     * The lease duration for the DHCP server scope, in seconds. Defaults to `0`
     */
    leaseDuration?: pulumi.Input<number | undefined>;
    /**
     * The start range for the DHCP server scope
     */
    rangeEnd: pulumi.Input<string>;
    /**
     * The start range for the DHCP server scope
     */
    rangeStart: pulumi.Input<string>;
    /**
     * The subnet mask for the DHCP server scope
     */
    subnetMask: pulumi.Input<string>;
}
export interface ConfigDhcpIpv6Settings {
    /**
     * The lease duration for the DHCP server scope, in seconds. Defaults to `86400`
     */
    leaseDuration?: pulumi.Input<number | undefined>;
    /**
     * The start range for the DHCP server scope
     */
    rangeStart: pulumi.Input<string>;
}
export interface ConfigDhcpStaticLease {
    /**
     * Hostname associated with the static lease
     */
    hostname: pulumi.Input<string>;
    /**
     * IP address associated with the static lease
     */
    ip: pulumi.Input<string>;
    /**
     * MAC address associated with the static lease
     */
    mac: pulumi.Input<string>;
}
export interface ConfigDns {
    /**
     * The allowlist of clients: IP addresses, CIDRs, or ClientIDs
     */
    allowedClients?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Disallowed domains. Defaults to the ones supplied by the default AdGuard Home configuration
     */
    blockedHosts?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * How many seconds the clients should cache a filtered response. Defaults to `10`
     */
    blockedResponseTtl?: pulumi.Input<number | undefined>;
    /**
     * When `blocking_mode` is set to `custom_ip`, the IPv4 address to be returned for a blocked A request
     */
    blockingIpv4?: pulumi.Input<string | undefined>;
    /**
     * When `blocking_mode` is set to `custom_ip`, the IPv6 address to be returned for a blocked A request
     */
    blockingIpv6?: pulumi.Input<string | undefined>;
    /**
     * DNS response sent when request is blocked. Valid values are `default` (the default), `refused`, `nxdomain`, `null_ip` or `custom_ip`
     */
    blockingMode?: pulumi.Input<string | undefined>;
    /**
     * Booststrap DNS servers. Defaults to the ones supplied by the default AdGuard Home configuration
     */
    bootstrapDns?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Whether the DNS response cache is enabled. Defaults to `true`
     */
    cacheEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Whether optimistic DNS caching is enabled. Defaults to `false`
     */
    cacheOptimistic?: pulumi.Input<boolean | undefined>;
    /**
     * DNS cache size (in bytes). Defaults to `4194304`
     */
    cacheSize?: pulumi.Input<number | undefined>;
    /**
     * Overridden maximum TTL (in seconds) received from upstream DNS servers. Defaults to `0`
     */
    cacheTtlMax?: pulumi.Input<number | undefined>;
    /**
     * Overridden minimum TTL (in seconds) received from upstream DNS servers. Defaults to `0`
     */
    cacheTtlMin?: pulumi.Input<number | undefined>;
    /**
     * Whether dropping of all IPv6 DNS queries is enabled. Defaults to `false`
     */
    disableIpv6?: pulumi.Input<boolean | undefined>;
    /**
     * The blocklist of clients: IP addresses, CIDRs, or ClientIDs
     */
    disallowedClients?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Whether outgoing DNSSEC is enabled. Defaults to `false`
     */
    dnssecEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * The custom IP for EDNS Client Subnet (ECS)
     */
    ednsCsCustomIp?: pulumi.Input<string | undefined>;
    /**
     * Whether EDNS Client Subnet (ECS) is enabled. Defaults to `false`
     */
    ednsCsEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Whether EDNS Client Subnet (ECS) is using a custom IP. Defaults to `false`
     */
    ednsCsUseCustom?: pulumi.Input<boolean | undefined>;
    /**
     * Fallback DNS servers
     */
    fallbackDns?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Set of private reverse DNS servers
     */
    localPtrUpstreams?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Whether protection is enabled. Defaults to `true`
     */
    protectionEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * The number of requests per second allowed per client. Defaults to `20`
     */
    rateLimit?: pulumi.Input<number | undefined>;
    /**
     * Subnet prefix length for IPv4 addresses used for rate limiting. Defaults to `24`
     */
    rateLimitSubnetLenIpv4?: pulumi.Input<number | undefined>;
    /**
     * Subnet prefix length for IPv6 addresses used for rate limiting. Defaults to `56`
     */
    rateLimitSubnetLenIpv6?: pulumi.Input<number | undefined>;
    /**
     * IP addresses excluded from rate limiting
     */
    rateLimitWhitelists?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Whether reverse DNS resolution of clients' IP addresses is enabled. Defaults to `true`
     */
    resolveClients?: pulumi.Input<boolean | undefined>;
    /**
     * Upstream DNS servers. Defaults to the ones supplied by the default AdGuard Home configuration
     */
    upstreamDns?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Upstream DNS resolvers usage strategy. Valid values are `load_balance` (default), `parallel` and `fastest_addr`
     */
    upstreamMode?: pulumi.Input<string | undefined>;
    /**
     * The number of seconds to wait for a response from the upstream server. Defaults to `10`
     */
    upstreamTimeout?: pulumi.Input<number | undefined>;
    /**
     * Whether to use private reverse DNS resolvers. Defaults to `false`
     */
    usePrivatePtrResolvers?: pulumi.Input<boolean | undefined>;
}
export interface ConfigFiltering {
    /**
     * Whether DNS filtering is enabled. Defaults to `true`
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Update interval for all list-based filters, in hours. Defaults to `24`
     */
    updateInterval?: pulumi.Input<number | undefined>;
}
export interface ConfigQuerylog {
    /**
     * Whether anonymizing clients' IP addresses is enabled. Defaults to `false`
     */
    anonymizeClientIp?: pulumi.Input<boolean | undefined>;
    /**
     * Whether the query log is enabled. Defaults to `true`
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * If `true`, the host names in the `ignored` array are excluded from the query log. Defaults to `true`
     */
    ignoredEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Set of host names which should not be written to log
     */
    ignoreds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Time period for query log rotation, in hours. Defaults to `2160` (90 days)
     */
    interval?: pulumi.Input<number | undefined>;
}
export interface ConfigSafesearch {
    /**
     * Whether Safe Search is enabled. Defaults to `false`
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Services which SafeSearch is enabled.
     */
    services?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface ConfigStats {
    /**
     * Whether server statistics are enabled. Defaults to `true`
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * If `true`, the host names in the `ignored` array are excluded from the statistics. Defaults to `true`
     */
    ignoredEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Set of host names which should not be counted in the server statistics
     */
    ignoreds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Time period for server statistics rotation, in hours. Defaults to `24` (1 day)
     */
    interval?: pulumi.Input<number | undefined>;
}
export interface ConfigTls {
    /**
     * The certificates chain. Supply either a path to a file or a base64 encoded string of the certificates chain in PEM format
     */
    certificateChain: pulumi.Input<string>;
    /**
     * The value of SubjectAltNames field of the first certificate in the chain
     */
    dnsNames?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Whether encryption (DoT/DoH/HTTPS) is enabled
     */
    enabled: pulumi.Input<boolean>;
    /**
     * When `true`, forces HTTP-to-HTTPS redirect. Defaults to `false`
     */
    forceHttps?: pulumi.Input<boolean | undefined>;
    /**
     * The issuer of the first certificate in the chain
     */
    issuer?: pulumi.Input<string | undefined>;
    /**
     * The private key type, either `RSA` or `ECDSA`
     */
    keyType?: pulumi.Input<string | undefined>;
    /**
     * The NotAfter field of the first certificate in the chain
     */
    notAfter?: pulumi.Input<string | undefined>;
    /**
     * The NotBefore field of the first certificate in the chain
     */
    notBefore?: pulumi.Input<string | undefined>;
    /**
     * The DNS-over-Quic (DoQ) port. Set to `0` to disable. Defaults to `853`
     */
    portDnsOverQuic?: pulumi.Input<number | undefined>;
    /**
     * The DNS-over-TLS (DoT) port. Set to `0` to disable. Defaults to `853`
     */
    portDnsOverTls?: pulumi.Input<number | undefined>;
    /**
     * The HTTPS port. Set to `0` to disable. Defaults to `443`
     */
    portHttps?: pulumi.Input<number | undefined>;
    /**
     * The private key. Supply either a path to a file or a base64 encoded string of the private key in PEM format
     */
    privateKey: pulumi.Input<string>;
    /**
     * Whether the user has previously saved a private key
     */
    privateKeySaved?: pulumi.Input<boolean | undefined>;
    /**
     * When `true`, plain DNS is allowed for incoming requests. Defaults to `true`
     */
    servePlainDns?: pulumi.Input<boolean | undefined>;
    /**
     * The hostname of the TLS/HTTPS server
     */
    serverName: pulumi.Input<string>;
    /**
     * The subject of the first certificate in the chain
     */
    subject?: pulumi.Input<string | undefined>;
    /**
     * Whether the specified certificates chain is a valid chain of X.509 certificates
     */
    validCert?: pulumi.Input<boolean | undefined>;
    /**
     * Whether the specified certificates chain is verified and issued by a known CA
     */
    validChain?: pulumi.Input<boolean | undefined>;
    /**
     * Whether the private key is valid
     */
    validKey?: pulumi.Input<boolean | undefined>;
    /**
     * Whether both certificate and private key are correct
     */
    validPair?: pulumi.Input<boolean | undefined>;
    /**
     * The validation warning message with the issue description
     */
    warningValidation?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=input.d.ts.map