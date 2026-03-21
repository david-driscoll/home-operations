/**
 * Skip verification of TLS certificates of API requests. You may need to set this to `true` if you are using your local API without setting up a signed certificate. Can be specified with the `UNIFI_INSECURE` environment variable. Ignored when `cloud_connector` is enabled.
 */
export declare const allowInsecure: boolean | undefined;
/**
 * API key for the Unifi controller. Can be specified with the `UNIFI_API_KEY` environment variable. If this is set, the `username` and `password` fields are ignored.
 */
export declare const apiKey: string | undefined;
/**
 * URL of the controller API. Can be specified with the `UNIFI_API` environment variable. You should **NOT** supply the path (`/api`), the SDK will discover the appropriate paths. This is to support UDM Pro style API paths as well as more standard controller paths.
 */
export declare const apiUrl: string | undefined;
/**
 * Use UniFi Cloud Connector API to access the controller. When enabled, requires `api_key` authentication and automatically routes requests through https://api.ui.com. Can be specified with the `UNIFI_CLOUD_CONNECTOR` environment variable. The `api_url` field is ignored when this is enabled.
 */
export declare const cloudConnector: boolean | undefined;
/**
 * Hardware ID of the UniFi console to connect to when using Cloud Connector. If not specified, defaults to the first console where owner=true. Can be specified with the `UNIFI_HARDWARE_ID` environment variable. Only used when `cloud_connector` is enabled.
 */
export declare const hardwareId: string | undefined;
/**
 * Password for the user accessing the API. Can be specified with the `UNIFI_PASSWORD` environment variable.
 */
export declare const password: string | undefined;
/**
 * The site in the Unifi controller this provider will manage. Can be specified with the `UNIFI_SITE` environment variable. Default: `default`
 */
export declare const site: string | undefined;
/**
 * Local user name for the Unifi controller API. Can be specified with the `UNIFI_USERNAME` environment variable.
 */
export declare const username: string | undefined;
