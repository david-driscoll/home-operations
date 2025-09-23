/**
 * API TokenID e.g. root@pam!mytesttoken
 */
export declare const pmApiTokenId: string | undefined;
/**
 * The secret uuid corresponding to a TokenID
 */
export declare const pmApiTokenSecret: string | undefined;
/**
 * https://host.fqdn:8006/api2/json
 */
export declare const pmApiUrl: string | undefined;
/**
 * By default this provider will exit if an unknown attribute is found. This is to prevent the accidential destruction of VMs or Data when something in the proxmox API has changed/updated and is not confirmed to work with this provider. Set this to true at your own risk. It may allow you to proceed in cases when the provider refuses to work, but be aware of the danger in doing so.
 */
export declare const pmDangerouslyIgnoreUnknownAttributes: boolean | undefined;
/**
 * Enable or disable the verbose debug output from proxmox api
 */
export declare const pmDebug: boolean | undefined;
/**
 * Set custom http headers e.g. Key,Value,Key1,Value1
 */
export declare const pmHttpHeaders: string | undefined;
/**
 * Enable provider logging to get proxmox API logs
 */
export declare const pmLogEnable: boolean | undefined;
/**
 * Write logs to this specific file
 */
export declare const pmLogFile: string | undefined;
/**
 * Configure the logging level to display; trace, debug, info, warn, etc
 */
export declare const pmLogLevels: {
    [key: string]: string;
} | undefined;
/**
 * OTP 2FA code (if required)
 */
export declare const pmOtp: string | undefined;
export declare const pmParallel: number | undefined;
/**
 * Password to authenticate into proxmox
 */
export declare const pmPassword: string | undefined;
/**
 * Proxy Server passed to Api client(useful for debugging). Syntax: http://proxy:port
 */
export declare const pmProxyServer: string | undefined;
/**
 * How many seconds to wait for operations for both provider and api-client, default is 20m
 */
export declare const pmTimeout: number | undefined;
export declare const pmTlsInsecure: boolean | undefined;
/**
 * Username e.g. myuser or myuser@pam
 */
export declare const pmUser: string | undefined;
