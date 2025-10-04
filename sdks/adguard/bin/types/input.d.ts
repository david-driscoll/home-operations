import * as pulumi from "@pulumi/pulumi";
import * as inputs from "../types/input";
export interface ClientBlockedServicesPauseSchedule {
    /**
     * Paused service blocking interval for `Friday`
     */
    fri?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleFri>;
    /**
     * Paused service blocking interval for `Monday`
     */
    mon?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleMon>;
    /**
     * Paused service blocking interval for `Saturday`
     */
    sat?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleSat>;
    /**
     * Paused service blocking interval for `Sunday`
     */
    sun?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleSun>;
    /**
     * Paused service blocking interval for `Thursday`
     */
    thu?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleThu>;
    /**
     * Time zone name according to IANA time zone database. For example `America/New_York`. `Local` represents the system's local time zone.
     */
    timeZone?: pulumi.Input<string>;
    /**
     * Paused service blocking interval for `Tueday`
     */
    tue?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleTue>;
    /**
     * Paused service blocking interval for `Wednesday`
     */
    wed?: pulumi.Input<inputs.ClientBlockedServicesPauseScheduleWed>;
}
export interface ClientBlockedServicesPauseScheduleFri {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ClientBlockedServicesPauseScheduleMon {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ClientBlockedServicesPauseScheduleSat {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ClientBlockedServicesPauseScheduleSun {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ClientBlockedServicesPauseScheduleThu {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ClientBlockedServicesPauseScheduleTue {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ClientBlockedServicesPauseScheduleWed {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ClientSafesearch {
    /**
     * Whether Safe Search is enabled. Defaults to `false`
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Services which SafeSearch is enabled.
     */
    services?: pulumi.Input<pulumi.Input<string>[]>;
}
export interface ConfigBlockedServicesPauseSchedule {
    /**
     * Paused service blocking interval for `Friday`
     */
    fri?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleFri>;
    /**
     * Paused service blocking interval for `Monday`
     */
    mon?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleMon>;
    /**
     * Paused service blocking interval for `Saturday`
     */
    sat?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleSat>;
    /**
     * Paused service blocking interval for `Sunday`
     */
    sun?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleSun>;
    /**
     * Paused service blocking interval for `Thursday`
     */
    thu?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleThu>;
    /**
     * Time zone name according to IANA time zone database. For example `America/New_York`. `Local` represents the system's local time zone.
     */
    timeZone?: pulumi.Input<string>;
    /**
     * Paused service blocking interval for `Tueday`
     */
    tue?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleTue>;
    /**
     * Paused service blocking interval for `Wednesday`
     */
    wed?: pulumi.Input<inputs.ConfigBlockedServicesPauseScheduleWed>;
}
export interface ConfigBlockedServicesPauseScheduleFri {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ConfigBlockedServicesPauseScheduleMon {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ConfigBlockedServicesPauseScheduleSat {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ConfigBlockedServicesPauseScheduleSun {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ConfigBlockedServicesPauseScheduleThu {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ConfigBlockedServicesPauseScheduleTue {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ConfigBlockedServicesPauseScheduleWed {
    /**
     * End of paused service blocking schedule, in HH:MM format
     */
    end?: pulumi.Input<string>;
    /**
     * Start of paused service blocking schedule, in HH:MM format
     */
    start?: pulumi.Input<string>;
}
export interface ConfigDhcp {
    /**
     * Whether the DHCP server is enabled. Defaults to `false`
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The interface to use for the DHCP server
     */
    interface: pulumi.Input<string>;
    ipv4Settings?: pulumi.Input<inputs.ConfigDhcpIpv4Settings>;
    ipv6Settings?: pulumi.Input<inputs.ConfigDhcpIpv6Settings>;
    /**
     * Static leases for the DHCP server
     */
    staticLeases?: pulumi.Input<pulumi.Input<inputs.ConfigDhcpStaticLease>[]>;
}
export interface ConfigDhcpIpv4Settings {
    /**
     * The gateway IP for the DHCP server scope
     */
    gatewayIp: pulumi.Input<string>;
    /**
     * The lease duration for the DHCP server scope, in seconds. Defaults to `0`
     */
    leaseDuration?: pulumi.Input<number>;
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
    leaseDuration?: pulumi.Input<number>;
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
    allowedClients?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Disallowed domains. Defaults to the ones supplied by the default AdGuard Home configuration
     */
    blockedHosts?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * How many seconds the clients should cache a filtered response. Defaults to `10`
     */
    blockedResponseTtl?: pulumi.Input<number>;
    /**
     * When `blocking_mode` is set to `custom_ip`, the IPv4 address to be returned for a blocked A request
     */
    blockingIpv4?: pulumi.Input<string>;
    /**
     * When `blocking_mode` is set to `custom_ip`, the IPv6 address to be returned for a blocked A request
     */
    blockingIpv6?: pulumi.Input<string>;
    /**
     * DNS response sent when request is blocked. Valid values are `default` (the default), `refused`, `nxdomain`, `null_ip` or `custom_ip`
     */
    blockingMode?: pulumi.Input<string>;
    /**
     * Booststrap DNS servers. Defaults to the ones supplied by the default AdGuard Home configuration
     */
    bootstrapDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether optimistic DNS caching is enabled. Defaults to `false`
     */
    cacheOptimistic?: pulumi.Input<boolean>;
    /**
     * DNS cache size (in bytes). Defaults to `4194304`
     */
    cacheSize?: pulumi.Input<number>;
    /**
     * Overridden maximum TTL (in seconds) received from upstream DNS servers. Defaults to `0`
     */
    cacheTtlMax?: pulumi.Input<number>;
    /**
     * Overridden minimum TTL (in seconds) received from upstream DNS servers. Defaults to `0`
     */
    cacheTtlMin?: pulumi.Input<number>;
    /**
     * Whether dropping of all IPv6 DNS queries is enabled. Defaults to `false`
     */
    disableIpv6?: pulumi.Input<boolean>;
    /**
     * The blocklist of clients: IP addresses, CIDRs, or ClientIDs
     */
    disallowedClients?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether outgoing DNSSEC is enabled. Defaults to `false`
     */
    dnssecEnabled?: pulumi.Input<boolean>;
    /**
     * The custom IP for EDNS Client Subnet (ECS)
     */
    ednsCsCustomIp?: pulumi.Input<string>;
    /**
     * Whether EDNS Client Subnet (ECS) is enabled. Defaults to `false`
     */
    ednsCsEnabled?: pulumi.Input<boolean>;
    /**
     * Whether EDNS Client Subnet (ECS) is using a custom IP. Defaults to `false`
     */
    ednsCsUseCustom?: pulumi.Input<boolean>;
    /**
     * Fallback DNS servers
     */
    fallbackDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Set of private reverse DNS servers
     */
    localPtrUpstreams?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether protection is enabled. Defaults to `true`
     */
    protectionEnabled?: pulumi.Input<boolean>;
    /**
     * The number of requests per second allowed per client. Defaults to `20`
     */
    rateLimit?: pulumi.Input<number>;
    /**
     * Subnet prefix length for IPv4 addresses used for rate limiting. Defaults to `24`
     */
    rateLimitSubnetLenIpv4?: pulumi.Input<number>;
    /**
     * Subnet prefix length for IPv6 addresses used for rate limiting. Defaults to `56`
     */
    rateLimitSubnetLenIpv6?: pulumi.Input<number>;
    /**
     * IP addresses excluded from rate limiting
     */
    rateLimitWhitelists?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether reverse DNS resolution of clients' IP addresses is enabled. Defaults to `true`
     */
    resolveClients?: pulumi.Input<boolean>;
    /**
     * Upstream DNS servers. Defaults to the ones supplied by the default AdGuard Home configuration
     */
    upstreamDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Upstream DNS resolvers usage strategy. Valid values are `load_balance` (default), `parallel` and `fastest_addr`
     */
    upstreamMode?: pulumi.Input<string>;
    /**
     * The number of seconds to wait for a response from the upstream server. Defaults to `10`
     */
    upstreamTimeout?: pulumi.Input<number>;
    /**
     * Whether to use private reverse DNS resolvers. Defaults to `false`
     */
    usePrivatePtrResolvers?: pulumi.Input<boolean>;
}
export interface ConfigFiltering {
    /**
     * Whether DNS filtering is enabled. Defaults to `true`
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Update interval for all list-based filters, in hours. Defaults to `24`
     */
    updateInterval?: pulumi.Input<number>;
}
export interface ConfigQuerylog {
    /**
     * Whether anonymizing clients' IP addresses is enabled. Defaults to `false`
     */
    anonymizeClientIp?: pulumi.Input<boolean>;
    /**
     * Whether the query log is enabled. Defaults to `true`
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Set of host names which should not be written to log
     */
    ignoreds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Time period for query log rotation, in hours. Defaults to `2160` (90 days)
     */
    interval?: pulumi.Input<number>;
}
export interface ConfigSafesearch {
    /**
     * Whether Safe Search is enabled. Defaults to `false`
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Services which SafeSearch is enabled.
     */
    services?: pulumi.Input<pulumi.Input<string>[]>;
}
export interface ConfigStats {
    /**
     * Whether server statistics are enabled. Defaults to `true`
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Set of host names which should not be counted in the server statistics
     */
    ignoreds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Time period for server statistics rotation, in hours. Defaults to `24` (1 day)
     */
    interval?: pulumi.Input<number>;
}
export interface ConfigTls {
    /**
     * The certificates chain. Supply either a path to a file or a base64 encoded string of the certificates chain in PEM format
     */
    certificateChain: pulumi.Input<string>;
    /**
     * The value of SubjectAltNames field of the first certificate in the chain
     */
    dnsNames?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether encryption (DoT/DoH/HTTPS) is enabled
     */
    enabled: pulumi.Input<boolean>;
    /**
     * When `true`, forces HTTP-to-HTTPS redirect. Defaults to `false`
     */
    forceHttps?: pulumi.Input<boolean>;
    /**
     * The issuer of the first certificate in the chain
     */
    issuer?: pulumi.Input<string>;
    /**
     * The private key type, either `RSA` or `ECDSA`
     */
    keyType?: pulumi.Input<string>;
    /**
     * The NotAfter field of the first certificate in the chain
     */
    notAfter?: pulumi.Input<string>;
    /**
     * The NotBefore field of the first certificate in the chain
     */
    notBefore?: pulumi.Input<string>;
    /**
     * The DNS-over-Quic (DoQ) port. Set to `0` to disable. Defaults to `853`
     */
    portDnsOverQuic?: pulumi.Input<number>;
    /**
     * The DNS-over-TLS (DoT) port. Set to `0` to disable. Defaults to `853`
     */
    portDnsOverTls?: pulumi.Input<number>;
    /**
     * The HTTPS port. Set to `0` to disable. Defaults to `443`
     */
    portHttps?: pulumi.Input<number>;
    /**
     * The private key. Supply either a path to a file or a base64 encoded string of the private key in PEM format
     */
    privateKey: pulumi.Input<string>;
    /**
     * Whether the user has previously saved a private key
     */
    privateKeySaved?: pulumi.Input<boolean>;
    /**
     * When `true`, plain DNS is allowed for incoming requests. Defaults to `true`
     */
    servePlainDns?: pulumi.Input<boolean>;
    /**
     * The hostname of the TLS/HTTPS server
     */
    serverName: pulumi.Input<string>;
    /**
     * The subject of the first certificate in the chain
     */
    subject?: pulumi.Input<string>;
    /**
     * Whether the specified certificates chain is a valid chain of X.509 certificates
     */
    validCert?: pulumi.Input<boolean>;
    /**
     * Whether the specified certificates chain is verified and issued by a known CA
     */
    validChain?: pulumi.Input<boolean>;
    /**
     * Whether the private key is valid
     */
    validKey?: pulumi.Input<boolean>;
    /**
     * Whether both certificate and private key are correct
     */
    validPair?: pulumi.Input<boolean>;
    /**
     * The validation warning message with the issue description
     */
    warningValidation?: pulumi.Input<string>;
}
