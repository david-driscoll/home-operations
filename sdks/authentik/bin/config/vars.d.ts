/**
 * Optional HTTP headers sent with every request
 */
export declare const headers: {
    [key: string]: string;
} | undefined;
/**
 * Whether to skip TLS verification, can optionally be passed as `AUTHENTIK_INSECURE` environmental variable
 */
export declare const insecure: boolean | undefined;
/**
 * The authentik API token, can optionally be passed as `AUTHENTIK_TOKEN` environmental variable
 */
export declare const token: string | undefined;
/**
 * The authentik API endpoint, can optionally be passed as `AUTHENTIK_URL` environmental variable
 */
export declare const url: string | undefined;
