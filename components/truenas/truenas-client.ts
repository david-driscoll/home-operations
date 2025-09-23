import { RpcWebSocketClient } from "rpc-websocket-client";

/**
 * TrueNAS JSON-RPC 2.0 WebSocket Client
 *
 * This client implements the TrueNAS JSON-RPC 2.0 API over WebSocket
 * as documented at https://api.truenas.com/v25.04.2/
 */
export class TrueNASClient {
  private rpc: RpcWebSocketClient;
  private isConnected: boolean = false;
  private authToken?: string;

  constructor(
    private host: string,
    private options: {
      port?: number;
      ssl?: boolean;
      reconnectOnClose?: boolean;
      maxReconnectAttempts?: number;
    } = {}
  ) {
    this.rpc = new RpcWebSocketClient();
    this.setupEventHandlers();
  }

  /**
   * Connect to the TrueNAS WebSocket API
   */
  async connect(): Promise<void> {
    const protocol = this.options.ssl ? "wss" : "ws";
    const port = this.options.port || (this.options.ssl ? 443 : 80);
    const url = `${protocol}://${this.host}:${port}/websocket`;

    try {
      await this.rpc.connect(url);
      this.isConnected = true;
      console.log(`Connected to TrueNAS at ${url}`);
    } catch (error) {
      console.error("Failed to connect to TrueNAS:", error);
      throw error;
    }
  }

  /**
   * Disconnect from the TrueNAS WebSocket API
   */
  disconnect(): void {
    if (this.rpc.ws) {
      this.rpc.ws.close();
      this.isConnected = false;
    }
  }

  /**
   * Authenticate with username and password
   */
  async authenticate(username: string, password: string): Promise<boolean> {
    try {
      const response = await this.call<string>("auth.login", [username, password]);
      this.authToken = response;
      return true;
    } catch (error) {
      console.error("Authentication failed:", error);
      throw error;
    }
  }

  /**
   * Authenticate with API key
   */
  async authenticateWithApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await this.call<boolean>("auth.login_with_api_key", [apiKey]);
      return response;
    } catch (error) {
      console.error("API key authentication failed:", error);
      throw error;
    }
  }

  /**
   * Make a JSON-RPC method call
   */
  async call<T = any>(method: string, params: any[] = []): Promise<T> {
    if (!this.isConnected) {
      throw new Error("Not connected to TrueNAS. Call connect() first.");
    }

    try {
      const result = await this.rpc.call(method, params);
      return result as T;
    } catch (error) {
      console.error(`RPC call failed for method ${method}:`, error);
      throw error;
    }
  }

  /**
   * Send a notification (no response expected)
   */
  notify(method: string, params: any[] = []): void {
    if (!this.isConnected) {
      throw new Error("Not connected to TrueNAS. Call connect() first.");
    }

    this.rpc.notify(method, params);
  }

  /**
   * Subscribe to notifications for a specific collection
   */
  async subscribe(name: string): Promise<void> {
    await this.call("core.subscribe", [name]);
  }

  /**
   * Unsubscribe from notifications for a specific collection
   */
  async unsubscribe(name: string): Promise<void> {
    await this.call("core.unsubscribe", [name]);
  }

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<any> {
    return this.call("system.info");
  }

  /**
   * Get system version
   */
  async getVersion(): Promise<string> {
    return this.call("system.version");
  }

  /**
   * Check if authenticated
   */
  get isAuthenticated(): boolean {
    return !!this.authToken;
  }

  /**
   * Check connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Setup event handlers for WebSocket events
   */
  private setupEventHandlers(): void {
    // Handle incoming notifications
    this.rpc.onNotification.push((notification) => {
      this.handleNotification(notification);
    });

    // Handle incoming requests (bi-directional communication)
    this.rpc.onRequest.push((request) => {
      this.handleRequest(request);
    });
  }

  /**
   * Handle incoming notifications from TrueNAS
   */
  private handleNotification(notification: any): void {
    switch (notification.method) {
      case "collection_update":
        this.onCollectionUpdate?.(notification.params);
        break;
      case "notify_unsubscribed":
        this.onNotifyUnsubscribed?.(notification.params);
        break;
      default:
        console.log("Received notification:", notification);
    }
  }

  /**
   * Handle incoming requests from TrueNAS
   */
  private handleRequest(request: any): void {
    console.log("Received request:", request);
    // Handle any requests from server if needed
  }

  // Event handlers that can be overridden
  onCollectionUpdate?: (params: any) => void;
  onNotifyUnsubscribed?: (params: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: any) => void;
}

/**
 * Factory function to create a TrueNAS client
 */
export function createTrueNASClient(
  host: string,
  options?: {
    port?: number;
    ssl?: boolean;
    reconnectOnClose?: boolean;
    maxReconnectAttempts?: number;
  }
): TrueNASClient {
  return new TrueNASClient(host, options);
}

export default TrueNASClient;
