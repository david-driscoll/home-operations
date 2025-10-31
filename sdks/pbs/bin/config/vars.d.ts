/**
 * The API token for authentication (format: user@realm:token_name=token_value)
 */
export declare const apiToken: string | undefined;
/**
 * The endpoint URL for the Proxmox Backup Server API (e.g., https://pbs.example.com:8007)
 */
export declare const endpoint: string | undefined;
/**
 * Whether to skip the TLS verification step. Defaults to false.
 */
export declare const insecure: boolean | undefined;
/**
 * The password for authentication (used with username)
 */
export declare const password: string | undefined;
/**
 * Timeout for API requests in seconds. Defaults to 30.
 */
export declare const timeout: number | undefined;
/**
 * The username for authentication (alternative to API token)
 */
export declare const username: string | undefined;
