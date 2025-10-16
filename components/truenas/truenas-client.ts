import { ConsoleLogger, listen } from "vscode-ws-jsonrpc";
import {
  type AuthLoginExParams,
  type AuthLoginExResponse,
  type SystemInfo,
  type Job,
  AuthLoginExRequest,
  // System Request Types
  SystemInfoRequest,
  CoreSubscribeRequest,
  CoreUnsubscribeRequest,
  // Notification Types
  CollectionUpdateNotification,
  NotifyUnsubscribedNotification,
  JobUpdateNotification,
} from "./truenas-types.js";
import { WebSocket } from "http";
import { MessageConnection } from "vscode-jsonrpc";

/**
 * TrueNAS JSON-RPC 2.0 WebSocket Client
 *
 * This client implements the TrueNAS JSON-RPC 2.0 API over WebSocket
 * as documented at https://api.truenas.com/v25.04.2/
 */
export class TrueNASClient {
  private authToken?: string;
  public connection: Promise<MessageConnection>;

  // API namespaces
  private readonly socket: InstanceType<typeof import("http").WebSocket>;
  /**
   * Send a pure JSON-RPC 2.0 request directly over WebSocket
   * This completely bypasses vscode-jsonrpc to avoid parameter structure issues
   */
  async sendDirectJsonRpc<T>(method: string, params?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = Math.floor(Math.random() * 1000000);

      // Create a pure JSON-RPC 2.0 request
      const request = {
        jsonrpc: "2.0",
        method: method,
        params: params,
        id: requestId,
      };

      // Set up a one-time response handler with proper typing
      const handleMessage = (event: any) => {
        try {
          const response = JSON.parse(event.data);
          if (response.id === requestId) {
            this.socket.removeEventListener("message", handleMessage);
            if (response.error) {
              reject(new Error(`JSON-RPC Error: ${response.error.message || response.error}`));
            } else {
              resolve(response.result);
            }
          }
        } catch (e) {
          reject(new Error("Failed to parse JSON-RPC response"));
        }
      };

      // Add the message handler
      this.socket.addEventListener("message", handleMessage);

      // Send the request
      this.socket.send(JSON.stringify(request));

      // Set a timeout
      setTimeout(() => {
        this.socket.removeEventListener("message", handleMessage);
        reject(new Error("Request timeout"));
      }, 30000);
    });
  }

  public withConnection<R>(func: (connection: MessageConnection) => Promise<R>) {
    return this.connection.then(func);
  }

  constructor(
    private host: string,
    private options: {
      port?: number;
      ssl?: boolean;
      reconnectOnClose?: boolean;
      maxReconnectAttempts?: number;
    } = {}
  ) {
    const protocol = this.options.ssl ? "wss" : "ws";
    const port = this.options.port || (this.options.ssl ? 443 : 80);
    const webSocket = (this.socket = new WebSocket(`${protocol}://${this.host}:${port}/api/current`));
    this.connection = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timed out"));
      }, 10000); // 10 seconds timeout
      listen({
        webSocket: webSocket as any,
        logger: new ConsoleLogger(),
        onConnection: (connection) => {
          clearTimeout(timeout);

          // Set up typed notification handlers
          connection.onNotification(CollectionUpdateNotification, (params) => {
            this.onCollectionUpdate?.(params);
          });

          connection.onNotification(NotifyUnsubscribedNotification, (params) => {
            this.onNotifyUnsubscribed?.(params);
          });

          connection.onNotification(JobUpdateNotification, (params) => {
            this.onJobUpdate?.(params);
          });

          connection.listen();
          resolve(connection);
        },
      });
    });
  }

  /**
   * Disconnect from the TrueNAS WebSocket API
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
    }
  }

  /**
   * Authenticate using the new v25.04.2 auth.login_ex method
   * Supports multiple authentication mechanisms including:
   * - PASSWORD_PLAIN: username/password authentication
   * - API_KEY_PLAIN: API key authentication
   * - AUTH_TOKEN_PLAIN: authentication token
   * - OTP_TOKEN: one-time password (for multi-step auth)
   */
  async authenticateEx(params: AuthLoginExParams): Promise<AuthLoginExResponse> {
    try {
      const response = await (await this.connection).sendRequest(AuthLoginExRequest, params);

      // Store auth token if authentication was successful
      if (response.response_type === "SUCCESS") {
        if (params.mechanism === "PASSWORD_PLAIN" || params.mechanism === "API_KEY_PLAIN" || params.mechanism === "AUTH_TOKEN_PLAIN") {
          // For successful primary authentication, we consider the session authenticated
          this.authToken = "authenticated"; // The actual token handling is done by the session
        }
      }

      return response;
    } catch (error) {
      console.error("Extended authentication failed:", error);
      throw error;
    }
  }

  /**
   * Subscribe to notifications for a specific collection
   */
  async subscribe(name: string): Promise<void> {
    await this.withConnection((c) => c.sendRequest(CoreSubscribeRequest, name));
  }

  /**
   * Unsubscribe from notifications for a specific collection
   */
  async unsubscribe(name: string): Promise<void> {
    await this.withConnection((c) => c.sendRequest(CoreUnsubscribeRequest, name));
  }

  /**
   * Get system information
   * @deprecated Use client.system.info() instead
   */
  getSystemInfo(): Promise<SystemInfo> {
    return this.withConnection((c) => c.sendRequest(SystemInfoRequest));
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
    return this.connection !== undefined && this.socket.readyState === WebSocket.OPEN;
  }

  // Event handlers that can be overridden
  onCollectionUpdate?: (params: {
    msg: "added" | "changed" | "removed";
    collection: string;
    id: any;
    fields: {
      id: string;
      state: string;
      progress: {
        percent: number;
        description: string;
      };
      result: any;
      exc_info: {
        type: string;
        extra: any[] | null;
        repr: string;
      };
      error: string;
      exception: string;
      message_ids?: string[];
    };
    extra: object;
  }) => void;

  onNotifyUnsubscribed?: (params: { collection: string; error: any }) => void;

  onJobUpdate?: (params: Job) => void;

  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: any) => void;
}

export default TrueNASClient;
