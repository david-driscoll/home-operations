/**
 * The hostname of the AdGuard Home instance. Include the port if not on a standard HTTP/HTTPS port
 */
export declare const host: string | undefined;
/**
 * When `true`, will disable any TLS certificate checks. Defaults to `false`
 */
export declare const insecure: boolean | undefined;
/**
 * The password of the AdGuard Home instance
 */
export declare const password: string | undefined;
/**
 * The HTTP scheme of the AdGuard Home instance. Can be either `http` or `https` (default)
 */
export declare const scheme: string | undefined;
/**
 * The timeout (in seconds) for making requests to AdGuard Home. Defaults to **10**
 */
export declare const timeout: number | undefined;
/**
 * The username of the AdGuard Home instance
 */
export declare const username: string | undefined;
