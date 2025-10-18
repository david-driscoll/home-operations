import type { OpenAPIClient, Parameters, UnknownParamsObject, OperationResponse, AxiosRequestConfig } from "openapi-client-axios";

declare namespace Components {
  export interface HeaderParameters {
    AcceptHeaderParam?: Parameters.AcceptHeaderParam;
  }
  export interface TailnetParamsObject {
    tailnet: Parameters.Tailnet;
  }
  namespace Parameters {
    export type AcceptHeaderParam = string;
    /**
     * example:
     * [
     *   "uc4p8fRHvJ11DEVEL",
     *   "~bob"
     * ]
     */
    export type Actor = string[];
    /**
     * example:
     * true
     */
    export type All = boolean;
    export type AttributeKey = string;
    /**
     * example:
     * account
     */
    export type ContactType = "account" | "support" | "security";
    export type DeviceId = string;
    export type DeviceInviteId = string;
    /**
     * example:
     * 2023-12-22T02:15:23-08:00
     */
    export type End = string;
    export type EndpointId = string;
    /**
     * example:
     * [
     *   "USER.CREATE",
     *   "NODE.CREATE"
     * ]
     */
    export type Event = (
      | "ADMIN_CONSOLE.LOGIN"
      | "ADMIN_CONSOLE.LOGOUT"
      | "API_KEY.CREATE"
      | "API_KEY.EXPIRED"
      | "API_KEY.REVOKE"
      | "BILLING.CANCEL.SUBSCRIPTION"
      | "BILLING.CREATE.SUBSCRIPTION"
      | "BILLING.UPDATE.ADDRESS"
      | "BILLING.UPDATE.BILLING_OWNER"
      | "BILLING.UPDATE.EMAIL"
      | "BILLING.UPDATE.PAYMENT_INFO"
      | "BILLING.UPDATE.STRIPE_CUSTOMER_ID"
      | "BILLING.UPDATE.SUBSCRIPTION"
      | "FAILED_REQUEST.UPDATE"
      | "GROUP.PUSH_GROUP.ATTRIBUTES"
      | "INVITE.ACCEPT.FEATURE"
      | "INVITE.ACCEPT.NODE_SHARE"
      | "INVITE.ACCEPT.TAILNET_INVITE"
      | "INVITE.CREATE.FEATURE"
      | "INVITE.CREATE.NODE_SHARE"
      | "INVITE.CREATE.TAILNET_INVITE"
      | "INVITE.DELETE.NODE_SHARE"
      | "INVITE.DELETE.TAILNET_INVITE"
      | "INVITE.RESEND.NODE_SHARE"
      | "INVITE.RESEND.TAILNET_INVITE"
      | "NODE.APPROVE"
      | "NODE.CREATE"
      | "NODE.CREATE.ATTRIBUTES"
      | "NODE.DELETE"
      | "NODE.DELETE.ATTRIBUTES"
      | "NODE.DISABLE.KEY_EXPIRY"
      | "NODE.DISCONNECT_NODE.CLIENT_LOG"
      | "NODE.ENABLE.KEY_EXPIRY"
      | "NODE.EXPIRED.KEY_EXPIRY_TIME"
      | "NODE.LOGIN"
      | "NODE.LOGOUT"
      | "NODE.REVOKE"
      | "NODE.UPDATE.ACL_TAGS"
      | "NODE.UPDATE.ALLOWED_IPS"
      | "NODE.UPDATE.ATTRIBUTES"
      | "NODE.UPDATE.AUTO_APPROVED_ROUTES"
      | "NODE.UPDATE.EXIT_NODE"
      | "NODE.UPDATE.KEY_EXPIRY_TIME"
      | "NODE.UPDATE.MACHINE_NAME"
      | "NODE.UPDATE.POSTURE_IDENTITY"
      | "NODE.UPDATE.TKA"
      | "SHARE.CREATE"
      | "SHARE.DELETE"
      | "SHARE.UPDATE"
      | "TAILNET.ACCEPT.FEATURE"
      | "TAILNET.CREATE"
      | "TAILNET.CREATE.LOGSTREAM_ENDPOINT"
      | "TAILNET.CREATE.POSTURE_INTEGRATION"
      | "TAILNET.CREATE.TKA"
      | "TAILNET.DELETE.LOGSTREAM_ENDPOINT"
      | "TAILNET.DELETE.POSTURE_INTEGRATION"
      | "TAILNET.DELETE.TKA"
      | "TAILNET.DISABLE.COLLECT_POSTURE_IDENTITY"
      | "TAILNET.DISABLE.COLLECT_SERVICES"
      | "TAILNET.DISABLE.FILE_SHARING"
      | "TAILNET.DISABLE.GEOSTEERING"
      | "TAILNET.DISABLE.HTTPS"
      | "TAILNET.DISABLE.LOG_EXIT_FLOWS"
      | "TAILNET.DISABLE.MACHINE_APPROVAL_NEEDED"
      | "TAILNET.DISABLE.MAGIC_DNS"
      | "TAILNET.DISABLE.MULLVAD_VPN"
      | "TAILNET.DISABLE.NETWORK_FLOW_LOGGING"
      | "TAILNET.DISABLE.SCIM"
      | "TAILNET.DISABLE.TKA"
      | "TAILNET.DISABLE.USER_APPROVAL_REQUIRED"
      | "TAILNET.ENABLE.COLLECT_POSTURE_IDENTITY"
      | "TAILNET.ENABLE.COLLECT_SERVICES"
      | "TAILNET.ENABLE.FILE_SHARING"
      | "TAILNET.ENABLE.GEOSTEERING"
      | "TAILNET.ENABLE.HTTPS"
      | "TAILNET.ENABLE.LOG_EXIT_FLOWS"
      | "TAILNET.ENABLE.MACHINE_APPROVAL_NEEDED"
      | "TAILNET.ENABLE.MAGIC_DNS"
      | "TAILNET.ENABLE.MULLVAD_VPN"
      | "TAILNET.ENABLE.NETWORK_FLOW_LOGGING"
      | "TAILNET.ENABLE.SCIM"
      | "TAILNET.ENABLE.TKA"
      | "TAILNET.ENABLE.USER_APPROVAL_REQUIRED"
      | "TAILNET.JOIN"
      | "TAILNET.JOIN_WAITLIST.FEATURE"
      | "TAILNET.LEAVE"
      | "TAILNET.UPDATE.ACCOUNT_EMAIL"
      | "TAILNET.UPDATE.ACL"
      | "TAILNET.UPDATE.DNS_CONFIG"
      | "TAILNET.UPDATE.LOGSTREAM_ENDPOINT"
      | "TAILNET.UPDATE.MAX_KEY_DURATION"
      | "TAILNET.UPDATE.POSTURE_INTEGRATION"
      | "TAILNET.UPDATE.SECURITY_EMAIL"
      | "TAILNET.UPDATE.SUPPORT_EMAIL"
      | "TAILNET.UPDATE.TCD"
      | "TAILNET.UPDATE.TKA"
      | "TAILNET.VERIFY.ACCOUNT_EMAIL"
      | "TAILNET.VERIFY.SECURITY_EMAIL"
      | "TAILNET.VERIFY.SUPPORT_EMAIL"
      | "USER.APPROVE"
      | "USER.CREATE"
      | "USER.DELETE"
      | "USER.INVITE"
      | "USER.PUSH_USER.ATTRIBUTES"
      | "USER.RESEND.TAILNET_INVITE"
      | "USER.RESTORE"
      | "USER.SUSPEND"
      | "USER.UPDATE.USER_ROLE"
      | "WEBHOOK_ENDPOINT.CREATE"
      | "WEBHOOK_ENDPOINT.DELETE"
      | "WEBHOOK_ENDPOINT.UPDATE.SECRET"
      | "WEBHOOK_ENDPOINT.UPDATE.SUBSCRIBED_EVENTS"
      | "WEB_INTERFACE.LOGIN"
      | "WEB_INTERFACE.LOGOUT"
    )[];
    /**
     * example:
     * all
     */
    export type Fields = "all" | "default";
    /**
     * example:
     * p56wQiqrn7mfDEVEL
     */
    export type Id = string;
    /**
     * example:
     * k123456CNTRL
     */
    export type KeyId = string;
    export type LogType =
      /**
       * The type of log for logging endpoints.
       *
       * example:
       * configuration
       */
      Schemas.LogType;
    /**
     * example:
     * 2023-12-19T16:39:57-08:00
     */
    export type Start = string;
    /**
     * example:
     * example.com
     */
    export type Tailnet = string;
    /**
     * example:
     * [
     *   "mytarget1",
     *   "sometarget2"
     * ]
     */
    export type Target = string[];
    export type UserId = string;
    export type UserInviteId = string;
  }
  export interface PathParameters {
    tailnet: /**
     * example:
     * example.com
     */
    Parameters.Tailnet;
    deviceId: Parameters.DeviceId;
    attributeKey: Parameters.AttributeKey;
    userInviteId: Parameters.UserInviteId;
    deviceInviteId: Parameters.DeviceInviteId;
    logType: Parameters.LogType;
    keyId: /**
     * example:
     * k123456CNTRL
     */
    Parameters.KeyId;
    id: /**
     * example:
     * p56wQiqrn7mfDEVEL
     */
    Parameters.Id;
    userId: Parameters.UserId;
    contactType: /**
     * example:
     * account
     */
    Parameters.ContactType;
    endpointId: Parameters.EndpointId;
  }
  export interface QueryParameters {
    fields?: /**
     * example:
     * all
     */
    Parameters.Fields;
    start: /**
     * example:
     * 2023-12-19T16:39:57-08:00
     */
    Parameters.Start;
    end: /**
     * example:
     * 2023-12-22T02:15:23-08:00
     */
    Parameters.End;
    actor?: /**
     * example:
     * [
     *   "uc4p8fRHvJ11DEVEL",
     *   "~bob"
     * ]
     */
    Parameters.Actor;
    target?: /**
     * example:
     * [
     *   "mytarget1",
     *   "sometarget2"
     * ]
     */
    Parameters.Target;
    event?: /**
     * example:
     * [
     *   "USER.CREATE",
     *   "NODE.CREATE"
     * ]
     */
    Parameters.Event;
    all: /**
     * example:
     * true
     */
    Parameters.All;
  }
  namespace Responses {
    /**
     * example:
     * {
     *   "message": "bad request"
     * }
     */
    export type $400 = Schemas.Error;
    /**
     * example:
     * {
     *   "message": "forbidden"
     * }
     */
    export type $403 = Schemas.Error;
    /**
     * example:
     * {
     *   "message": "not found"
     * }
     */
    export type $404 = Schemas.Error;
    /**
     * example:
     * {
     *   "message": "conflict"
     * }
     */
    export type $409 = Schemas.Error;
    /**
     * example:
     * {
     *   "message": "internal server error"
     * }
     */
    export type $500 = Schemas.Error;
    /**
     * example:
     * {
     *   "message": "not implemented"
     * }
     */
    export type $501 = Schemas.Error;
    /**
     * example:
     * {
     *   "message": "bad gateway"
     * }
     */
    export type $502 = Schemas.Error;
  }
  namespace Schemas {
    /**
     * An external ID for use in authenticating to AWS using role-based authentication.
     * example:
     * {
     *   "externalId": "60fe9ce7-7791-4ab3-ab34-4294f5972725",
     *   "tailscaleAwsAccountId": "001234567890"
     * }
     */
    export interface AwsExternalId {
      /**
       * The external id that Tailscale will supply to AWS when authenticating using role-based authentication.
       * example:
       * 60fe9ce7-7791-4ab3-ab34-4294f5972725
       */
      externalId?: string;
      /**
       * The AWS account id that Tailscale will supply to AWS when authenticating using role-based authentication.
       * example:
       * 1234567890
       */
      tailscaleAwsAccountId?: string;
    }
    /**
     * example:
     * {
     *   "action": "CREATE",
     *   "actor": {
     *     "displayName": "Lion Dahlia Armadillo",
     *     "id": "uZKk3KSfrH11DEVEL",
     *     "loginName": "lion.dahlia.armadillo@example.com",
     *     "type": "USER"
     *   },
     *   "deferredAt": "0001-01-01T00:00:00Z",
     *   "eventGroupID": "0378d8f57300d172ef7ae3826e097ef0",
     *   "eventTime": "2024-06-06T15:25:26.583893Z",
     *   "origin": "ADMIN_CONSOLE",
     *   "target": {
     *     "id": "nBLYviWLGB21DEVEL",
     *     "isEphemeral": true,
     *     "name": "silver-robin-horse-albatross-armadillo.taile18a.ts.net",
     *     "type": "NODE"
     *   },
     *   "type": "CONFIG"
     * }
     */
    export interface ConfigurationAuditLog {
      /**
       * Timestamp of the audit log event, in RFC 3339 format.
       * example:
       * 2024-06-06T15:25:26.583893Z
       */
      eventTime: string;
      /**
       * The type of log (always "CONFIG").
       */
      type: "CONFIG";
      /**
       * Timestamp recording the time that the audit log rate limiter enqueued the record to be logged at a future time, in RFC 3339 format.
       * example:
       * 0001-01-01T00:00:00Z
       */
      deferredAt?: string;
      /**
       * Identifier assigned to one or more audit log events, all of which are the result of a single operation.
       * example:
       * 0378d8f57300d172ef7ae3826e097ef0
       */
      eventGroupID: string;
      /**
       * The initiator of the action that generated the event, typically an API or user interface, like the Tailscale admin panel.
       * example:
       * ADMIN_CONSOLE
       */
      origin: "ADMIN_CONSOLE" | "CONFIG_API" | "CONTROL" | "IDENTITY_PROVIDER" | "NODE" | "SUPPORT_REQUEST" | "STRIPE" | "SECURITY_NOTIFICATION" | "LEGAL_NOTIFICATION";
      /**
       * The person who caused the action related to this event.
       */
      actor: {
        /**
         * The ID (user ID or node ID) of the actor.
         * example:
         * uZKk3KSfrH11DEVEL
         */
        id?: string;
        /**
         * The entity type of the actor.
         * example:
         * USER
         */
        type?: "USER" | "NODE" | "AUTOMATED_WORKER" | "OAUTH_CLIENT" | "SCIM" | "MULLVAD" | "LOGSTREAM" | "SECRET_SCANNER";
        /**
         * The login name of the actor at time of the action.
         * example:
         * lion.dahlia.armadillo@example.com
         */
        loginName?: string;
        /**
         * The display name of the actor at time of the action.
         */
        displayName?: string;
        /**
         * Indicates the tags owning a node. Its value is only set if `type` is `NODE`.
         * example:
         * [
         *   "server",
         *   "datacenter1"
         * ]
         */
        tags?: string[];
      };
      /**
       * The object of this event's action.
       */
      target: {
        /**
         * The unique ID (user id, tailnet SID, or node id) of the target.
         * example:
         * nBLYviWLGB21DEVEL
         */
        id?: string;
        /**
         * Name of the entity at time of the action.
         * example:
         * silver-robin-horse-albatross-armadillo.taile18a.ts.net
         */
        name?: string;
        /**
         * The entity type of Target.
         * example:
         * NODE
         */
        type?: "TAILNET" | "USER" | "GROUP" | "NODE" | "API_KEY" | "INVITE" | "SHARE" | "BILLING" | "ADMIN_CONSOLE" | "WEB_INTERFACE" | "WEBHOOK_ENDPOINT" | "FAILED_REQUEST";
        /**
         * Indicates whether the target is ephemeral. Its value should only be set if `type` is `NODE``.
         * example:
         * true
         */
        isEphemeral?: boolean;
        /**
         * The property name on this target which was updated by the event. When empty, the event didn't update any fields on this target.
         * example:
         * ALLOWED_IPS
         */
        property?:
          | "ACL"
          | "ACL_TAGS"
          | "ACCOUNT_EMAIL"
          | "ADDRESS"
          | "ALLOWED_IPS"
          | "AUTO_APPROVED_ROUTES"
          | "ATTRIBUTES"
          | "BILLING_OWNER"
          | "COLLECT_SERVICES"
          | "COLLECT_POSTURE_IDENTITY"
          | "MULLVAD_VPN"
          | "DNS_CONFIG"
          | "EMAIL"
          | "EXIT_NODE"
          | "FEATURE"
          | "FILE_SHARING"
          | "HTTPS"
          | "KEY_EXPIRY_TIME"
          | "KEY_EXPIRY"
          | "LOG_EXIT_FLOWS"
          | "LOGSTREAM_ENDPOINT"
          | "MAGIC_DNS"
          | "MACHINE_AUTH_NEEDED"
          | "MACHINE_APPROVAL_NEEDED"
          | "USER_APPROVAL_REQUIRED"
          | "MACHINE_NAME"
          | "MAX_KEY_DURATION"
          | "NETWORK_FLOW_LOGGING"
          | "GEOSTEERING"
          | "NODE_SHARE"
          | "TAILNET_INVITE"
          | "PAYMENT_INFO"
          | "POSTURE_IDENTITY"
          | "POSTURE_INTEGRATION"
          | "USER_ROLE"
          | "SCIM"
          | "SECURITY_EMAIL"
          | "STRIPE_CUSTOMER_ID"
          | "SUBSCRIPTION"
          | "SUBSCRIBED_EVENTS"
          | "SUPPORT_EMAIL"
          | "SECRET"
          | "TCD"
          | "TKA"
          | "AUTH_PROVIDER";
      };
      /**
       * The type of change attempted against the `target`.
       * example:
       * CREATE
       */
      action:
        | "LOGIN"
        | "LOGOUT"
        | "CREATE"
        | "UPDATE"
        | "DELETE"
        | "CANCEL"
        | "REVOKE"
        | "APPROVE"
        | "SUSPEND"
        | "RESTORE"
        | "ENABLE"
        | "DISABLE"
        | "ACCEPT"
        | "EXPIRED"
        | "PUSH_USER"
        | "PUSH_GROUP"
        | "VERIFY"
        | "JOIN_WAITLIST"
        | "INVITE"
        | "JOIN"
        | "LEAVE"
        | "RESEND"
        | "MIGRATE_AUTH_PROVIDER";
      /**
       * The value of `target.property`` prior to the event.
       */
      old?: /* The value of `target.property`` prior to the event. */
      | string
        | number
        | number
        | boolean
        | any[]
        | {
            [key: string]: any;
          };
      /**
       * The value of `target.property` after the event.
       */
      new?: /* The value of `target.property` after the event. */
      | string
        | number
        | number
        | boolean
        | any[]
        | {
            [key: string]: any;
          };
      /**
       * Additional information about the event, such as a client-provided reason, if it exists.
       */
      actionDetails?: string;
      /**
       * Provided when the configuration change failed to be completed. It is a user-presentable reason for the failure.
       */
      error?: string;
    }
    export interface ConnectionCounts {
      /**
       * IP protocol name (or number if no name used).
       * example:
       * ipv4
       */
      proto?: "ah" | "dccp" | "egp" | "esp" | "gre" | "icmp" | "igmp" | "igp" | "ipv4" | "ipv6-icmp" | "sctp" | "tcp" | "udp";
      /**
       * Source addr:port.
       * example:
       * 108.86.185.125:52343
       */
      src?: string;
      /**
       * Destination addr:port.
       * example:
       * 108.86.185.126:443
       */
      dst?: string;
      /**
       * Number of packets sent.
       * example:
       * 10
       */
      txPkts?: number;
      /**
       * Number of bytes sent.
       * example:
       * 1000
       */
      txBytes?: number;
      /**
       * Number of packets received.
       * example:
       * 10
       */
      rxPkts?: number;
      /**
       * Number of bytes received.
       * example:
       * 1000
       */
      rxBytes?: number;
    }
    /**
     * A tailnet contact.
     * example:
     * {
     *   "email": "user@example.com",
     *   "fallbackEmail": "otheruser@example.com\"",
     *   "needsVerification": true
     * }
     */
    export interface Contact {
      /**
       * The contact's email address.
       * example:
       * user@example.com
       */
      email?: string;
      /**
       * The email address used when contact's email address has not been verified.
       * example:
       * otheruser@example.com
       */
      fallbackEmail?: string;
      /**
       * Indicates whether the contact's email address still needs to be verified.
       * example:
       * true
       */
      needsVerification?: boolean;
    }
    /**
     * A Tailscale device (sometimes referred to as *node* or *machine*), is any computer or mobile device that joins a tailnet.
     *
     * Each device has a unique ID (`nodeId` in the schema below) that is used to identify the device in API calls.
     * This ID can be found by going to the [Machines](https://login.tailscale.com/admin/machines) page in the admin console,
     * selecting the relevant device, then finding the ID in the Machine Details section.
     * You can also [list all devices](#tag/devices/get/tailnet/{tailnet}/devices) in the tailnet to get their `nodeId` values.
     *
     */
    export interface Device {
      /**
       * A list of Tailscale IP addresses for the device,
       * including both IPv4 (formatted as 100.x.y.z)
       * and IPv6 (formatted as fd7a:115c:a1e0:a:b:c:d:e) addresses.
       *
       */
      addresses?: string[];
      /**
       * The legacy identifier for a device; you
       * can supply this value wherever {deviceId} is indicated in the
       * endpoint. Note that although "id" is still accepted, "nodeId" is
       * preferred.
       *
       * example:
       * 92960230385
       */
      id?: string;
      /**
       * The preferred identifier for a device;
       * supply this value wherever {deviceId} is indicated in the endpoint.
       *
       * example:
       * n292kg92CNTRL
       */
      nodeId?: string;
      /**
       * The user who registered the node. For untagged nodes,
       *  this user is the device owner.
       *
       * example:
       * amelie@example.com
       */
      user?: string;
      /**
       * The MagicDNS name of the device.
       * Learn more about MagicDNS at https://tailscale.com/kb/1081/.
       *
       * example:
       * pangolin.tailfe8c.ts.net
       */
      name?: string;
      /**
       * The machine name in the admin console.
       * Learn more about machine names at https://tailscale.com/kb/1098/.
       *
       * example:
       * pangolin
       */
      hostname?: string;
      /**
       * The version of the Tailscale client
       * software; this is empty for external devices.
       *
       * example:
       * v1.36.0
       */
      clientVersion?: string;
      /**
       * 'true' if a Tailscale client version
       * upgrade is available. This value is empty for external devices.
       *
       * example:
       * false
       */
      updateAvailable?: boolean;
      /**
       * The operating system that the device is running.
       *
       * example:
       * linux
       */
      os?: string;
      /**
       * The date on which the device was added
       * to the tailnet; this is empty for external devices.
       *
       * example:
       * 2022-12-01T05:23:30Z
       */
      created?: string; // date-time
      /**
       * When device was last active on the tailnet.
       *
       * example:
       * 2022-12-01T05:23:30Z
       */
      lastSeen?: string; // date-time
      /**
       * 'true' if the keys for the device will not expire.
       * Learn more at https://tailscale.com/kb/1028/.
       *
       * example:
       * false
       */
      keyExpiryDisabled?: boolean;
      /**
       * The expiration date of the device's auth key.
       * Learn more about key expiry at https://tailscale.com/kb/1028/.
       *
       * example:
       * 2023-05-30T04:44:05Z
       */
      expires?: string; // date-time
      /**
       * 'true' if the device has been authorized to join the tailnet; otherwise, 'false'.
       * Learn more about device authorization at https://tailscale.com/kb/1099/.
       *
       * example:
       * false
       */
      authorized?: boolean;
      /**
       * 'true', indicates that a device is not a member of the tailnet, but is shared in to the tailnet;
       * if 'false', the device is a member of the tailnet.
       * Learn more about node sharing at https://tailscale.com/kb/1084/.
       *
       * example:
       * false
       */
      isExternal?: boolean;
      /**
       * 'true', indicates that multiple devices are currently connected using the same node key, which is usually a sign of node state being copied between machines.
       * If only one device is connected using this node's key, the field is omitted.
       * If the number of live connections goes back to 0 or 1, this field is also omitted, meaning it's not sticky. In case an attacker steals node state from a legitimate node, they can mask their activities by not connecting concurrently with the legitimate node.
       *
       * example:
       * true
       */
      multipleConnections?: boolean;
      /**
       * For internal use and is not required for any API operations.
       * This value is empty for external devices.
       *
       * example:
       *
       */
      machineKey?: string;
      /**
       * Mostly for internal use, required for select operations, such as adding a node to a locked tailnet.
       * Learn about tailnet locks at https://tailscale.com/kb/1226/.
       *
       * example:
       * nodekey:01234567890abcdef
       */
      nodeKey?: string;
      /**
       * 'true' if the device is not allowed to accept any connections over Tailscale, including pings.
       * Learn more in the "Allow incoming connections" section of https://tailscale.com/kb/1072/.
       *
       * example:
       * false
       */
      blocksIncomingConnections?: boolean;
      /**
       * The subnet routes for this device that have been approved by a tailnet admin.
       * Learn more about subnet routes at https://tailscale.com/kb/1019/.
       *
       * example:
       * [
       *   "10.0.0.0/16",
       *   "192.168.1.0/24"
       * ]
       */
      enabledRoutes?: string[];
      /**
       * The subnets this device requests to expose.
       * Learn more about subnet routes at https://tailscale.com/kb/1019/.
       *
       * example:
       * [
       *   "10.0.0.0/16",
       *   "192.168.1.0/24"
       * ]
       */
      advertisedRoutes?: string[];
      /**
       * clientConnectivity provides a report on the device's current physical network conditions.
       *
       * example:
       * {
       *   "endpoints": [
       *     "199.9.14.201:59128",
       *     "192.68.0.21:59128"
       *   ],
       *   "latency": {
       *     "Dallas": {
       *       "latencyMs": 60.463043
       *     },
       *     "New York City": {
       *       "preferred": true,
       *       "latencyMs": 31.323811
       *     }
       *   },
       *   "mappingVariesByDestIP": false,
       *   "clientSupports": {
       *     "hairPinning": false,
       *     "ipv6": false,
       *     "pcp": false,
       *     "pmp": false,
       *     "udp": false,
       *     "upnp": false
       *   }
       * }
       */
      clientConnectivity?: {
        /**
         * Client's magicsock UDP IP:port endpoints (IPv4 or IPv6).
         *
         * example:
         * [
         *   "199.9.14.201:59128",
         *   "192.68.0.21:59128"
         * ]
         */
        endpoints?: string[];
        /**
         * 'true' if the host's NAT mappings vary based on the destination IP.
         *
         * example:
         * false
         */
        mappingVariesByDestIP?: boolean;
        /**
         * Map of DERP server locations and their current latency.
         * example:
         * {
         *   "Dallas": {
         *     "latencyMs": 60.463043
         *   },
         *   "New York City": {
         *     "preferred": true,
         *     "latencyMs": 31.323811
         *   }
         * }
         */
        latency?: {
          [name: string]: {
            /**
             * 'true' for the node's preferred DERP server for incoming traffic.
             *
             */
            preferred?: boolean;
            /**
             * Current latency to DERP server.
             *
             */
            latencyMs?: number; // float
          };
        };
        /**
         * Identifies features supported by the client.
         *
         */
        clientSupports?: {
          /**
           * 'true' if your router can route connections
           * from endpoints on your LAN back to your LAN using those endpoints’
           * globally-mapped IPv4 addresses/ports.
           *
           * example:
           * false
           */
          hairPinning?: boolean;
          /**
           * 'true' if the device OS supports IPv6,
           * regardless of whether IPv6 internet connectivity is available.
           *
           * example:
           * false
           */
          ipv6?: boolean;
          /**
           * 'true' if PCP port-mapping service exists on your router.
           *
           * example:
           * false
           */
          pcp?: boolean;
          /**
           * 'true' if NAT-PMP port-mapping service exists on your router.
           *
           * example:
           * false
           */
          pmp?: boolean;
          /**
           * 'true' if UDP traffic is enabled on the current network;
           * if 'false', Tailscale may be unable to make direct connections, and will rely on our DERP servers.
           *
           * example:
           * false
           */
          udp?: boolean;
          /**
           * 'true' if UPnP port-mapping service exists on your router.
           *
           * example:
           * false
           */
          upnp?: boolean;
        };
      };
      /**
       * Lets you assign an identity to a device that is separate from human users, and use it as part of an ACL to restrict access.
       * Once a device is tagged, the tag is the owner of that device.
       * A single node can have multiple tags assigned.
       * This value is empty for external devices.
       * Learn more about tags at https://tailscale.com/kb/1068/.
       *
       * example:
       * [
       *   "tag:golink"
       * ]
       */
      tags?: string[];
      /**
       * Indicates an issue with the tailnet lock node-key signature on this device.
       * This field is only populated when tailnet lock is enabled.
       *
       * example:
       *
       */
      tailnetLockError?: string;
      /**
       * The node's tailnet lock key.
       * Every node generates a tailnet lock key (so the value will be present) even if tailnet lock is not enabled.
       * Learn more about tailnet lock at https://tailscale.com/kb/1226/.
       *
       * example:
       *
       */
      tailnetLockKey?: string;
      /**
       * > ⓘ This field is available for [Enterprise plans](/pricing).
       *
       * Contains extra identifiers from the device when the tailnet it is connected to has device posture identification collection enabled.
       * If the device has not opted-in to posture identification collection, this will contain {"disabled": true}.
       * Learn more about posture identity at https://tailscale.com/kb/1326/device-identity.
       *
       * example:
       * {
       *   "serialNumbers": [
       *     "CP74LFQJXM"
       *   ]
       * }
       */
      postureIdentity?: {
        /**
         * example:
         * [
         *   "CP74LFQJXM"
         * ]
         */
        serialNumbers?: string[];
        disabled?: boolean;
      };
      /**
       * 'true' if the device is ephemeral.
       * Learn more about ephemeral nodes at https://tailscale.com/kb/1111/ephemeral-nodes.
       *
       * example:
       * false
       */
      isEphemeral?: boolean;
    }
    /**
     * A device invite is an invitation that shares a device with an external
     * user (a user not in the device's tailnet).
     *
     * Each device invite has a unique ID that is used to identify the invite
     * in API calls. You can find all device invite IDs for a particular device
     * by [listing all device invites](#tag/deviceinvites/POST/device/{deviceId}/device-invites)
     * for a device.
     *
     */
    export interface DeviceInvite {
      /**
       * The unique identifier for the invite.
       * Supply this value wherever {deviceInviteId} is indicated in the endpoint.
       *
       * example:
       * 12346
       */
      id?: string;
      /**
       * The creation time of the invite.
       *
       * example:
       * 2024-04-03T21:38:49.333829261Z
       */
      created?: string; // date-time
      /**
       * The ID of the tailnet to which the shared device belongs.
       *
       * example:
       * 59954
       */
      tailnetId?: number;
      /**
       * The ID of the device being shared.
       *
       * example:
       * 11055
       */
      deviceId?: number;
      /**
       * The ID of the user who created the share invite.
       *
       * example:
       * 22012
       */
      sharerId?: number;
      /**
       * Specifies whether this device invite can be accepted
       * more than once.
       *
       * example:
       * false
       */
      multiUse?: boolean;
      /**
       * Specifies whether the invited user is able to use the
       * device as an exit node when the device is advertising as one.
       *
       * example:
       * false
       */
      allowExitNode?: boolean;
      /**
       * The email to which the invite was sent.
       * If empty, the invite was not emailed to anyone,
       * but the inviteUrl can be shared manually.
       *
       * example:
       * user@example.com
       */
      email?: string;
      /**
       * The last time the invite was attempted to be sent to Email.
       * Only ever set if `email` is not empty.
       *
       * example:
       * 2024-04-03T21:38:49.333829261Z
       */
      lastEmailSentAt?: string; // date-time
      /**
       * The link to accept the invite.
       * Anyone with this link can accept the invite.
       * It is not restricted to the person to which the invite was emailed.
       *
       * example:
       * https://login.tailscale.com/admin/invite/<code>
       */
      inviteUrl?: string;
      /**
       * `true` when the share invite has been accepted.
       *
       * example:
       * false
       */
      accepted?: boolean;
      /**
       * Set when the invite has been accepted.
       * It holds information about the user who accepted the share invite.
       *
       */
      acceptedBy?: {
        /**
         * The ID of the user who accepted the share invite.
         *
         * example:
         * 33223
         */
        id?: number;
        /**
         * The login name of the user who accepted the share invite.
         *
         * example:
         * someone@example.com
         */
        loginName?: string;
        /**
         * The profile pic URL for the user who accepted the share invite.
         *
         * example:
         *
         */
        profilePicUrl?: string;
      };
    }
    /**
     * example:
     * {
     *   "attributes": {
     *     "custom:myScore": 80,
     *     "custom:diskEncryption": true,
     *     "custom:myAttribute": "my_value",
     *     "node:os": "linux",
     *     "node:osVersion": "5.19.0-42-generic",
     *     "node:tsReleaseTrack": "stable",
     *     "node:tsVersion": "1.40.0",
     *     "node:tsAutoUpdate": false,
     *     "node:tsStateEncrypted": false
     *   },
     *   "expiries": {
     *     "custom:myScore": "2024-04-23T18:25:43.511Z"
     *   }
     * }
     */
    export interface DevicePostureAttributes {
      /**
       * Contains all the posture attributes assigned to a node.
       * Attribute values can be strings, numbers or booleans.
       *
       */
      attributes?: {
        [name: string]: string | number | boolean;
      };
      /**
       * Contains the expiry time for each posture attribute, if set.
       *
       */
      expiries?: {
        [name: string]: string; // date-time
      };
    }
    export interface DeviceRoutes {
      /**
       * The subnets this device requests to expose.
       *
       * example:
       * [
       *   "10.0.0.0/16",
       *   "192.168.1.0/24"
       * ]
       */
      advertisedRoutes?: string[];
      /**
       * The subnet routes for this device that have been approved by a tailnet admin.
       *
       * example:
       * [
       *   "10.0.0.0/16",
       *   "192.168.1.0/24"
       * ]
       */
      enabledRoutes?: string[];
    }
    export interface DnsPreferences {
      /**
       * Whether MagicDNS is active for this tailnet.
       *
       * example:
       * true
       */
      magicDNS: boolean;
    }
    export interface DnsSearchPaths {
      /**
       * The search domains for the given tailnet.
       *
       * example:
       * [
       *   "user1.example.com",
       *   "user2.example.com"
       * ]
       */
      searchPaths: string[];
    }
    export interface Error {
      message: string;
    }
    /**
     * An API access token or Auth Key.
     *
     */
    export interface Key {
      /**
       * example:
       * k123456CNTRL
       */
      id?: string;
      /**
       * The secret key material (only populated at creation time).
       * example:
       * tskey-auth-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       */
      key?: string;
      /**
       * The type of key. Can be one of "auth", "client" or "api".
       * - "auth" refers to machine auth keys.
       * - "client" refers to OAuth clients.
       * - "api" refers to personal API access tokens or tokens generated using an OAuth client.
       *
       * example:
       * auth
       */
      keyType?: string;
      /**
       * Duration in seconds until the key expires.
       * Only applies to auth keys.
       *
       * example:
       * 7776000
       */
      expirySeconds?: number;
      /**
       * example:
       * 2021-12-09T23:22:39Z
       */
      created?: string; // date-time
      /**
       * example:
       * 2022-03-09T23:22:39Z
       */
      expires?: string; // date-time
      /**
       * example:
       * 2022-03-12T23:22:39Z
       */
      revoked?: string; // date-time
      capabilities?: /**
       * `capabilities` is a mapping of resources to permissible actions.
       *
       */
      KeyCapabilities;
      /**
       * A list of scopes granted to the key.
       * Only applies to OAuth clients and API access tokens.
       *
       */
      scopes?: string[];
      /**
       * A list of tags associated to the OAuth client.
       * Auth keys created with this client must have these exact tags, or tags owned by the client's tags.
       * Mandatory if the scopes include "devices:core" or "auth_keys".
       * Only applies to OAuth clients.
       *
       */
      tags?: string[];
      /**
       * example:
       * dev access
       */
      description?: string;
      /**
       * Response for a revoked (deleted) or expired key will have an `invalid` field set to true.
       *
       * example:
       * false
       */
      invalid?: boolean;
      /**
       * ID of the user who created this key, empty for keys created by OAuth clients.
       *
       * example:
       * uscwcTtzzo11DEVEL
       */
      userId?: string;
    }
    /**
     * `capabilities` is a mapping of resources to permissible actions.
     *
     */
    export interface KeyCapabilities {
      /**
       * `devices` specifies the key's permissions over devices.
       * This field is only populated for auth keys.
       *
       */
      devices?: {
        /**
         * `create` specifies the key's permissions when creating devices.
         *
         */
        create?: {
          /**
           * reusable for auth keys only; reusable auth keys can be used multiple times to register different devices.
           * Learn more about reusable auth keys at https://tailscale.com/kb/1085/#types-of-auth-keys.
           *
           * example:
           * true
           */
          reusable?: boolean;
          /**
           * ephemeral for auth keys only; ephemeral keys are used to connect and then clean up short-lived devices.
           * Learn about ephemeral nodes at https://tailscale.com/kb/1111/.
           *
           * example:
           * false
           */
          ephemeral?: boolean;
          /**
           * preauthorized for auth keys only; these are also referred to as "pre-approved" keys. 'true' means that devices
           * registered with this key won't require additional approval from a tailnet admin.
           * Learn about device approval at https://tailscale.com/kb/1099/.
           *
           * example:
           * true
           */
          preauthorized?: boolean;
          /**
           * tags are the tags that will be set on devices registered with this key.
           * Learn about tags at https://tailscale.com/kb/1068/.
           *
           * Whether tags are required or optional depends on the owner of the auth key:
           * - When creating an auth key owned by the tailnet (using OAuth), it must have tags. The auth tags specified for that new auth key must exactly match the tags that are on the OAuth client used to create that auth key (or they must be tags that are owned by the tags that are on the OAuth client used to create the auth key).
           * - When creating an auth key owned by a user (using a user's access token), tags are optional.
           *
           */
          tags?: string[];
        };
      };
    }
    /**
     * The type of log for logging endpoints.
     *
     * example:
     * configuration
     */
    export type LogType = "configuration" | "network";
    /**
     * The current configuration of a log streaming endpoint.
     * example:
     * {
     *   "logType": "configuration",
     *   "destinationType": "elastic",
     *   "url": "http://100.71.134.73:80/config-log-datastream",
     *   "user": "myusername"
     * }
     */
    export interface LogstreamEndpointConfiguration {
      /**
       * The type of log that is streamed to this endpoint.
       */
      logType?: /**
       * The type of log for logging endpoints.
       *
       * example:
       * configuration
       */
      LogType;
      /**
       * The type of system to which logs are being streamed.
       * example:
       * elastic
       */
      destinationType?: "splunk" | "elastic" | "panther" | "cribl" | "datadog" | "axiom" | "s3";
      /**
       * The URL to which log streams are being posted. If the DestinationType is `s3`, the URL may be (and often is) empty to use the official Amazon S3 endpoint.
       * example:
       * http://100.71.134.73:80/config-log-datastream
       */
      url?: string;
      /**
       * The username with which log streams to this endpoint are authenticated.
       * example:
       * myusername
       */
      user?: string;
      /**
       * An optional number of minutes to wait in between uploading new logs. If the quantity of logs does not fit within a single upload, multiple uploads will be made.
       * example:
       * 5
       */
      uploadPeriodMinutes?: number;
      /**
       * The compression algorithm with which to compress logs. `none` disables compression. Defaults to `none`.
       * example:
       * zstd
       */
      compressionFormat?: "zstd" | "gzip" | "none";
      /**
       * The token/password with which log streams to this endpoint should be authenticated.
       * example:
       * mytoken
       */
      token?: string;
      /**
       * The S3 bucket name. Required if the destinationType is `s3`.
       * example:
       * mycompany-mybucket
       */
      s3Bucket?: string;
      /**
       * The region in which the S3 bucket is located. Required if the destinationType is `s3`.
       * example:
       * us-east-1
       */
      s3Region?: string;
      /**
       * An optional S3 key prefix to prepend to the auto-generated S3 key name.
       */
      s3KeyPrefix?: string;
      /**
       * What type of authentication to use for S3. Required if the destinationType is `s3`. Tailscale recommends using `rolearn`. See [Amazon documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html).
       */
      s3AuthenticationType?: "accesskey" | "rolearn";
      /**
       * The S3 access key ID. Required if the destinationType is `s3` and `authenticationType` is `accesskey`.
       */
      s3AccessKeyId?: string;
      /**
       * The S3 secret access key. Required if the destinationType is `s3` and `authenticationType` is `accesskey`.
       */
      s3SecretAccessKey?: string;
      /**
       * The Role ARN that Tailscale should supply to AWS when authenticating using role-based authentication. Required if the destinationType is `s3` and `authenticationType` is `rolearn`.
       */
      s3RoleArn?: string;
      /**
       * The AWS external id that Tailscale supplies when authenticating using role-based authentication. Populated if the destinationType is `s3` and `authenticationType` is `rolearn`. This corresponds to the `externalId` field obtained from [tailnet/{tailnet}/aws-external-id](#tag/logging/POST/tailnet/{tailnet}/aws-external-id).
       */
      s3ExternalId?: string;
    }
    /**
     * Latest status of log stream publishing for a specific type of log.
     * example:
     * {
     *   "lastActivity": "2024-06-10T15:42:13.984555636Z",
     *   "lastError": "",
     *   "maxBodySize": 524288,
     *   "numBytesSent": 17238983,
     *   "numEntriesSent": 8363,
     *   "numFailedRequests": 5434,
     *   "numSpoofedEntries": 0,
     *   "numTotalRequests": 10610,
     *   "rateBytesSent": 3.524073767296142,
     *   "rateEntriesSent": 0.008564949767446907,
     *   "rateFailedRequests": 4.1431119220540763e-157,
     *   "rateTotalRequests": 0.0037038341100629453
     * }
     */
    export interface LogstreamEndpointPublishingStatus {
      /**
       * Timestamp of the most recent publishing activity, in RFC 3339 format.
       * example:
       * 2024-06-10T15:42:13.984555636Z
       */
      lastActivity: string;
      /**
       * The most recent error (if any).
       * example:
       * Something went wrong.
       */
      lastError: string;
      /**
       * The size of the largest single request body.
       * example:
       * 524288
       */
      maxBodySize: number;
      /**
       * Total bytes published across all requests.
       * example:
       * 17238983
       */
      numBytesSent: number;
      /**
       * The total number of entries published.
       * example:
       * 8363
       */
      numEntriesSent: number;
      /**
       * The number of spoofed entries published. A spoofed entry is one that failed to validate because we did not see receive a matching flow log from the other side of the connection.
       * example:
       * 0
       */
      numSpoofedEntries: number;
      /**
       * The total number of requests made to the streaming endpoint.
       * example:
       * 10610
       */
      numTotalRequests: number;
      /**
       * The total number of requests to the streaming endpoint that have failed.
       * example:
       * 5434
       */
      numFailedRequests: number;
      /**
       * The exponentially weighted moving average rate at which data is being streamed to the endpoint, in bytes per second.
       * example:
       * 3.524073767296142
       */
      rateBytesSent: number;
      /**
       * The exponentially weighted moving average rate at which entries are being sent to the endpoint, in entries per second.
       * example:
       * 0.008564949767446907
       */
      rateEntriesSent: number;
      /**
       * The exponentially weighted moving average rate at which requests are being made to the endpoint, in requests per second.
       * example:
       * 0.0037038341100629453
       */
      rateTotalRequests: number;
      /**
       * The exponentially weighted moving average rate at which requests are failing, in requests per second.
       * example:
       * 4.1431119220540763e-157
       */
      rateFailedRequests: number;
    }
    /**
     * example:
     * {
     *   "logged": "2024-06-06T15:27:26.583893Z",
     *   "nodeId": "nBLYviWLGB21DEVEL",
     *   "start": "2024-06-06T15:25:26.583893Z",
     *   "end": "2024-06-06T15:26:26.583893Z",
     *   "virtualTraffic": [
     *     {
     *       "proto": "ipv4",
     *       "src": "108.86.185.125:52343",
     *       "dst": "108.86.185.126:443",
     *       "txPkts": 10,
     *       "txBytes": 10000,
     *       "rxPkts": 10,
     *       "rxBytes": 10000
     *     }
     *   ],
     *   "subnetTraffic": [
     *     {
     *       "proto": "ipv4",
     *       "src": "108.86.185.125:52343",
     *       "dst": "108.86.185.126:443",
     *       "txPkts": 10,
     *       "txBytes": 10000,
     *       "rxPkts": 10,
     *       "rxBytes": 10000
     *     }
     *   ],
     *   "exitTraffic": [
     *     {
     *       "proto": "ipv4",
     *       "src": "108.86.185.125:52343",
     *       "dst": "108.86.185.126:443",
     *       "txPkts": 10,
     *       "txBytes": 10000,
     *       "rxPkts": 10,
     *       "rxBytes": 10000
     *     }
     *   ],
     *   "physicalTraffic": [
     *     {
     *       "proto": "ipv4",
     *       "src": "108.86.185.125:52343",
     *       "dst": "108.86.185.126:443",
     *       "txPkts": 10,
     *       "txBytes": 10000,
     *       "rxPkts": 10,
     *       "rxBytes": 10000
     *     }
     *   ]
     * }
     */
    export interface NetworkFlowLog {
      /**
       * Timestamp of the flow log, in RFC 3339 format.
       * example:
       * 2024-06-06T15:27:26.583893Z
       */
      logged?: string;
      /**
       * Identifier of the node.
       * example:
       * nBLYviWLGB21DEVEL
       */
      nodeId?: string;
      /**
       * Time at which flow started, in RFC 3339 format.
       * example:
       * 2024-06-06T15:25:26.583893Z
       */
      start?: string;
      /**
       * Time at which flow ended, in RFC 3339 format.
       * example:
       * 2024-06-06T15:26:26.583893Z
       */
      end?: string;
      virtualTraffic?: ConnectionCounts[];
      subnetTraffic?: ConnectionCounts[];
      exitTraffic?: ConnectionCounts[];
      physicalTraffic?: ConnectionCounts[];
    }
    /**
     * A configured PostureIntegration.
     * example:
     * {
     *   "id": "p56wQiqrn7mfDEVEL",
     *   "provider": "intune",
     *   "cloudId": "global",
     *   "clientId": "93013672-b00c-4344-80ca-7ecf74f9dce1",
     *   "tenantId": "d1ae389b-5207-43a2-afca-2de6b03ac7e3",
     *   "configUpdated": "2024-06-18T13:44:28.250168Z",
     *   "status": {
     *     "error": "Invalid Tenant ID.\nMicrosoft error: AADSTS90002: Tenant 'd1ae389b-5207-43a2-afca-2de6b03ac7e3' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud. Check with your subscription administrator, this may happen if there are no active subscriptions for the tenant. Trace ID: f6237360-98a2-4889-913b-e3d80aba7d00 Correlation ID: a2024a6e-7757-4406-8a8d-1b6ac2e03ad5 Timestamp: 2024-06-18 13:44:33Z",
     *     "lastSync": "2024-06-18T08:44:33.872282-05:00",
     *     "matchedCount": 0,
     *     "possibleMatchedCount": 0,
     *     "providerHostCount": 0
     *   }
     * }
     */
    export interface PostureIntegration {
      /**
       * The device posture provider.
       *
       * Required on POST requests, ignored on PATCH requests.
       *
       * example:
       * falcon
       */
      provider?: "falcon" | "intune" | "jamfpro" | "kandji" | "kolide" | "sentinelone";
      /**
       * Identifies which of the provider's clouds to integrate with.
       *
       * - For CrowdStrike Falcon, it will be one of `us-1`, `us-2`, `eu-1` or `us-gov`.
       * - For Microsoft Intune, it will be one of `global` or `us-gov`.
       * - For Jamf Pro, Kandji and Sentinel One, it is the FQDN of your subdomain, for example `mydomain.sentinelone.net`.
       * - For Kolide, this is left blank.
       *
       * example:
       * us-1
       */
      cloudId?: string;
      /**
       * Unique identifier for your client.
       *
       * - For Microsoft Intune, it will be your application's UUID.
       * - For CrowdStrike Falcon and Jamf Pro, it will be your client id.
       * - For Kandji, Kolide and Sentinel One, this is left blank.
       *
       * example:
       * us-1
       */
      clientId?: string;
      /**
       * The Microsoft Intune directory (tenant) ID. For other providers, this is left blank.
       * example:
       * d1ae389b-5207-43a2-afca-2de6b03ac7e3
       */
      tenantId?: string;
      /**
       * The secret (auth key, token, etc.) used to authenticate with the provider.
       *
       * Required when creating a new integration, may be omitted when updating an existing integration, in which case we retain the existing password.
       *
       * example:
       * as32598d#@%asdf
       */
      clientSecret?: string;
      /**
       * A unique identifier for the integration (generated by the system).
       * example:
       * pcBEPQVMpki7DEVEL
       */
      id?: string;
      /**
       * Timestamp of the last time this configuration was updated, in RFC 3339 format.
       * example:
       * 2024-06-18T13:43:43.239839Z
       */
      configUpdated?: string;
      /**
       * Most recent status for this integration.
       */
      status?: {
        /**
         * Timestamp of the last synchronization with the device posture provider, in RFC 3339 format.
         * example:
         * 2024-06-18T08:44:33.872282-05:00
         */
        lastSync?: string;
        /**
         * If the last synchronization failed, this shows the error message associated with the failed synchronization.
         * example:
         * Invalid Tenant ID.
         * Microsoft error: AADSTS90002: Tenant 'd1ae389b-5207-43a2-afca-2de6b03ac7e3' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud. Check with your subscription administrator, this may happen if there are no active subscriptions for the tenant. Trace ID: f6237360-98a2-4889-913b-e3d80aba7d00 Correlation ID: a2024a6e-7757-4406-8a8d-1b6ac2e03ad5 Timestamp: 2024-06-18 13:44:33Z
         */
        error?: string;
        /**
         * The number of devices known to the provider.
         * example:
         * 98
         */
        providerHostCount?: number;
        /**
         * The number of Tailscale nodes that were matched with provider.
         * example:
         * 11
         */
        matchedCount?: number;
        /**
         * The number of Tailscale nodes with identifiers for matching.
         * example:
         * 16
         */
        possibleMatchedCount?: number;
      };
    }
    /**
     * The provider type for the webhook destination, or an empty string if none are applicable.
     * Outgoing webhook events are sent in the format expected by the provider type if non-empty.
     *
     * example:
     * slack
     */
    export type ProviderType = "slack" | "mattermost" | "googlechat" | "discord";
    /**
     * Map of domain names to lists of nameservers or to `null`.
     *
     * example:
     * {
     *   "example.com": [
     *     "1.1.1.1",
     *     "1.2.3.4"
     *   ],
     *   "other.com": [
     *     "2.2.2.2"
     *   ]
     * }
     */
    export interface SplitDns {
      [name: string]: string[] | null;
    }
    /**
     * The list of subscribed events that trigger POST requests to the configured endpoint URL.
     * Learn more about [webhook events](/kb/1213/webhooks#events).
     *
     * example:
     * [
     *   "nodeCreated",
     *   "userDeleted"
     * ]
     */
    export type Subscriptions = (
      | "nodeCreated"
      | "nodeNeedsApproval"
      | "nodeApproved"
      | "nodeKeyExpiringInOneDay"
      | "nodeKeyExpired"
      | "nodeDeleted"
      | "nodeSigned"
      | "nodeNeedsSignature"
      | "policyUpdate"
      | "userCreated"
      | "userNeedsApproval"
      | "userSuspended"
      | "userRestored"
      | "userDeleted"
      | "userApproved"
      | "userRoleUpdated"
      | "subnetIPForwardingNotEnabled"
      | "exitNodeIPForwardingNotEnabled"
    )[];
    /**
     * Settings for a tailnet.
     *
     */
    export interface TailnetSettings {
      /**
       * Prevents users from editing policies in the admin console to avoid conflicts with external management workflows like GitOps or Terraform.
       *
       * example:
       * false
       */
      aclsExternallyManagedOn?: boolean;
      /**
       * Link to the external tailnet policy definition or management solution for this tailnet.
       *
       * example:
       * https://github.com/example/tailnet-policy
       */
      aclsExternalLink?: string; // uri
      /**
       * Whether [device approval](/kb/1099/device-approval) is enabled for the tailnet.
       *
       * example:
       * false
       */
      devicesApprovalOn?: boolean;
      /**
       * Whether [auto updates](/kb/1067/update#auto-updates) are enabled for devices that belong to this tailnet.
       *
       * example:
       * false
       */
      devicesAutoUpdatesOn?: boolean;
      /**
       * The [key expiry](/kb/1028/key-expiry) duration for devices on this tailnet.
       *
       * example:
       * 180
       */
      devicesKeyDurationDays?: number;
      /**
       * Whether [user approval](/kb/1239/user-approval) is enabled for this tailnet.
       *
       * example:
       * true
       */
      usersApprovalOn?: boolean;
      /**
       * Which user roles are allowed to [join external tailnets](/kb/1271/invite-any-user).
       *
       * example:
       * admin
       */
      usersRoleAllowedToJoinExternalTailnets?: "none" | "admin" | "member";
      /**
       * Whether [network flog logs](/kb/1219/network-flow-logs) are enabled for the tailnet.
       *
       * example:
       * false
       */
      networkFlowLoggingOn?: boolean;
      /**
       * Whether [regional routing](/kb/1115/high-availability#regional-routing) is enabled for the tailnet.
       *
       * example:
       * false
       */
      regionalRoutingOn?: boolean;
      /**
       * Whether [identity collection](/kb/1326/device-identity) is enabled for [device posture](/kb/1288/device-posture) integrations for the tailnet.
       *
       * example:
       * false
       */
      postureIdentityCollectionOn?: boolean;
    }
    /**
     * Representation of a user within a tailnet.
     *
     */
    export interface User {
      /**
       * The unique identifier for the user.
       * Supply this value wherever {userId} is indicated in an endpoint.
       *
       * example:
       * 123456
       */
      id?: string;
      /**
       * The name of the user.
       *
       * example:
       * Some User
       */
      displayName?: string;
      /**
       * The emailish login name of the user.
       *
       * example:
       * someuser@example.com
       */
      loginName?: string;
      /**
       * The profile pic URL for the user.
       *
       * example:
       *
       */
      profilePicUrl?: string;
      /**
       * The tailnet that owns the user.
       *
       * example:
       * example.com
       */
      tailnetId?: string;
      /**
       * The time the user joined their tailnet.
       *
       * example:
       * 2022-12-01T05:23:30Z
       */
      created?: string; // date-time
      /**
       * The type of relation this user has to the tailnet associated with the request.
       *
       * example:
       * member
       */
      type?: "member" | "shared";
      /**
       * The role of the user. Learn more about [user roles](kb/1138/user-roles).
       *
       * example:
       * member
       */
      role?: "owner" | "member" | "admin" | "it-admin" | "network-admin" | "billing-admin" | "auditor";
      /**
       * The status of the user.
       *
       * example:
       * active
       */
      status?: "active" | "idle" | "suspended" | "needs-approval" | "over-billing-limit";
      /**
       * Number of devices the user owns.
       *
       * example:
       * 4
       */
      deviceCount?: number;
      /**
       * The later of either:
       * - The last time any of the user's nodes were connected to the network.
       * - The last time the user authenticated to any tailscale service, including the admin panel.
       *
       * example:
       * 2022-12-01T05:23:30Z
       */
      lastSeen?: string; // date-time
      /**
       * `true` when the user has a node currently connected to the control server.
       *
       * example:
       * true
       */
      currentlyConnected?: boolean;
    }
    /**
     * A user invite is an active invitation that lets a user join a tailnet
     * with a preassigned [user role](https://tailscale.com/kb/1138/user-roles).
     *
     * Each user invite has a unique ID that is used to identify the invite
     * in API calls. You can find all user invite IDs for a particular tailnet
     * by [listing user invites](#tag/userinvites/get/tailnet/{tailnet}/user-invites).
     *
     */
    export interface UserInvite {
      /**
       * The unique identifier for the invite.
       * Supply this value wherever `userInviteId` is indicated in the endpoint.
       *
       * example:
       * 12346
       */
      id: string;
      /**
       * The tailnet user role to assign to the invited user upon accepting the invite.
       *
       * example:
       * admin
       */
      role: "member" | "admin" | "it-admin" | "network-admin" | "billing-admin" | "auditor";
      /**
       * The ID of the tailnet to which the user was invited.
       *
       * example:
       * 59954
       */
      tailnetId: number;
      /**
       * The ID of the user who created the invite.
       *
       * example:
       * 22012
       */
      inviterId: number;
      /**
       * The email to which the invite was sent.
       * If empty, the invite was not emailed to anyone,
       * but the inviteUrl can be shared manually.
       *
       * example:
       * user@example.com
       */
      email?: string;
      /**
       * The last time the invite was attempted to be sent to Email.
       * Only ever set if `email` is not empty.
       *
       * example:
       * 2024-04-03T21:38:49.333829261Z
       */
      lastEmailSentAt?: string; // date-time
      /**
       * Included when `email` is not part of the tailnet's domain,
       * or when `email` is empty. It is the link to accept the invite.
       *
       * When included, anyone with this link can accept the invite.
       * It is not restricted to the person to which the invite was emailed.
       *
       * When `email` is part of the tailnet's domain (has the same @domain.com
       * suffix as the tailnet), the user can join the tailnet automatically by
       * logging in with their domain email at https://login.tailscale.com/start.
       * They'll be assigned the specified `role` upon signing in for the first
       * time.
       *
       * example:
       * https://login.tailscale.com/admin/invite/<code>
       */
      inviteUrl?: string;
    }
    export interface Webhook {
      /**
       * ID of the webhook endpoint.
       *
       * example:
       * 123456
       */
      endpointId?: string;
      /**
       * The endpoint that events are sent to from Tailscale via POST requests.
       *
       * example:
       * https://example.com/endpoint
       */
      endpointUrl?: string;
      /**
       * The provider type for the webhook destination, or an empty string if none are applicable.
       * Outgoing webhook events are sent in the format expected by the provider type if non-empty.
       *
       * example:
       * slack
       */
      providerType?: "slack" | "mattermost" | "googlechat" | "discord";
      /**
       * The login name for the creator of the webhook endpoint.
       * In some cases, such as webhooks created with an OAuth client, this can be blank.
       *
       * example:
       * user@example.com
       */
      creatorLoginName?: string;
      /**
       * The time the webhook endpoint was created.
       *
       * example:
       * 2022-12-01T05:23:30Z
       */
      created?: string; // date-time
      /**
       * The time the webhook endpoint was last modified.
       *
       * example:
       * 2022-12-01T05:23:30Z
       */
      lastModified?: string; // date-time
      /**
       * The list of subscribed events that trigger POST requests to the configured endpoint URL.
       * Learn more about [webhook events](/kb/1213/webhooks#events).
       *
       * example:
       * [
       *   "nodeCreated",
       *   "userDeleted"
       * ]
       */
      subscriptions?: (
        | "nodeCreated"
        | "nodeNeedsApproval"
        | "nodeApproved"
        | "nodeKeyExpiringInOneDay"
        | "nodeKeyExpired"
        | "nodeDeleted"
        | "nodeSigned"
        | "nodeNeedsSignature"
        | "policyUpdate"
        | "userCreated"
        | "userNeedsApproval"
        | "userSuspended"
        | "userRestored"
        | "userDeleted"
        | "userApproved"
        | "userRoleUpdated"
        | "subnetIPForwardingNotEnabled"
        | "exitNodeIPForwardingNotEnabled"
      )[];
      /**
       * The webhook secret associated with the endpoint.
       * Only populated on creation or when the secret is rotated.
       *
       * This secret is used for generating the `Tailscale-Webhook-Signature` header in requests sent to the endpoint URL.
       * Learn more about [verifying webhook event signatures](/kb/1213/webhooks#verifying-an-event-signature).
       *
       * example:
       * xxxxx
       */
      secret?: string; // password
    }
  }
}
declare namespace Paths {
  namespace AcceptDeviceInvite {
    export interface RequestBody {
      /**
       * The URL of the invite (in the form `https://login.tailscale.com/admin/invite/{code}`) or the `{code}` component of the URL.
       *
       * example:
       * https://login.tailscale.com/admin/invite/xxxxxx
       */
      invite: string;
    }
    namespace Responses {
      export interface $200 {
        /**
         * Information about the device being shared.
         *
         */
        device?: {
          /**
           * The `nodeId` for the device.
           *
           * example:
           * 12346
           */
          id?: string;
          /**
           * The operating system that the device is running.
           *
           * example:
           * iOS
           */
          os?: string;
          /**
           * The name of the device.
           *
           * example:
           * my-phone
           */
          name?: string;
          /**
           * The MagicDNS name of the device.
           * Learn more about MagicDNS at https://tailscale.com/kb/1081/.
           *
           * example:
           * my-phone.something.ts.net
           */
          fqdn?: string;
          /**
           * The IPv4 address of the device.
           *
           * example:
           * 100.x.y.z
           */
          ipv4?: string;
          /**
           * The IPv6 address of the device.
           *
           * example:
           * fd7a:115c:x::y:z
           */
          ipv6?: string;
          /**
           * Specifies whether the invited user is able to use the
           * device as an exit node when the device is advertising as one.
           *
           * example:
           * false
           */
          includeExitNode?: boolean;
        };
        /**
         * The user who create the device share invite.
         *
         */
        sharer?: {
          /**
           * The ID of the user who created the share invite.
           *
           * example:
           * 22012
           */
          id?: string;
          /**
           * The display name of the user who created the share invite.
           *
           * example:
           * Some User
           */
          displayName?: string;
          /**
           * The email address of the user who created the share invite.
           *
           * example:
           * someuser@example.com
           */
          loginName?: string;
          /**
           * The profile pic URL for the user who created the share invite.
           *
           * example:
           *
           */
          profilePicURL?: string;
        };
        /**
         * The user accepting the device share invite.
         *
         */
        acceptedBy?: {
          /**
           * The ID of the user who accepted the share invite.
           *
           * example:
           * 33233
           */
          id?: string;
          /**
           * The display name of the user who accepted the share invite.
           *
           * example:
           * Another User
           */
          displayName?: string;
          /**
           * The email address of the user who accepted the share invite.
           *
           * example:
           * anotheruser@example2.com
           */
          loginName?: string;
          /**
           * The profile pic URL for the user who accepted the share invite.
           *
           * example:
           *
           */
          profilePicURL?: string;
        };
      }
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ApproveUser {
    namespace Responses {
      export interface $200 {}
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * User not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace AuthorizeDevice {
    export interface RequestBody {
      /**
       * - If `true`, authorize a new device or re-authorize a previously deauthorized device.
       * - If `false`, deauthorize an authorized device.
       *
       */
      authorized: boolean;
    }
    namespace Responses {
      export interface $200 {}
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace CreateAuthKey {
    export interface RequestBody {
      /**
       * The type of key to create. Must be either "auth" or "client". Defaults to "auth" if omitted.
       *
       */
      keyType?: string;
      /**
       * A short string specifying the purpose of the key. Can be a maximum of 50 alphanumeric characters. Hyphens and spaces are also allowed.
       *
       * example:
       * dev access
       */
      description?: string;
      capabilities: /**
       * `capabilities` is a mapping of resources to permissible actions.
       *
       */
      Components.Schemas.KeyCapabilities;
      /**
       * Specifies the duration in seconds until the key expires. Defaults to 90 days if not supplied.
       * Only applies to auth keys.
       *
       * example:
       * 86400
       */
      expirySeconds?: number;
      /**
       * A list of scopes to grant to the key. At least one scope is required.
       * See [OAuth Scopes](https://tailscale.com/kb/1215/#scopes) for a list of available scopes.
       * Only applies to OAuth clients.
       *
       */
      scopes: string[];
      /**
       * A list of tags associated to the OAuth client. Auth keys created with this client must have these exact tags, or tags owned by the client's tags.
       * Mandatory if the scopes include "devices:core" or "auth_keys".
       * Only applies to OAuth clients.
       *
       */
      tags?: string[];
    }
    namespace Responses {
      export type $200 =
        /**
         * An API access token or Auth Key.
         *
         */
        Components.Schemas.Key;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace CreateDeviceInvites {
    export type RequestBody = {
      /**
       * Whether the invite can be accepted more than once.
       * When set to `true`, it results in an invite that can be accepted up to 1,000 times.
       *
       * example:
       * false
       */
      multiUse?: boolean;
      /**
       * Whether the invited user can use the device as an exit node when it advertises as one.
       *
       * example:
       * false
       */
      allowExitNode?: boolean;
      /**
       * The email to send the created invite to.
       * If not set, the endpoint generates and returns an invite URL (but doesn't send it out).
       *
       * example:
       * user@example.com
       */
      email?: string;
    }[];
    namespace Responses {
      /**
       * example:
       * [
       *   {
       *     "id": "12345",
       *     "created": "2024-05-08T20:19:51.777861756Z",
       *     "tailnetId": 59954,
       *     "deviceId": 11055,
       *     "sharerId": 22011,
       *     "allowExitNode": true,
       *     "email": "user@example.com",
       *     "lastEmailSentAt": "2024-05-08T20:19:51.777861756Z",
       *     "inviteUrl": "https://login.tailscale.com/admin/invite/<code>",
       *     "accepted": false
       *   },
       *   {
       *     "id": "12346",
       *     "created": "2024-04-03T21:38:49.333829261Z",
       *     "tailnetId": 59954,
       *     "deviceId": 11055,
       *     "sharerId": 22012,
       *     "inviteUrl": "https://login.tailscale.com/admin/invite/<code>",
       *     "accepted": false
       *   }
       * ]
       */
      export type $200 =
        /**
         * A device invite is an invitation that shares a device with an external
         * user (a user not in the device's tailnet).
         *
         * Each device invite has a unique ID that is used to identify the invite
         * in API calls. You can find all device invite IDs for a particular device
         * by [listing all device invites](#tag/deviceinvites/POST/device/{deviceId}/device-invites)
         * for a device.
         *
         */
        Components.Schemas.DeviceInvite[];
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace CreatePostureIntegration {
    export type RequestBody =
      /**
       * A configured PostureIntegration.
       * example:
       * {
       *   "id": "p56wQiqrn7mfDEVEL",
       *   "provider": "intune",
       *   "cloudId": "global",
       *   "clientId": "93013672-b00c-4344-80ca-7ecf74f9dce1",
       *   "tenantId": "d1ae389b-5207-43a2-afca-2de6b03ac7e3",
       *   "configUpdated": "2024-06-18T13:44:28.250168Z",
       *   "status": {
       *     "error": "Invalid Tenant ID.\nMicrosoft error: AADSTS90002: Tenant 'd1ae389b-5207-43a2-afca-2de6b03ac7e3' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud. Check with your subscription administrator, this may happen if there are no active subscriptions for the tenant. Trace ID: f6237360-98a2-4889-913b-e3d80aba7d00 Correlation ID: a2024a6e-7757-4406-8a8d-1b6ac2e03ad5 Timestamp: 2024-06-18 13:44:33Z",
       *     "lastSync": "2024-06-18T08:44:33.872282-05:00",
       *     "matchedCount": 0,
       *     "possibleMatchedCount": 0,
       *     "providerHostCount": 0
       *   }
       * }
       */
      Components.Schemas.PostureIntegration;
    namespace Responses {
      export type $200 =
        /**
         * A configured PostureIntegration.
         * example:
         * {
         *   "id": "p56wQiqrn7mfDEVEL",
         *   "provider": "intune",
         *   "cloudId": "global",
         *   "clientId": "93013672-b00c-4344-80ca-7ecf74f9dce1",
         *   "tenantId": "d1ae389b-5207-43a2-afca-2de6b03ac7e3",
         *   "configUpdated": "2024-06-18T13:44:28.250168Z",
         *   "status": {
         *     "error": "Invalid Tenant ID.\nMicrosoft error: AADSTS90002: Tenant 'd1ae389b-5207-43a2-afca-2de6b03ac7e3' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud. Check with your subscription administrator, this may happen if there are no active subscriptions for the tenant. Trace ID: f6237360-98a2-4889-913b-e3d80aba7d00 Correlation ID: a2024a6e-7757-4406-8a8d-1b6ac2e03ad5 Timestamp: 2024-06-18 13:44:33Z",
         *     "lastSync": "2024-06-18T08:44:33.872282-05:00",
         *     "matchedCount": 0,
         *     "possibleMatchedCount": 0,
         *     "providerHostCount": 0
         *   }
         * }
         */
        Components.Schemas.PostureIntegration;
      /**
       * User does not have sufficient access to create posture integrations.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * A posture integration for the same provider already exists.
       */
      export type $409 =
        /**
         * example:
         * {
         *   "message": "conflict"
         * }
         */
        Components.Responses.$409;
    }
  }
  namespace CreateUserInvites {
    export type RequestBody = {
      /**
       * Optionally specifies a user role to assign the invited user.
       *
       * example:
       * admin
       */
      role?: "member" | "admin" | "it-admin" | "network-admin" | "billing-admin" | "auditor";
      /**
       * Optionally specifies the email to send the created invite.
       * If not set, the endpoint generates and returns an invite URL, but does not email it out.
       *
       * example:
       * user@example.com
       */
      email?: string;
    }[];
    namespace Responses {
      /**
       * example:
       * [
       *   {
       *     "id": "29214",
       *     "role": "admin",
       *     "tailnetId": 12345,
       *     "inviterId": 34567,
       *     "email": "user@example.com",
       *     "lastEmailSentAt": "2024-05-09T16:23:26.91778771Z",
       *     "inviteUrl": "https://login.tailscale.com/uinv/<code>"
       *   }
       * ]
       */
      export type $200 =
        /**
         * A user invite is an active invitation that lets a user join a tailnet
         * with a preassigned [user role](https://tailscale.com/kb/1138/user-roles).
         *
         * Each user invite has a unique ID that is used to identify the invite
         * in API calls. You can find all user invite IDs for a particular tailnet
         * by [listing user invites](#tag/userinvites/get/tailnet/{tailnet}/user-invites).
         *
         */
        Components.Schemas.UserInvite[];
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace CreateWebhook {
    export interface RequestBody {
      /**
       * The endpoint that events are sent to from Tailscale via POST requests.
       *
       * example:
       * https://example.com/endpoint
       */
      endpointUrl: string;
      providerType?: /**
       * The provider type for the webhook destination, or an empty string if none are applicable.
       * Outgoing webhook events are sent in the format expected by the provider type if non-empty.
       *
       * example:
       * slack
       */
      Components.Schemas.ProviderType;
      subscriptions: /**
       * The list of subscribed events that trigger POST requests to the configured endpoint URL.
       * Learn more about [webhook events](/kb/1213/webhooks#events).
       *
       * example:
       * [
       *   "nodeCreated",
       *   "userDeleted"
       * ]
       */
      Components.Schemas.Subscriptions;
    }
    namespace Responses {
      export type $200 = Components.Schemas.Webhook;
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace DeleteCustomDevicePostureAttributes {
    namespace Responses {
      export interface $200 {}
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace DeleteDevice {
    namespace Responses {
      export interface $200 {}
      /**
       * Invalid device value.
       */
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
      /**
       * Device not owned by tailnet.
       */
      export type $501 =
        /**
         * example:
         * {
         *   "message": "not implemented"
         * }
         */
        Components.Responses.$501;
    }
  }
  namespace DeleteDeviceInvite {
    namespace Responses {
      export interface $200 {}
      /**
       * Device invite not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace DeleteKey {
    namespace Responses {
      export interface $200 {}
      /**
       * User does not have sufficient access to delete this key.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace DeletePostureIntegration {
    namespace Responses {
      export interface $200 {}
      /**
       * User does not have sufficient access to delete this posture integration.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Posture integration not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
    }
  }
  namespace DeleteUser {
    namespace Responses {
      export interface $200 {}
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * User not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace DeleteUserInvite {
    namespace Responses {
      export interface $200 {}
      /**
       * User invite not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace DeleteWebhook {
    namespace Responses {
      export interface $200 {}
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Webhook not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace Device$DeviceId {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace Device$DeviceIdAttributes {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace Device$DeviceIdAttributes$AttributeKey {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
      export type $1 = Components.Parameters.AttributeKey;
    }
  }
  namespace Device$DeviceIdAuthorized {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace Device$DeviceIdDeviceInvites {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace Device$DeviceIdExpire {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace Device$DeviceIdIp {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace Device$DeviceIdKey {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace Device$DeviceIdName {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace Device$DeviceIdRoutes {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace Device$DeviceIdTags {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceId;
    }
  }
  namespace DeviceInvites$DeviceInviteId {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceInviteId;
    }
  }
  namespace DeviceInvites$DeviceInviteIdResend {
    namespace Parameters {
      export type $0 = Components.Parameters.DeviceInviteId;
    }
  }
  namespace DisableLogStreaming {
    namespace Responses {
      export interface $200 {}
      /**
       * User does not have sufficient access to update log streaming configuration.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Log streaming has not been configured, this `logType` is not supported, or user does not have sufficient access to view log streaming configuration.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
    }
  }
  namespace ExpireDeviceKey {
    namespace Responses {
      export interface $200 {}
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetAwsExternalId {
    export interface RequestBody {
      /**
       * If set to true, this same AWS external id will be returned on future calls to this endpoint, if and only if those calls also mark `reusable` as true, and the ID has not yet been linked with an AWS account.
       */
      reusable?: boolean;
    }
    namespace Responses {
      export type $200 =
        /**
         * An external ID for use in authenticating to AWS using role-based authentication.
         * example:
         * {
         *   "externalId": "60fe9ce7-7791-4ab3-ab34-4294f5972725",
         *   "tailscaleAwsAccountId": "001234567890"
         * }
         */
        Components.Schemas.AwsExternalId;
      /**
       * User does not have sufficient access to obtain an AWS external id.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
    }
  }
  namespace GetContacts {
    namespace Responses {
      export interface $200 {
        account?: /**
         * A tailnet contact.
         * example:
         * {
         *   "email": "user@example.com",
         *   "fallbackEmail": "otheruser@example.com\"",
         *   "needsVerification": true
         * }
         */
        Components.Schemas.Contact;
        support?: /**
         * A tailnet contact.
         * example:
         * {
         *   "email": "user@example.com",
         *   "fallbackEmail": "otheruser@example.com\"",
         *   "needsVerification": true
         * }
         */
        Components.Schemas.Contact;
        security?: /**
         * A tailnet contact.
         * example:
         * {
         *   "email": "user@example.com",
         *   "fallbackEmail": "otheruser@example.com\"",
         *   "needsVerification": true
         * }
         */
        Components.Schemas.Contact;
      }
      /**
       * User does not have sufficient access to view contacts on this tailnet.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetDevice {
    namespace Parameters {
      /**
       * example:
       * all
       */
      export type Fields = "all" | "default";
    }
    export interface QueryParameters {
      fields?: /**
       * example:
       * all
       */
      Parameters.Fields;
    }
    namespace Responses {
      export type $200 =
        /**
         * A Tailscale device (sometimes referred to as *node* or *machine*), is any computer or mobile device that joins a tailnet.
         *
         * Each device has a unique ID (`nodeId` in the schema below) that is used to identify the device in API calls.
         * This ID can be found by going to the [Machines](https://login.tailscale.com/admin/machines) page in the admin console,
         * selecting the relevant device, then finding the ID in the Machine Details section.
         * You can also [list all devices](#tag/devices/get/tailnet/{tailnet}/devices) in the tailnet to get their `nodeId` values.
         *
         */
        Components.Schemas.Device;
      /**
       * Invalid ID supplied.
       */
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetDeviceInvite {
    namespace Responses {
      export type $200 =
        /**
         * A device invite is an invitation that shares a device with an external
         * user (a user not in the device's tailnet).
         *
         * Each device invite has a unique ID that is used to identify the invite
         * in API calls. You can find all device invite IDs for a particular device
         * by [listing all device invites](#tag/deviceinvites/POST/device/{deviceId}/device-invites)
         * for a device.
         *
         */
        Components.Schemas.DeviceInvite;
      /**
       * Device invite not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetDevicePostureAttributes {
    namespace Responses {
      export type $200 =
        /**
         * example:
         * {
         *   "attributes": {
         *     "custom:myScore": 80,
         *     "custom:diskEncryption": true,
         *     "custom:myAttribute": "my_value",
         *     "node:os": "linux",
         *     "node:osVersion": "5.19.0-42-generic",
         *     "node:tsReleaseTrack": "stable",
         *     "node:tsVersion": "1.40.0",
         *     "node:tsAutoUpdate": false,
         *     "node:tsStateEncrypted": false
         *   },
         *   "expiries": {
         *     "custom:myScore": "2024-04-23T18:25:43.511Z"
         *   }
         * }
         */
        Components.Schemas.DevicePostureAttributes;
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetDnsPreferences {
    namespace Responses {
      export type $200 = Components.Schemas.DnsPreferences;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetKey {
    interface RequestParameters extends Components.TailnetParamsObject {}
    namespace Responses {
      export type $200 =
        /**
         * An API access token or Auth Key.
         *
         */
        Components.Schemas.Key;
      /**
       * Tailnet or key not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetLogStreamingConfiguration {
    namespace Responses {
      export type $200 =
        /**
         * The current configuration of a log streaming endpoint.
         * example:
         * {
         *   "logType": "configuration",
         *   "destinationType": "elastic",
         *   "url": "http://100.71.134.73:80/config-log-datastream",
         *   "user": "myusername"
         * }
         */
        Components.Schemas.LogstreamEndpointConfiguration;
      /**
       * Log streaming has not been configured, this `logType` is not supported, or user does not have sufficient access to view log streaming configuration.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
    }
  }
  namespace GetLogStreamingStatus {
    namespace Responses {
      export type $200 =
        /**
         * Latest status of log stream publishing for a specific type of log.
         * example:
         * {
         *   "lastActivity": "2024-06-10T15:42:13.984555636Z",
         *   "lastError": "",
         *   "maxBodySize": 524288,
         *   "numBytesSent": 17238983,
         *   "numEntriesSent": 8363,
         *   "numFailedRequests": 5434,
         *   "numSpoofedEntries": 0,
         *   "numTotalRequests": 10610,
         *   "rateBytesSent": 3.524073767296142,
         *   "rateEntriesSent": 0.008564949767446907,
         *   "rateFailedRequests": 4.1431119220540763e-157,
         *   "rateTotalRequests": 0.0037038341100629453
         * }
         */
        Components.Schemas.LogstreamEndpointPublishingStatus;
      /**
       * Log streaming has not been configured, this `logType` is not supported, or user does not have sufficient access to view log streaming status.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      /**
       * The system was unable to communicate with logging server.
       */
      export type $502 =
        /**
         * example:
         * {
         *   "message": "bad gateway"
         * }
         */
        Components.Responses.$502;
    }
  }
  namespace GetPolicyFile {
    namespace Parameters {
      export type Details = boolean;
    }
    export interface QueryParameters {
      details?: Parameters.Details;
    }
    namespace Responses {
      export interface $200 {}
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetPostureIntegration {
    namespace Responses {
      export type $200 =
        /**
         * A configured PostureIntegration.
         * example:
         * {
         *   "id": "p56wQiqrn7mfDEVEL",
         *   "provider": "intune",
         *   "cloudId": "global",
         *   "clientId": "93013672-b00c-4344-80ca-7ecf74f9dce1",
         *   "tenantId": "d1ae389b-5207-43a2-afca-2de6b03ac7e3",
         *   "configUpdated": "2024-06-18T13:44:28.250168Z",
         *   "status": {
         *     "error": "Invalid Tenant ID.\nMicrosoft error: AADSTS90002: Tenant 'd1ae389b-5207-43a2-afca-2de6b03ac7e3' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud. Check with your subscription administrator, this may happen if there are no active subscriptions for the tenant. Trace ID: f6237360-98a2-4889-913b-e3d80aba7d00 Correlation ID: a2024a6e-7757-4406-8a8d-1b6ac2e03ad5 Timestamp: 2024-06-18 13:44:33Z",
         *     "lastSync": "2024-06-18T08:44:33.872282-05:00",
         *     "matchedCount": 0,
         *     "possibleMatchedCount": 0,
         *     "providerHostCount": 0
         *   }
         * }
         */
        Components.Schemas.PostureIntegration;
      /**
       * Posture integration not found, or user is not authorized to read it.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
    }
  }
  namespace GetPostureIntegrations {
    namespace Responses {
      export interface $200 {
        /**
         * List of PostureIntegrations.
         */
        integrations?: /**
         * A configured PostureIntegration.
         * example:
         * {
         *   "id": "p56wQiqrn7mfDEVEL",
         *   "provider": "intune",
         *   "cloudId": "global",
         *   "clientId": "93013672-b00c-4344-80ca-7ecf74f9dce1",
         *   "tenantId": "d1ae389b-5207-43a2-afca-2de6b03ac7e3",
         *   "configUpdated": "2024-06-18T13:44:28.250168Z",
         *   "status": {
         *     "error": "Invalid Tenant ID.\nMicrosoft error: AADSTS90002: Tenant 'd1ae389b-5207-43a2-afca-2de6b03ac7e3' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud. Check with your subscription administrator, this may happen if there are no active subscriptions for the tenant. Trace ID: f6237360-98a2-4889-913b-e3d80aba7d00 Correlation ID: a2024a6e-7757-4406-8a8d-1b6ac2e03ad5 Timestamp: 2024-06-18 13:44:33Z",
         *     "lastSync": "2024-06-18T08:44:33.872282-05:00",
         *     "matchedCount": 0,
         *     "possibleMatchedCount": 0,
         *     "providerHostCount": 0
         *   }
         * }
         */
        Components.Schemas.PostureIntegration[];
      }
      /**
       * User does not have sufficient access to list posture integrations.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
    }
  }
  namespace GetSplitDns {
    namespace Responses {
      export type $200 =
        /**
         * Map of domain names to lists of nameservers or to `null`.
         *
         * example:
         * {
         *   "example.com": [
         *     "1.1.1.1",
         *     "1.2.3.4"
         *   ],
         *   "other.com": [
         *     "2.2.2.2"
         *   ]
         * }
         */
        Components.Schemas.SplitDns;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetTailnetSettings {
    namespace Responses {
      export type $200 =
        /**
         * Settings for a tailnet.
         *
         */
        Components.Schemas.TailnetSettings;
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetUser {
    namespace Responses {
      export type $200 =
        /**
         * Representation of a user within a tailnet.
         *
         */
        Components.Schemas.User;
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * User not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetUserInvite {
    namespace Responses {
      export type $200 =
        /**
         * A user invite is an active invitation that lets a user join a tailnet
         * with a preassigned [user role](https://tailscale.com/kb/1138/user-roles).
         *
         * Each user invite has a unique ID that is used to identify the invite
         * in API calls. You can find all user invite IDs for a particular tailnet
         * by [listing user invites](#tag/userinvites/get/tailnet/{tailnet}/user-invites).
         *
         */
        Components.Schemas.UserInvite;
      /**
       * User invite not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace GetWebhook {
    namespace Responses {
      export type $200 = Components.Schemas.Webhook;
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Webhook not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ListConfigurationAuditLogs {
    namespace Responses {
      /**
       * A structured response for all of a Tailnet's audit logs over a period of time.
       */
      export interface $200 {
        /**
         * Version of audit logs response.
         * example:
         * 1.1
         */
        version?: string;
        /**
         * The tailnet on which the logged configuration changes were made.
         * example:
         * example.com
         */
        tailnet?: string;
        /**
         * Matching log entries, ordered chronologically.
         */
        logs?: /**
         * example:
         * {
         *   "action": "CREATE",
         *   "actor": {
         *     "displayName": "Lion Dahlia Armadillo",
         *     "id": "uZKk3KSfrH11DEVEL",
         *     "loginName": "lion.dahlia.armadillo@example.com",
         *     "type": "USER"
         *   },
         *   "deferredAt": "0001-01-01T00:00:00Z",
         *   "eventGroupID": "0378d8f57300d172ef7ae3826e097ef0",
         *   "eventTime": "2024-06-06T15:25:26.583893Z",
         *   "origin": "ADMIN_CONSOLE",
         *   "target": {
         *     "id": "nBLYviWLGB21DEVEL",
         *     "isEphemeral": true,
         *     "name": "silver-robin-horse-albatross-armadillo.taile18a.ts.net",
         *     "type": "NODE"
         *   },
         *   "type": "CONFIG"
         * }
         */
        Components.Schemas.ConfigurationAuditLog[];
      }
      /**
       * Request has missing or invalid parameter(s).
       */
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      /**
       * User does not have sufficient access to view configuration audit logs.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Logging is not supported on this deployment of Tailscale.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
    }
  }
  namespace ListDeviceInvites {
    namespace Responses {
      /**
       * example:
       * [
       *   {
       *     "id": "12345",
       *     "created": "2024-05-08T20:19:51.777861756Z",
       *     "tailnetId": 59954,
       *     "deviceId": 11055,
       *     "sharerId": 22011,
       *     "allowExitNode": true,
       *     "email": "user@example.com",
       *     "lastEmailSentAt": "2024-05-08T20:19:51.777861756Z",
       *     "inviteUrl": "https://login.tailscale.com/admin/invite/<code>",
       *     "accepted": false
       *   },
       *   {
       *     "id": "12346",
       *     "created": "2024-04-03T21:38:49.333829261Z",
       *     "tailnetId": 59954,
       *     "deviceId": 11055,
       *     "sharerId": 22012,
       *     "inviteUrl": "https://login.tailscale.com/admin/invite/<code>",
       *     "accepted": true,
       *     "acceptedBy": {
       *       "id": 33223,
       *       "loginName": "someone@example.com",
       *       "profilePicUrl": ""
       *     }
       *   }
       * ]
       */
      export type $200 =
        /**
         * A device invite is an invitation that shares a device with an external
         * user (a user not in the device's tailnet).
         *
         * Each device invite has a unique ID that is used to identify the invite
         * in API calls. You can find all device invite IDs for a particular device
         * by [listing all device invites](#tag/deviceinvites/POST/device/{deviceId}/device-invites)
         * for a device.
         *
         */
        Components.Schemas.DeviceInvite[];
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ListDeviceRoutes {
    namespace Responses {
      export type $200 = Components.Schemas.DeviceRoutes;
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ListDnsNameservers {
    namespace Responses {
      export interface $200 {
        /**
         * DNS nameservers.
         *
         * example:
         * [
         *   "8.8.8.8",
         *   "1.2.3.4"
         * ]
         */
        dns?: string[];
      }
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ListDnsSearchPaths {
    namespace Responses {
      export type $200 = Components.Schemas.DnsSearchPaths;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ListNetworkFlowLogs {
    namespace Responses {
      /**
       * A structured response for all of a Tailnet's network flow logs over a period of time.
       */
      export interface $200 {
        /**
         * Matching log entries, ordered chronologically.
         */
        logs?: /**
         * example:
         * {
         *   "logged": "2024-06-06T15:27:26.583893Z",
         *   "nodeId": "nBLYviWLGB21DEVEL",
         *   "start": "2024-06-06T15:25:26.583893Z",
         *   "end": "2024-06-06T15:26:26.583893Z",
         *   "virtualTraffic": [
         *     {
         *       "proto": "ipv4",
         *       "src": "108.86.185.125:52343",
         *       "dst": "108.86.185.126:443",
         *       "txPkts": 10,
         *       "txBytes": 10000,
         *       "rxPkts": 10,
         *       "rxBytes": 10000
         *     }
         *   ],
         *   "subnetTraffic": [
         *     {
         *       "proto": "ipv4",
         *       "src": "108.86.185.125:52343",
         *       "dst": "108.86.185.126:443",
         *       "txPkts": 10,
         *       "txBytes": 10000,
         *       "rxPkts": 10,
         *       "rxBytes": 10000
         *     }
         *   ],
         *   "exitTraffic": [
         *     {
         *       "proto": "ipv4",
         *       "src": "108.86.185.125:52343",
         *       "dst": "108.86.185.126:443",
         *       "txPkts": 10,
         *       "txBytes": 10000,
         *       "rxPkts": 10,
         *       "rxBytes": 10000
         *     }
         *   ],
         *   "physicalTraffic": [
         *     {
         *       "proto": "ipv4",
         *       "src": "108.86.185.125:52343",
         *       "dst": "108.86.185.126:443",
         *       "txPkts": 10,
         *       "txBytes": 10000,
         *       "rxPkts": 10,
         *       "rxBytes": 10000
         *     }
         *   ]
         * }
         */
        Components.Schemas.NetworkFlowLog[];
      }
      /**
       * Request has missing or invalid parameter(s).
       */
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      /**
       * User does not have sufficient access to view network flow logs.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Logging is not supported on this deployment of Tailscale.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      /**
       * The system was unable to communicate with logging server.
       */
      export type $502 =
        /**
         * example:
         * {
         *   "message": "bad gateway"
         * }
         */
        Components.Responses.$502;
    }
  }
  namespace ListTailnetDevices {
    namespace Responses {
      export interface $200 {
        devices?: /**
         * A Tailscale device (sometimes referred to as *node* or *machine*), is any computer or mobile device that joins a tailnet.
         *
         * Each device has a unique ID (`nodeId` in the schema below) that is used to identify the device in API calls.
         * This ID can be found by going to the [Machines](https://login.tailscale.com/admin/machines) page in the admin console,
         * selecting the relevant device, then finding the ID in the Machine Details section.
         * You can also [list all devices](#tag/devices/get/tailnet/{tailnet}/devices) in the tailnet to get their `nodeId` values.
         *
         */
        Components.Schemas.Device[];
      }
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ListTailnetKeys {
    namespace Parameters {
      /**
       * example:
       * true
       */
      export type All = boolean;
    }
    export interface QueryParameters extends Components.TailnetParamsObject {
      all: /**
       * example:
       * true
       */
      Parameters.All;
    }
    namespace Responses {
      export interface $200 {
        /**
         * A list of the active keys.
         * example:
         * [
         *   {
         *     "id": "XXXX14CNTRL",
         *     "keyType": "client",
         *     "created": "yyyy-mm-ddThh:mm:ssZ",
         *     "scopes": [
         *       "all"
         *     ],
         *     "description\"": "test key",
         *     "userId": "uscwcTtzzo11DEVEL"
         *   },
         *   {
         *     "id": "XXXXZ3CNTRL",
         *     "keyType": "api",
         *     "expirySeconds": 7776000,
         *     "created": "yyyy-mm-ddThh:mm:ssZ",
         *     "expires": "yyyy-mm-ddThh:mm:ssZ",
         *     "scopes": [
         *       "all"
         *     ],
         *     "description": "production key",
         *     "userId": "uscwcTtzzo11DEVEL"
         *   },
         *   {
         *     "id": "XXXX43CNTRL",
         *     "keyType": "auth",
         *     "expirySeconds": 7776000,
         *     "created": "yyyy-mm-ddThh:mm:ssZ",
         *     "expires": "yyyy-mm-ddThh:mm:ssZ",
         *     "capabilities": {
         *       "devices": {
         *         "create": {
         *           "reusable": true,
         *           "ephemeral": false,
         *           "preauthorized": true,
         *           "tags": [
         *             "tag:example"
         *           ]
         *         }
         *       }
         *     },
         *     "description": "dev access",
         *     "userId": "uscwcTtzzo11DEVEL"
         *   }
         * ]
         */
        keys?: /**
         * An API access token or Auth Key.
         *
         */
        Components.Schemas.Key[];
      }
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ListUserInvites {
    namespace Responses {
      /**
       * example:
       * [
       *   {
       *     "id": "29214",
       *     "role": "admin",
       *     "tailnetId": 12345,
       *     "inviterId": 34567,
       *     "email": "user@example.com",
       *     "lastEmailSentAt": "2024-05-09T16:23:26.91778771Z",
       *     "inviteUrl": "https://login.tailscale.com/uinv/<code>"
       *   },
       *   {
       *     "id": "29215",
       *     "role": "admin",
       *     "tailnetId": 12345,
       *     "inviterId": 34567,
       *     "email": "someoneelse@example.com",
       *     "lastEmailSentAt": "2024-05-09T17:23:30.91778771Z",
       *     "inviteUrl": "https://login.tailscale.com/uinv/<code>"
       *   }
       * ]
       */
      export type $200 =
        /**
         * A user invite is an active invitation that lets a user join a tailnet
         * with a preassigned [user role](https://tailscale.com/kb/1138/user-roles).
         *
         * Each user invite has a unique ID that is used to identify the invite
         * in API calls. You can find all user invite IDs for a particular tailnet
         * by [listing user invites](#tag/userinvites/get/tailnet/{tailnet}/user-invites).
         *
         */
        Components.Schemas.UserInvite[];
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ListUsers {
    namespace Responses {
      export interface $200 {
        users?: /**
         * Representation of a user within a tailnet.
         *
         */
        Components.Schemas.User[];
      }
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found, or user does not have access to read users.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ListWebhooks {
    namespace Responses {
      export interface $200 {
        webhooks?: Components.Schemas.Webhook[];
      }
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace PostureIntegrations$Id {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * p56wQiqrn7mfDEVEL
         */
        Components.Parameters.Id;
    }
  }
  namespace PreviewRuleMatches {
    export interface RequestBody {}
    namespace Responses {
      export interface $200 {
        matches: {
          /**
           * Source entities affected by the rule.
           *
           * example:
           * [
           *   "*"
           * ]
           */
          users: string[];
          /**
           * Destinations that can be accessed.
           *
           * example:
           * [
           *   "*.*"
           * ]
           */
          ports: string[];
          /**
           * The rule's location in the policy file.
           *
           * example:
           * 19
           */
          lineNumber: number;
        }[];
        /**
         * Echoes the `type` provided in the request.
         *
         * example:
         * user
         */
        type: string;
        /**
         * Echoes the `previewFor` provided in the request.
         *
         * example:
         * user1@example.com
         */
        previewFor: string;
      }
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ResendContactVerificationEmail {
    namespace Responses {
      export interface $200 {}
      /**
       * Verification is not required, can't resend email.
       */
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      /**
       * User does not have sufficient access to update contacts for this tailnet.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ResendDeviceInvite {
    namespace Responses {
      export interface $200 {}
      /**
       * Device invite not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ResendUserInvite {
    namespace Responses {
      export interface $200 {}
      /**
       * User invite not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace RestoreUser {
    namespace Responses {
      export interface $200 {}
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * User not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace RotateWebhookSecret {
    namespace Responses {
      export type $200 = Components.Schemas.Webhook;
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Webhook not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetCustomDevicePostureAttributes {
    export interface RequestBody {
      /**
       * A value can be either a string, number or boolean.
       *
       * A string value can have a maximum length of 50 characters,
       * and can only contain letters, numbers, underscores, and periods.
       *
       * A number value is an integer and must be a JSON safe number (up to 2^53 - 1).
       *
       * example:
       * my_value
       */
      value?: /**
       * A value can be either a string, number or boolean.
       *
       * A string value can have a maximum length of 50 characters,
       * and can only contain letters, numbers, underscores, and periods.
       *
       * A number value is an integer and must be a JSON safe number (up to 2^53 - 1).
       *
       * example:
       * my_value
       */
      string | number | boolean;
      /**
       * An optional expiry time for a given posture attribute. If set, Tailscale
       * will automatically remove the attribute within a few minutes after the specified
       * time.
       *
       * example:
       * 2022-12-01T05:23:30Z
       */
      expiry?: string; // date-time
      /**
       * An optional comment indicating a reason why an attribute is set,
       * which will be added to the audit log.
       *
       */
      comment?: string;
    }
    namespace Responses {
      export type $200 =
        /**
         * example:
         * {
         *   "attributes": {
         *     "custom:myScore": 80,
         *     "custom:diskEncryption": true,
         *     "custom:myAttribute": "my_value",
         *     "node:os": "linux",
         *     "node:osVersion": "5.19.0-42-generic",
         *     "node:tsReleaseTrack": "stable",
         *     "node:tsVersion": "1.40.0",
         *     "node:tsAutoUpdate": false,
         *     "node:tsStateEncrypted": false
         *   },
         *   "expiries": {
         *     "custom:myScore": "2024-04-23T18:25:43.511Z"
         *   }
         * }
         */
        Components.Schemas.DevicePostureAttributes;
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetDeviceIp {
    export interface RequestBody {
      /**
       * The new IPv4 address for the device.
       *
       * example:
       * 100.80.0.1
       */
      ipv4: string;
    }
    namespace Responses {
      export interface $200 {}
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetDeviceName {
    export interface RequestBody {
      /**
       * The new name for the device.
       *
       * This can be provided as either the fully qualified domain name for the device (e.g. "nodename.your-domain.ts.net")
       * or just the base name (e.g. "nodename").
       *
       * If `name` is unset or provided empty, the device's name is reset to be
       * generated from its OS hostname.
       *
       * example:
       * dev-server
       */
      name: string;
    }
    namespace Responses {
      export interface $200 {}
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetDeviceRoutes {
    export interface RequestBody {
      /**
       * The new list of enabled subnet routes.
       *
       * example:
       * [
       *   "10.0.0.0/16",
       *   "192.168.1.0/24"
       * ]
       */
      routes?: string[];
    }
    namespace Responses {
      export type $200 = Components.Schemas.DeviceRoutes;
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetDeviceTags {
    export interface RequestBody {
      /**
       * The new list of tags for the device.
       *
       * example:
       * [
       *   "tag:foo",
       *   "tag:bar"
       * ]
       */
      tags?: string[];
    }
    namespace Responses {
      export interface $200 {}
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetDnsNameservers {
    export interface RequestBody {
      /**
       * DNS nameservers.
       *
       * example:
       * [
       *   "8.8.8.8",
       *   "1.2.3.4"
       * ]
       */
      dns?: string[];
    }
    namespace Responses {
      export interface $200 {
        /**
         * DNS nameservers.
         *
         * example:
         * [
         *   "8.8.8.8",
         *   "1.2.3.4"
         * ]
         */
        dns?: string[];
        /**
         * Whether MagicDNS is active for this tailnet.
         *
         * example:
         * true
         */
        magicDNS?: boolean;
      }
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetDnsPreferences {
    export type RequestBody = Components.Schemas.DnsPreferences;
    namespace Responses {
      export type $200 = Components.Schemas.DnsPreferences;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetDnsSearchPaths {
    export type RequestBody = Components.Schemas.DnsSearchPaths;
    namespace Responses {
      export type $200 = Components.Schemas.DnsSearchPaths;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetLogStreamingConfiguration {
    export type RequestBody =
      /**
       * The current configuration of a log streaming endpoint.
       * example:
       * {
       *   "logType": "configuration",
       *   "destinationType": "elastic",
       *   "url": "http://100.71.134.73:80/config-log-datastream",
       *   "user": "myusername"
       * }
       */
      Components.Schemas.LogstreamEndpointConfiguration;
    namespace Responses {
      export interface $200 {}
      /**
       * Request has missing or invalid parameter(s).
       */
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      /**
       * User does not have sufficient access to update log streaming configuration.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found, this `logType` is not supported, or user does not have sufficient access to view log streaming configuration.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
    }
  }
  namespace SetPolicyFile {
    export interface HeaderParameters {
      "If-Match"?: Parameters.IfMatch;
    }
    namespace Parameters {
      export type IfMatch = string;
    }
    export interface RequestBody {}
    namespace Responses {
      export interface $200 {}
      /**
       * ACL validation or test error.
       */
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      /**
       * example:
       * {
       *   "message": "precondition failed, invalid old hash"
       * }
       */
      export type $412 = Components.Schemas.Error;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SetSplitDns {
    export type RequestBody =
      /**
       * Map of domain names to lists of nameservers or to `null`.
       *
       * example:
       * {
       *   "example.com": [
       *     "1.1.1.1",
       *     "1.2.3.4"
       *   ],
       *   "other.com": [
       *     "2.2.2.2"
       *   ]
       * }
       */
      Components.Schemas.SplitDns;
    namespace Responses {
      export type $200 =
        /**
         * Map of domain names to lists of nameservers or to `null`.
         *
         * example:
         * {
         *   "example.com": [
         *     "1.1.1.1",
         *     "1.2.3.4"
         *   ],
         *   "other.com": [
         *     "2.2.2.2"
         *   ]
         * }
         */
        Components.Schemas.SplitDns;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace SuspendUser {
    namespace Responses {
      export interface $200 {}
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * User not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace Tailnet$TailnetAcl {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type $1 = Components.Parameters.AcceptHeaderParam;
    }
  }
  namespace Tailnet$TailnetAclPreview {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      /**
       * example:
       * 10.0.0.1:80
       */
      export type PreviewFor = string;
      /**
       * example:
       * user
       */
      export type Type = "user" | "ipport";
    }
    export interface QueryParameters {
      type: /**
       * example:
       * user
       */
      Parameters.Type;
      previewFor: /**
       * example:
       * 10.0.0.1:80
       */
      Parameters.PreviewFor;
    }
  }
  namespace Tailnet$TailnetAclValidate {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetAwsExternalId {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetAwsExternalId$IdValidateAwsTrustPolicy {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type Id = string;
    }
    export interface PathParameters {
      id: Parameters.Id;
    }
  }
  namespace Tailnet$TailnetContacts {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetContacts$ContactType {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type $1 =
        /**
         * example:
         * account
         */
        Components.Parameters.ContactType;
    }
  }
  namespace Tailnet$TailnetContacts$ContactTypeResendVerificationEmail {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type $1 =
        /**
         * example:
         * account
         */
        Components.Parameters.ContactType;
    }
  }
  namespace Tailnet$TailnetDevices {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type $1 =
        /**
         * example:
         * all
         */
        Components.Parameters.Fields;
    }
  }
  namespace Tailnet$TailnetDnsNameservers {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetDnsPreferences {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetDnsSearchpaths {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetDnsSplitDns {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetKeys {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetKeys$KeyId {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type $1 =
        /**
         * example:
         * k123456CNTRL
         */
        Components.Parameters.KeyId;
    }
  }
  namespace Tailnet$TailnetLogging$LogTypeStream {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type $1 = Components.Parameters.LogType;
    }
  }
  namespace Tailnet$TailnetLogging$LogTypeStreamStatus {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type $1 = Components.Parameters.LogType;
    }
  }
  namespace Tailnet$TailnetLoggingConfiguration {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type $1 =
        /**
         * example:
         * 2023-12-19T16:39:57-08:00
         */
        Components.Parameters.Start;
      export type $2 =
        /**
         * example:
         * 2023-12-22T02:15:23-08:00
         */
        Components.Parameters.End;
      export type $3 =
        /**
         * example:
         * [
         *   "uc4p8fRHvJ11DEVEL",
         *   "~bob"
         * ]
         */
        Components.Parameters.Actor;
      export type $4 =
        /**
         * example:
         * [
         *   "mytarget1",
         *   "sometarget2"
         * ]
         */
        Components.Parameters.Target;
      export type $5 =
        /**
         * example:
         * [
         *   "USER.CREATE",
         *   "NODE.CREATE"
         * ]
         */
        Components.Parameters.Event;
    }
  }
  namespace Tailnet$TailnetLoggingNetwork {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      export type $1 =
        /**
         * example:
         * 2023-12-19T16:39:57-08:00
         */
        Components.Parameters.Start;
      export type $2 =
        /**
         * example:
         * 2023-12-22T02:15:23-08:00
         */
        Components.Parameters.End;
    }
  }
  namespace Tailnet$TailnetPostureIntegrations {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetSettings {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetUserInvites {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace Tailnet$TailnetUsers {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
      /**
       * example:
       * all
       */
      export type Role = "owner" | "member" | "admin" | "it-admin" | "network-admin" | "billing-admin" | "auditor" | "all";
      /**
       * example:
       * member
       */
      export type Type = "member" | "shared" | "all";
    }
    export interface QueryParameters {
      tailnet: string;
      type?: /**
       * example:
       * member
       */
      Parameters.Type;
      role?: /**
       * example:
       * all
       */
      Parameters.Role;
    }
  }
  namespace Tailnet$TailnetWebhooks {
    namespace Parameters {
      export type $0 =
        /**
         * example:
         * example.com
         */
        Components.Parameters.Tailnet;
    }
  }
  namespace TestWebhook {
    namespace Responses {
      export interface $202 {}
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * User not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace UpdateContact {
    export interface RequestBody {
      /**
       * The contact's email address.
       * example:
       * newuser@example.com
       */
      email: string;
    }
    namespace Responses {
      export interface $200 {}
      /**
       * User does not have sufficient access to update contacts for this tailnet.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace UpdateDeviceKey {
    export interface RequestBody {
      /**
       * - If `true`, disable the device's key expiry. The original key expiry time is still maintained. Upon re-enabling, the key will expire at that original time.
       * - If `false`, enable the device's key expiry. Sets the key to expire at the original expiry time prior to disabling. The key may already have expired. In that case, the device must be re-authenticated.
       *
       * example:
       * true
       */
      keyExpiryDisabled: boolean;
    }
    namespace Responses {
      export interface $200 {}
      /**
       * Device not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace UpdatePostureIntegration {
    export type RequestBody =
      /**
       * A configured PostureIntegration.
       * example:
       * {
       *   "id": "p56wQiqrn7mfDEVEL",
       *   "provider": "intune",
       *   "cloudId": "global",
       *   "clientId": "93013672-b00c-4344-80ca-7ecf74f9dce1",
       *   "tenantId": "d1ae389b-5207-43a2-afca-2de6b03ac7e3",
       *   "configUpdated": "2024-06-18T13:44:28.250168Z",
       *   "status": {
       *     "error": "Invalid Tenant ID.\nMicrosoft error: AADSTS90002: Tenant 'd1ae389b-5207-43a2-afca-2de6b03ac7e3' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud. Check with your subscription administrator, this may happen if there are no active subscriptions for the tenant. Trace ID: f6237360-98a2-4889-913b-e3d80aba7d00 Correlation ID: a2024a6e-7757-4406-8a8d-1b6ac2e03ad5 Timestamp: 2024-06-18 13:44:33Z",
       *     "lastSync": "2024-06-18T08:44:33.872282-05:00",
       *     "matchedCount": 0,
       *     "possibleMatchedCount": 0,
       *     "providerHostCount": 0
       *   }
       * }
       */
      Components.Schemas.PostureIntegration;
    namespace Responses {
      export type $200 =
        /**
         * A configured PostureIntegration.
         * example:
         * {
         *   "id": "p56wQiqrn7mfDEVEL",
         *   "provider": "intune",
         *   "cloudId": "global",
         *   "clientId": "93013672-b00c-4344-80ca-7ecf74f9dce1",
         *   "tenantId": "d1ae389b-5207-43a2-afca-2de6b03ac7e3",
         *   "configUpdated": "2024-06-18T13:44:28.250168Z",
         *   "status": {
         *     "error": "Invalid Tenant ID.\nMicrosoft error: AADSTS90002: Tenant 'd1ae389b-5207-43a2-afca-2de6b03ac7e3' not found. Check to make sure you have the correct tenant ID and are signing into the correct cloud. Check with your subscription administrator, this may happen if there are no active subscriptions for the tenant. Trace ID: f6237360-98a2-4889-913b-e3d80aba7d00 Correlation ID: a2024a6e-7757-4406-8a8d-1b6ac2e03ad5 Timestamp: 2024-06-18 13:44:33Z",
         *     "lastSync": "2024-06-18T08:44:33.872282-05:00",
         *     "matchedCount": 0,
         *     "possibleMatchedCount": 0,
         *     "providerHostCount": 0
         *   }
         * }
         */
        Components.Schemas.PostureIntegration;
      /**
       * User does not have sufficient access to update this posture integration.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Posture integration not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
    }
  }
  namespace UpdateSplitDns {
    export type RequestBody =
      /**
       * Map of domain names to lists of nameservers or to `null`.
       *
       * example:
       * {
       *   "example.com": [
       *     "1.1.1.1",
       *     "1.2.3.4"
       *   ],
       *   "other.com": [
       *     "2.2.2.2"
       *   ]
       * }
       */
      Components.Schemas.SplitDns;
    namespace Responses {
      export type $200 =
        /**
         * Map of domain names to lists of nameservers or to `null`.
         *
         * example:
         * {
         *   "example.com": [
         *     "1.1.1.1",
         *     "1.2.3.4"
         *   ],
         *   "other.com": [
         *     "2.2.2.2"
         *   ]
         * }
         */
        Components.Schemas.SplitDns;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace UpdateTailnetSettings {
    export type RequestBody =
      /**
       * Settings for a tailnet.
       *
       */
      Components.Schemas.TailnetSettings;
    namespace Responses {
      export type $200 =
        /**
         * Settings for a tailnet.
         *
         */
        Components.Schemas.TailnetSettings;
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace UpdateUserRole {
    export interface RequestBody {
      /**
       * The role of the user. Learn more about [user roles](kb/1138/user-roles).
       *
       * example:
       * member
       */
      role?: "owner" | "member" | "admin" | "it-admin" | "network-admin" | "billing-admin" | "auditor";
    }
    namespace Responses {
      export interface $200 {}
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * User not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace UpdateWebhook {
    export interface RequestBody {
      subscriptions?: /**
       * The list of subscribed events that trigger POST requests to the configured endpoint URL.
       * Learn more about [webhook events](/kb/1213/webhooks#events).
       *
       * example:
       * [
       *   "nodeCreated",
       *   "userDeleted"
       * ]
       */
      Components.Schemas.Subscriptions;
    }
    namespace Responses {
      export type $200 = Components.Schemas.Webhook;
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace UserInvites$UserInviteId {
    namespace Parameters {
      export type $0 = Components.Parameters.UserInviteId;
    }
  }
  namespace UserInvites$UserInviteIdResend {
    namespace Parameters {
      export type $0 = Components.Parameters.UserInviteId;
    }
  }
  namespace Users$UserId {
    namespace Parameters {
      export type $0 = Components.Parameters.UserId;
    }
  }
  namespace Users$UserIdApprove {
    namespace Parameters {
      export type $0 = Components.Parameters.UserId;
    }
  }
  namespace Users$UserIdDelete {
    namespace Parameters {
      export type $0 = Components.Parameters.UserId;
    }
  }
  namespace Users$UserIdRestore {
    namespace Parameters {
      export type $0 = Components.Parameters.UserId;
    }
  }
  namespace Users$UserIdRole {
    namespace Parameters {
      export type $0 = Components.Parameters.UserId;
    }
  }
  namespace Users$UserIdSuspend {
    namespace Parameters {
      export type $0 = Components.Parameters.UserId;
    }
  }
  namespace ValidateAndTestPolicyFile {
    export type RequestBody =
      | {
          /**
           * Specifies the user identity to test, which can be
           * a [user's email address](https://tailscale.com/kb/1337/acl-syntax#reference-users),
           * a [group](https://tailscale.com/kb/1337/acl-syntax#groups),
           * a [tag](https://tailscale.com/kb/1068/acl-tags),
           * or a [host](https://tailscale.com/kb/1337/acl-syntax#hosts) that maps to an IP address.
           * The test case runs from the perspective of a device authenticated with the provided identity.
           *
           * example:
           * dave@example.com
           */
          src: string;
          /**
           * Specifies the [device posture attributes](https://tailscale.com/kb/1337/acl-syntax#proto-1)
           * as key-value pairs to use when evaluating posture conditions in access rules.
           * You only need to use this field if the access rules contain
           * [device posture conditions](https://tailscale.com/kb/1288/device-posture#device-posture-conditions).
           *
           * example:
           * {
           *   "node:os": "windows"
           * }
           */
          srcPostureAttrs?: {
            [name: string]: string | number | boolean;
          };
          /**
           * Specifies the IP protocol for `accept` and `deny` rules,
           * similar to the `proto` field in [ACL rules](https://tailscale.com/kb/1337/acl-syntax#acls).
           * When omitted, the test checks for either TCP or UDP access.
           *
           * example:
           * tcp
           */
          proto?: string;
          /**
           * Specifies destinations to accept. Each destination in the list is of the form `host:port`
           * where `port` is a single numeric port and `host` is in the format described in the
           * [acl syntax](https://tailscale.com/kb/1337/acl-syntax#accept-and-deny-destinations) documentation.
           *
           * Sources in `src` and `destinations` must refer to specific entities and do not support `*` wildcards.
           * For example, an `accept` destination cannot be `tags:*`.
           *
           */
          accept?: string[];
          /**
           * Specifies destinations to deny. Each destination in the list is of the form `host:port`
           * where `port` is a single numeric port and `host` is in the format described in the
           * [acl syntax](https://tailscale.com/kb/1337/acl-syntax#accept-and-deny-destinations) documentation.
           *
           * Sources in `src` and `destinations` must refer to specific entities and do not support `*` wildcards.
           * For example, a `deny` destination cannot be `tags:*`.
           *
           */
          deny?: string[];
        }[]
      | string;
    namespace Responses {
      export interface $200 {
        /**
         * example:
         * test(s) failed
         */
        message?: string;
        /**
         * example:
         * [
         *   {
         *     "user": "user1@example.com",
         *     "errors": [
         *       "address \"2.2.2.2:22\": want: Drop, got: Accept"
         *     ]
         *   }
         * ]
         */
        data?: {
          [key: string]: any;
        }[];
      }
      export type $400 =
        /**
         * example:
         * {
         *   "message": "bad request"
         * }
         */
        Components.Responses.$400;
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export type $500 =
        /**
         * example:
         * {
         *   "message": "internal server error"
         * }
         */
        Components.Responses.$500;
    }
  }
  namespace ValidateAwsExternalId {
    /**
     * example:
     * {
     *   "roleArn": "arn:aws:iam::000000000000:role/tailscale-log-writer"
     * }
     */
    export interface RequestBody {
      /**
       * ARN of the AWS IAM role to validate with this external ID.
       */
      roleArn?: string;
    }
    namespace Responses {
      export interface $200 {}
      /**
       * User does not have sufficient access for this tailnet.
       */
      export type $403 =
        /**
         * example:
         * {
         *   "message": "forbidden"
         * }
         */
        Components.Responses.$403;
      /**
       * Tailnet or external ID not found.
       */
      export type $404 =
        /**
         * example:
         * {
         *   "message": "not found"
         * }
         */
        Components.Responses.$404;
      export interface $422 {
        /**
         * The reason for validation failure.
         */
        message?: string;
      }
    }
  }
  namespace Webhooks$EndpointId {
    namespace Parameters {
      export type $0 = Components.Parameters.EndpointId;
    }
  }
  namespace Webhooks$EndpointIdRotate {
    namespace Parameters {
      export type $0 = Components.Parameters.EndpointId;
    }
  }
  namespace Webhooks$EndpointIdTest {
    namespace Parameters {
      export type $0 = Components.Parameters.EndpointId;
    }
  }
}

export interface OperationMethods {
  /**
   * listTailnetDevices - List tailnet devices
   *
   * Lists the devices in a tailnet.
   *
   * OAuth Scope: `devices:core:read`.
   *
   */
  "listTailnetDevices"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListTailnetDevices.Responses.$200>;
  /**
   * getDevice - Get a device
   *
   * Retrieve the details for the specified device.
   *
   * OAuth Scope: `devices:core:read`.
   *
   */
  "getDevice"(parameters?: Parameters<Paths.GetDevice.QueryParameters> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetDevice.Responses.$200>;
  /**
   * deleteDevice - Delete a device
   *
   * Deletes the device from its tailnet.
   * The device must belong to the requesting user's tailnet.
   * Deleting devices shared with the tailnet is not supported.
   *
   * OAuth Scope: `devices:core`.
   *
   */
  "deleteDevice"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteDevice.Responses.$200>;
  /**
   * expireDeviceKey - Expire a device's key
   *
   * Mark a device's node key as expired.
   * This will require the device to re-authenticate in order to connect to the tailnet.
   * The device must belong to the requesting user's tailnet.
   *
   * OAuth Scope: `devices:core`.
   *
   */
  "expireDeviceKey"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ExpireDeviceKey.Responses.$200>;
  /**
   * listDeviceRoutes - List device routes
   *
   * Retrieve the list of subnet routes that a device is advertising,
   * as well as those that are enabled for it.
   *
   * Routes must be both advertised and enabled for a device to act as a subnet router or exit node.
   * If a device has advertised routes, they are not exposed to traffic until they are enabled.
   * Conversely, if routes are enabled before they are advertised, they are not available for routing until the device in question has advertised them.
   *
   * Learn more about [subnet routers](/kb/1019/subnets) and [exit nodes](/kb/1103/exit-nodes).
   *
   * OAuth Scope: `devices:routes:read`.
   *
   */
  "listDeviceRoutes"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListDeviceRoutes.Responses.$200>;
  /**
   * setDeviceRoutes - Set device routes
   *
   * Set a device's enabled subnet routes by replacing the existing list of subnet routes with the supplied parameters.
   * [Advertised routes](/kb/1019/subnets#advertise-subnet-routes) cannot be set through the API, since they must be set directly on the device.
   *
   * Routes must be both advertised and enabled for a device to act as a subnet router or exit node.
   * If a device has advertised routes, they are not exposed to traffic until they are enabled.
   * Conversely, if routes are enabled before they are advertised, they are not available for routing until the device in question has advertised them.
   *
   * Learn more about [subnet routers](/kb/1019/subnets) and [exit nodes](/kb/1103/exit-nodes).
   *
   * OAuth Scope: `devices:routes`.
   *
   */
  "setDeviceRoutes"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.SetDeviceRoutes.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.SetDeviceRoutes.Responses.$200>;
  /**
   * authorizeDevice - Authorize device
   *
   * This call marks a device as authorized or revokes its authorization for tailnets where device authorization is required,
   * according to the authorized field in the payload.
   *
   * OAuth Scope: `devices:core`.
   *
   */
  "authorizeDevice"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.AuthorizeDevice.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.AuthorizeDevice.Responses.$200>;
  /**
   * setDeviceName - Set device name
   *
   * When a device is added to a tailnet, its Tailscale [device name](https://tailscale.com/kb/1098/machine-names) (also sometimes referred to as machine name) is generated from its OS hostname.
   * The device name is the canonical name for the device on your tailnet.
   *
   * Device name changes immediately get propogated through your tailnet, so be aware that any existing [Magic DNS](https://tailscale.com/kb/1081/magicdns) URLs using the old name will no longer work.
   *
   * OAuth Scope: `devices:core`.
   *
   */
  "setDeviceName"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.SetDeviceName.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.SetDeviceName.Responses.$200>;
  /**
   * setDeviceTags - Set device tags
   *
   * Tags let you assign an identity to a device that is separate from human users, and use that identity as part of an ACL to restrict access.
   * Tags are similar to role accounts, but more flexible.
   *
   * Tags are created in the tailnet policy file by defining the tag and an owner of the tag.
   * Once a device is tagged, the tag is the owner of that device.
   * A single node can have multiple tags assigned.
   *
   * Consult the policy file for your tailnet in the [admin console](https://login.tailscale.com/admin/acls) for the list of tags that have been created for your tailnet.
   * Learn more about [tags](https://tailscale.com/kb/1068/).
   *
   * OAuth Scope: `devices:core`.
   *
   */
  "setDeviceTags"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.SetDeviceTags.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.SetDeviceTags.Responses.$200>;
  /**
   * updateDeviceKey - Update device key
   *
   * When a device is added to a tailnet, its key expiry is set according to the tailnet's key expiry setting.
   * If the key is not refreshed and expires, the device can no longer communicate with other devices in the tailnet.
   *
   * OAuth Scope: `devices:core`.
   *
   */
  "updateDeviceKey"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.UpdateDeviceKey.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.UpdateDeviceKey.Responses.$200>;
  /**
   * setDeviceIp - Set device IPv4 address
   *
   * When a device is added to a tailnet, its Tailscale IPv4 address is set at random either from the CGNAT range,
   * or a subset of the CGNAT range specified by an [ip pool](https://tailscale.com/kb/1304/ip-pool).
   * This endpoint can be used to replace the existing IPv4 address with a specific value.
   *
   * This action will break any existing connections to this machine.
   * You will need to reconnect to this machine using the new IP address.
   * You may also need to flush your DNS cache.
   *
   * OAuth Scope: `devices:core`.
   *
   */
  "setDeviceIp"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.SetDeviceIp.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.SetDeviceIp.Responses.$200>;
  /**
   * getDevicePostureAttributes - Get device posture attributes
   *
   * Retrieve all posture attributes for the specified device.
   * This returns a JSON object of all the key-value pairs of posture attributes for the device.
   *
   * OAuth Scope: `devices:posture_attributes:read`.
   *
   */
  "getDevicePostureAttributes"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetDevicePostureAttributes.Responses.$200>;
  /**
   * setCustomDevicePostureAttributes - Set custom device posture attributes
   *
   * Create or update a custom posture attribute on the specified device.
   * User-managed attributes must be in the custom namespace,
   * which is indicated by prefixing the attribute key with `custom:`.
   *
   * Custom device posture attributes are available for the Personal and Enterprise plans.
   *
   * OAuth Scope: `devices:posture_attributes`.
   *
   */
  "setCustomDevicePostureAttributes"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.SetCustomDevicePostureAttributes.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.SetCustomDevicePostureAttributes.Responses.$200>;
  /**
   * deleteCustomDevicePostureAttributes - Delete custom device posture attributes
   *
   * Delete a posture attribute from the specified device.
   * This is only applicable to user-managed posture attributes in the custom namespace,
   * which is indicated by prefixing the attribute key with `custom:`.
   *
   * OAuth Scope: `devices:posture_attributes`.
   *
   */
  "deleteCustomDevicePostureAttributes"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.DeleteCustomDevicePostureAttributes.Responses.$200>;
  /**
   * listDeviceInvites - List device invites
   *
   * List all share invites for a device.
   *
   * OAuth Scope: `device_invites:read`.
   *
   */
  "listDeviceInvites"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListDeviceInvites.Responses.$200>;
  /**
   * createDeviceInvites - Create device invites
   *
   * Create new share invites for a device.
   *
   * Note that device invites cannot be created using an API access token generated from an OAuth client as the shared device is scoped to a user.
   *
   */
  "createDeviceInvites"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.CreateDeviceInvites.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.CreateDeviceInvites.Responses.$200>;
  /**
   * listUserInvites - List user invites
   *
   * List all open (not yet accepted) user invites to the tailnet.
   */
  "listUserInvites"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListUserInvites.Responses.$200>;
  /**
   * createUserInvites - Create user invites
   *
   * Create, and optionally email out, new user invites to join the tailnet.
   *
   * > ⓘ Only permitted for user-owned keys, because invites require an inviting user.
   *
   */
  "createUserInvites"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.CreateUserInvites.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.CreateUserInvites.Responses.$200>;
  /**
   * getUserInvite - Get a user invite
   *
   * Retrieve a specific user invite.
   *
   */
  "getUserInvite"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetUserInvite.Responses.$200>;
  /**
   * deleteUserInvite - Delete a user invite
   *
   * Deletes a specific user invite.
   *
   * > ⓘ Only permitted for user-owned keys, because invites require an inviting user.
   *
   */
  "deleteUserInvite"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteUserInvite.Responses.$200>;
  /**
   * resendUserInvite - Resend a user invite
   *
   * Resend a user invite by email. You can only use this if the specified invite
   * was originally created with an email specified.
   * Refer to [creating user invites for a tailnet](#tag/userinvites/post/tailnet/{tailnet}/user-invites).
   *
   * Note: Invite resends are rate limited to one per minute.
   *
   * > ⓘ Only permitted for user-owned keys, because invites require an inviting user.
   *
   */
  "resendUserInvite"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ResendUserInvite.Responses.$200>;
  /**
   * getDeviceInvite - Get a device invite
   *
   * Retrieve a specific device invite.
   *
   * OAuth Scope: `device_invites:read`.
   *
   */
  "getDeviceInvite"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetDeviceInvite.Responses.$200>;
  /**
   * deleteDeviceInvite - Delete a device invite
   *
   * Delete a specific device invite.
   *
   * OAuth Scope: `device_invites`.
   *
   */
  "deleteDeviceInvite"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteDeviceInvite.Responses.$200>;
  /**
   * resendDeviceInvite - Resend a device invite
   *
   * Resend a device invite by email. You can only use this if the specified invite
   * was originally created with an email specified.
   * Refer to [creating device invites for a device](#tag/deviceinvites/post/device/{deviceId}/device-invites).
   *
   * Note: Invite resends are rate limited to one per minute.
   *
   * Note that device invites cannot be resent using an API access token generated from an OAuth client as the shared device is scoped to a user.
   *
   */
  "resendDeviceInvite"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ResendDeviceInvite.Responses.$200>;
  /**
   * acceptDeviceInvite - Accept a device invite
   *
   * Accepts the invitation to share a device into the requesting user's tailnet.
   *
   * Note that device invites cannot be accepted using an API access token generated from an OAuth client as the shared device is scoped to a user.
   *
   */
  "acceptDeviceInvite"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.AcceptDeviceInvite.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.AcceptDeviceInvite.Responses.$200>;
  /**
   * listConfigurationAuditLogs - List configuration audit logs
   *
   * List all configuration audit logs for a tailnet.
   *
   * OAuth Scope: `logs:configuration:read`.
   *
   */
  "listConfigurationAuditLogs"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListConfigurationAuditLogs.Responses.$200>;
  /**
   * listNetworkFlowLogs - List network flow logs
   *
   * List all network flow logs for a tailnet.
   *
   * OAuth Scope: `logs:network:read`.
   *
   */
  "listNetworkFlowLogs"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListNetworkFlowLogs.Responses.$200>;
  /**
   * getLogStreamingStatus - Get log streaming status
   *
   * Retrieve the log streaming status for the provided log type.
   *
   * OAuth Scope: `log_streaming:read`.
   *
   */
  "getLogStreamingStatus"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetLogStreamingStatus.Responses.$200>;
  /**
   * getLogStreamingConfiguration - Get log streaming configuration
   *
   * Retrieve the log streaming configuration for the provided log type.
   *
   * OAuth Scope: `log_streaming:read`.
   *
   */
  "getLogStreamingConfiguration"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetLogStreamingConfiguration.Responses.$200>;
  /**
   * setLogStreamingConfiguration - Set log streaming configuration
   *
   * Set the log streaming configuration for the provided log type.
   *
   * OAuth Scope: `log_streaming`. `device_invites` and `policy_file` are also required if streaming to a [private endpoint](https://tailscale.com/kb/1255/log-streaming#private-endpoints).
   *
   */
  "setLogStreamingConfiguration"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.SetLogStreamingConfiguration.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.SetLogStreamingConfiguration.Responses.$200>;
  /**
   * disableLogStreaming - Disable log streaming
   *
   * Delete the log streaming configuration for the provided log type.
   *
   * OAuth Scope: `log_streaming`.
   *
   */
  "disableLogStreaming"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DisableLogStreaming.Responses.$200>;
  /**
   * getAwsExternalId - Create or get AWS external id
   *
   * Get an AWS external id to use for streaming tailnet logs to S3 using role-based authentication,
   * creating a new one for this tailnet when necessary.
   *
   * OAuth Scope: `log_streaming`.
   *
   */
  "getAwsExternalId"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.GetAwsExternalId.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.GetAwsExternalId.Responses.$200>;
  /**
   * validateAwsExternalId - Validate external ID integration with IAM role trust policy
   *
   * Validate that Tailscale can assume your IAM role with (and only with)
   * this external ID.
   *
   * OAuth Scope: `log_streaming`.
   *
   */
  "validateAwsExternalId"(
    parameters?: Parameters<Paths.Tailnet$TailnetAwsExternalId$IdValidateAwsTrustPolicy.PathParameters> | null,
    data?: Paths.ValidateAwsExternalId.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.ValidateAwsExternalId.Responses.$200>;
  /**
   * listDnsNameservers - List DNS nameservers
   *
   * Lists the global DNS nameservers for a tailnet.
   *
   */
  "listDnsNameservers"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListDnsNameservers.Responses.$200>;
  /**
   * setDnsNameservers - Set DNS nameservers
   *
   * Replaces the list of global DNS nameservers for the given tailnet with the list supplied in the request.
   *
   * Note that changing the list of DNS nameservers may also affect the status of MagicDNS (if MagicDNS is on; learn about [MagicDNS](https://tailscale.com/kb/1081)).
   * If all nameservers have been removed, MagicDNS will be automatically disabled (until explicitly turned back on by the user).
   *
   */
  "setDnsNameservers"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.SetDnsNameservers.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.SetDnsNameservers.Responses.$200>;
  /**
   * getDnsPreferences - Get DNS preferences
   *
   * Retrieves the DNS preferences that are currently set for the given tailnet.
   *
   */
  "getDnsPreferences"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetDnsPreferences.Responses.$200>;
  /**
   * setDnsPreferences - Set DNS preferences
   *
   * Set the DNS preferences for a tailnet; specifically, the MagicDNS setting.
   * Note that MagicDNS is dependent on DNS servers.
   * Learn about [MagicDNS](https://tailscale.com/kb/1081).
   *
   * If there is at least one DNS server, then MagicDNS can be enabled.
   * Otherwise, it returns an error.
   *
   * Note that removing all nameservers will turn off MagicDNS.
   * To reenable it, nameservers must be added back, and MagicDNS must be explicitly turned on.
   *
   */
  "setDnsPreferences"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.SetDnsPreferences.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.SetDnsPreferences.Responses.$200>;
  /**
   * listDnsSearchPaths - List DNS search paths
   *
   * Retrieves the list of search paths, also referred to as *search domains*, that is currently set for the given tailnet.
   *
   */
  "listDnsSearchPaths"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListDnsSearchPaths.Responses.$200>;
  /**
   * setDnsSearchPaths - Set DNS search paths
   *
   * Replaces the list of search paths for the given tailnet.
   *
   */
  "setDnsSearchPaths"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.SetDnsSearchPaths.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.SetDnsSearchPaths.Responses.$200>;
  /**
   * getSplitDns - Get split DNS
   *
   * Retrieves the split DNS settings, which is a map from domains to lists of nameservers, that is currently set for the given tailnet.
   *
   */
  "getSplitDns"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetSplitDns.Responses.$200>;
  /**
   * setSplitDns - Set split DNS
   *
   * Replaces the split DNS settings for a given tailnet.
   * Setting the value of a mapping to `null` clears the nameservers for that domain.
   * Sending an empty object clears nameservers for all domains.
   *
   */
  "setSplitDns"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.SetSplitDns.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.SetSplitDns.Responses.$200>;
  /**
   * updateSplitDns - Update split DNS
   *
   * Performs partial updates of the split DNS settings for a given tailnet.
   * Only domains specified in the request map will be modified.
   * Setting the value of a mapping to `null` clears the nameservers for that domain.
   *
   */
  "updateSplitDns"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.UpdateSplitDns.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.UpdateSplitDns.Responses.$200>;
  /**
   * listTailnetKeys - List tailnet keys
   *
   * Returns a list of active auth keys, API access tokens and OAuth clients.
   *
   * If the parameter {all} was not specified, the set of keys returned depends on the access token used to make the request:
   * - If the API call is made with a user-owned API access token, this returns only the keys owned by that user.
   * - If the API call is made with an access token derived from an OAuth client, this returns all OAuth clients for the tailnet.
   *
   * OAuth Scope: `api_access_tokens:read` grants access to personal API access tokens.
   *
   * OAuth Scope: `auth_keys:read` grants access to machine auth keys.
   *
   * OAuth Scope: `oauth_keys:read` grants access to OAuth clients and OAuth tokens.
   *
   */
  "listTailnetKeys"(parameters?: Parameters<Paths.ListTailnetKeys.QueryParameters> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListTailnetKeys.Responses.$200>;
  /**
   * createAuthKey - Create an auth key or OAuth client
   *
   * Creates a new [auth key](https://tailscale.com/kb/1085/) or [OAuth client](https://tailscale.com/kb/1215/) in the specified tailnet.
   * The key will be associated with the user who owns the API access token used to make this call,
   * or, if the call is made with an access token derived from an OAuth client, the key will be owned by the tailnet.
   *
   * Returns a JSON object with the generated key.
   * The key should be recorded and kept safe and secure because it wields the capabilities or scopes specified in the request.
   * The identity of the key is embedded in the key itself and can be used to perform operations on the key (e.g., revoking it or retrieving information about it).
   * The full key can no longer be retrieved after the initial response.
   *
   * OAuth Scope: `auth_keys` grants access to create machine auth keys.
   *
   * OAuth Scope: `oauth_keys` grants access to create OAuth clients.
   *
   */
  "createAuthKey"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.CreateAuthKey.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.CreateAuthKey.Responses.$200>;
  /**
   * getKey - Get key
   *
   * Returns a JSON object with information about a specific api access token, OAuth client or auth key, such as its creation and expiration dates and its capabilities.
   *
   * OAuth Scope: `api_access_tokens:read` grants access to personal API access tokens.
   *
   * OAuth Scope: `auth_keys:read` grants access to machine auth keys.
   *
   * OAuth Scope: `oauth_keys:read` grants access to OAuth clients and OAuth tokens.
   *
   */
  "getKey"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetKey.Responses.$200>;
  /**
   * deleteKey - Delete key
   *
   * Deletes a specific api access token or auth key.
   *
   * OAuth Scope: `api_access_tokens` grants access to personal API access tokens.
   *
   * OAuth Scope: `auth_keys` grants access to machine auth keys.
   *
   * OAuth Scope: `oauth_keys` grants access to OAuth clients and OAuth tokens.
   *
   */
  "deleteKey"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteKey.Responses.$200>;
  /**
   * getPolicyFile - Get policy file
   *
   * Retrieves the current policy file for the given tailnet;
   * this includes the ACL along with the rules and tests that have been defined.
   *
   * This method can return the policy file as JSON or HuJSON, depending on the Accept header.
   * The response also includes an `ETag` header, which can be optionally included when [setting the policy file](#tag/policyfile/post/tailnet/{tailnet}/acl) to avoid missed updates.
   *
   * Learn more about [policy file ACL syntax](https://tailscale.com/kb/1337/acl-syntax).
   *
   * OAuth Scope: `policy_file:read`.
   *
   */
  "getPolicyFile"(parameters?: Parameters<Paths.GetPolicyFile.QueryParameters> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetPolicyFile.Responses.$200>;
  /**
   * setPolicyFile - Set policy file
   *
   * Sets the ACL for the given tailnet. HuJSON and JSON are both accepted inputs.
   * An `If-Match` header can be set to avoid missed updates.
   *
   * On success, returns the updated ACL in JSON or HuJSON according to the `Accept` header.
   * Otherwise, errors are returned for incorrectly defined ACLs, ACLs with failing tests on attempted updates, and mismatched `If-Match` header and `ETag`.
   *
   * Learn more about [policy file ACL syntax](https://tailscale.com/kb/1337/acl-syntax).
   *
   * OAuth Scope: `policy_file`.
   *
   */
  "setPolicyFile"(
    parameters?: Parameters<Paths.SetPolicyFile.HeaderParameters> | null,
    data?: Paths.SetPolicyFile.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.SetPolicyFile.Responses.$200>;
  /**
   * previewRuleMatches - Preview rule matches
   *
   * When given a user or IP port to match against,
   * returns the tailnet policy rules that apply to that resource,
   * without saving the policy file to the server.
   *
   */
  "previewRuleMatches"(
    parameters?: Parameters<Paths.Tailnet$TailnetAclPreview.QueryParameters> | null,
    data?: Paths.PreviewRuleMatches.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.PreviewRuleMatches.Responses.$200>;
  /**
   * validateAndTestPolicyFile - Validate and test policy file
   *
   * This endpoint works in one of two modes, neither of which modifies your current tailnet policy file:
   *
   * - Run ACL tests: When the request body contains ACL tests as a JSON array,
   *   Tailscale runs ACL tests against the tailnet's current policy file.
   *   Learn more about [ACL tests](https://tailscale.com/kb/1337/acl-syntax#tests).
   * - Validate a new policy file: When the request body is a JSON object,
   *   Tailscale interprets the body as a hypothetical new tailnet policy file with new ACLs,
   *   including any new rules and tests.
   *   It validates that the policy file is parsable and runs tests to validate the existing rules.
   *
   * In either case, this method does not modify the tailnet policy file in any way.
   *
   * OAuth Scope: `policy_file:read`.
   *
   */
  "validateAndTestPolicyFile"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.ValidateAndTestPolicyFile.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.ValidateAndTestPolicyFile.Responses.$200>;
  /**
   * getPostureIntegrations - List all posture integrations
   *
   * List all of the posture integrations for a tailnet.
   *
   * OAuth Scope: `feature_settings:read`.
   *
   */
  "getPostureIntegrations"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetPostureIntegrations.Responses.$200>;
  /**
   * createPostureIntegration - Create a posture integration
   *
   * Create a posture integration, returning the resulting [PostureIntegration](#model/postureintegration).
   *
   * Must include `provider` and `clientSecret`.
   *
   * Currently, only one integration for each provider is supported.
   *
   * OAuth Scope: `feature_settings`.
   *
   */
  "createPostureIntegration"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.CreatePostureIntegration.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.CreatePostureIntegration.Responses.$200>;
  /**
   * getPostureIntegration - Get a posture integration
   *
   * Gets the posture integration identified by `{id}`.
   *
   * OAuth Scope: `feature_settings:read`.
   *
   */
  "getPostureIntegration"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetPostureIntegration.Responses.$200>;
  /**
   * updatePostureIntegration - Update a posture integration
   *
   * Updates the posture integration identified by `{id}`. You may omit the `clientSecret` from your request to retain the previously configured `clientSecret`.
   *
   * OAuth Scope: `feature_settings`.
   *
   */
  "updatePostureIntegration"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.UpdatePostureIntegration.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.UpdatePostureIntegration.Responses.$200>;
  /**
   * deletePostureIntegration - Delete a posture integration
   *
   * Delete a specific posture integration.
   *
   * OAuth Scope: `feature_settings`.
   *
   */
  "deletePostureIntegration"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeletePostureIntegration.Responses.$200>;
  /**
   * listUsers - List users
   *
   * List all users of a tailnet.
   *
   * OAuth Scope: `users:read`.
   *
   */
  "listUsers"(parameters?: Parameters<Paths.Tailnet$TailnetUsers.QueryParameters> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListUsers.Responses.$200>;
  /**
   * getUser - Get a user
   *
   * Retrieve details about the specified user.
   *
   * OAuth Scope: `users:read`.
   *
   */
  "getUser"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetUser.Responses.$200>;
  /**
   * updateUserRole - Update user role
   *
   * Update the role for the specified user.
   *
   * Learn more about [user roles](kb/1138/user-roles).
   *
   * OAuth Scope: `users`.
   *
   * > ⓘ User-based access tokens cannot update their own user's role.
   *
   */
  "updateUserRole"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.UpdateUserRole.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.UpdateUserRole.Responses.$200>;
  /**
   * approveUser - Approve a user
   *
   * Approve a pending user's access to the tailnet.
   * This is a no-op if user approval has not been enabled for the tailnet, or if the user is already approved.
   *
   * User approval can be managed using the [tailnet settings endpoints](#tag/tailnetsettings).
   *
   * Learn more about [user approval](/kb/1239/user-approval) and [enabling user approval for your network](/kb/1239/user-approval#enable-user-approval-for-your-network).
   *
   * OAuth Scope: `users`.
   *
   * > ⓘ User-based access tokens cannot approve their own user.
   *
   */
  "approveUser"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ApproveUser.Responses.$200>;
  /**
   * suspendUser - Suspend a user
   *
   * > ⓘ This endpoint is available for the [Personal and Enterprise plans](/pricing).
   *
   * Suspends a user from their tailnet. Learn more about [suspending users](/kb/1145/remove-team-members#suspending-users).
   *
   * OAuth Scope: `users`.
   *
   * > ⓘ User-based access tokens cannot suspend their own user.
   *
   */
  "suspendUser"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.SuspendUser.Responses.$200>;
  /**
   * restoreUser - Restore a user
   *
   * > ⓘ This endpoint is available for the [Personal and Enterprise plans](/pricing).
   *
   * Restores a suspended user's access to their tailnet. Learn more about [restoring users](/kb/1145/remove-team-members#restoring-users).
   *
   * OAuth Scope: `users`.
   *
   * > ⓘ User-based access tokens cannot restore their own user.
   *
   */
  "restoreUser"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.RestoreUser.Responses.$200>;
  /**
   * deleteUser - Delete a user
   *
   * > ⓘ This endpoint is available for the [Personal and Enterprise plans](/pricing).
   *
   * Delete a user from their tailnet. Learn more about [deleting users](/kb/1145/remove-team-members#deleting-users).
   *
   * OAuth Scope: `users`.
   *
   * > ⓘ User-based access tokens cannot delete their own user.
   *
   */
  "deleteUser"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteUser.Responses.$200>;
  /**
   * getContacts - Get contacts
   *
   * Retrieve the tailnet's current contacts.
   *
   * OAuth Scope: `account_settings:read`.
   *
   */
  "getContacts"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetContacts.Responses.$200>;
  /**
   * updateContact - Update contact
   *
   * Update the preferences for this type of contact. If the email address has changed, the system will send a verification email to confirm the change.
   *
   * OAuth Scope: `account_settings`.
   *
   */
  "updateContact"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.UpdateContact.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.UpdateContact.Responses.$200>;
  /**
   * resendContactVerificationEmail - Resend verification email
   *
   * Resends the verification email for this contact, if and only if verification is still pending.
   *
   * OAuth Scope: `account_settings`.
   *
   */
  "resendContactVerificationEmail"(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.ResendContactVerificationEmail.Responses.$200>;
  /**
   * listWebhooks - List webhooks
   *
   * List all webhooks for a tailnet.
   *
   * OAuth Scope: `webhooks:read`.
   *
   */
  "listWebhooks"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListWebhooks.Responses.$200>;
  /**
   * createWebhook - Create a webhook
   *
   * Create a webhook within a tailnet.
   *
   * OAuth Scope: `webhooks`.
   *
   */
  "createWebhook"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.CreateWebhook.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.CreateWebhook.Responses.$200>;
  /**
   * getWebhook - Get webhook
   *
   * Retrieve a specific webhook.
   *
   * OAuth Scope: `webhooks:read`.
   *
   */
  "getWebhook"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetWebhook.Responses.$200>;
  /**
   * updateWebhook - Update webhook
   *
   * Update a specific webhook.
   *
   * OAuth Scope: `webhooks`.
   *
   */
  "updateWebhook"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.UpdateWebhook.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.UpdateWebhook.Responses.$200>;
  /**
   * deleteWebhook - Delete webhook
   *
   * Delete a specific webhook.
   *
   * OAuth Scope: `webhooks`.
   *
   */
  "deleteWebhook"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteWebhook.Responses.$200>;
  /**
   * testWebhook - Test a webhook
   *
   * Test a specific webhook by sending out a test event to the endpoint URL.
   * This endpoint queues the event which is sent out asynchronously.
   *
   * If your webhook is configured correctly, within a few seconds your webhook endpoint should receive an event with type of "test".
   *
   * OAuth Scope: `webhooks`.
   *
   */
  "testWebhook"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.TestWebhook.Responses.$202>;
  /**
   * rotateWebhookSecret - Rotate webhook secret
   *
   * Rotate and generate a new secret for a specific webhook.
   *
   * This secret is used for generating the `Tailscale-Webhook-Signature` header in requests sent to the endpoint URL.
   * Learn more about [verifying webhook event signatures](/kb/1213/webhooks#verifying-an-event-signature).
   *
   * OAuth Scope: `webhooks`.
   *
   */
  "rotateWebhookSecret"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.RotateWebhookSecret.Responses.$200>;
  /**
   * getTailnetSettings - Get tailnet settings
   *
   * Retrieve the settings for a specific tailnet.
   *
   * OAuth Scope: `feature_settings:read` - required to view all settings except those governed by the below scopes.
   *
   * OAuth Scope: `logs:network:read` - required to view the `networkFlowLoggingOn` setting.
   *
   * OAuth Scope: `policy_file:read` - required to view the `aclsExternallyManagedOn` & `aclsExternalLink` settings.
   *
   */
  "getTailnetSettings"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetTailnetSettings.Responses.$200>;
  /**
   * updateTailnetSettings - Update tailnet settings
   *
   * Update the settings for a specific tailnet.
   *
   * OAuth Scope: `feature_settings` - required to update all settings except those governed by the below scopes.
   *
   * OAuth Scope: `logs:network` - required to update the `networkFlowLoggingOn` setting.
   *
   * OAuth Scope: `policy_file` - required to update the `aclsExternallyManagedOn` & `aclsExternalLink` settings.
   *
   */
  "updateTailnetSettings"(
    parameters?: Parameters<Components.TailnetParamsObject> | null,
    data?: Paths.UpdateTailnetSettings.RequestBody,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.UpdateTailnetSettings.Responses.$200>;
}

export interface PathsDictionary {
  ["/tailnet/{tailnet}/devices"]: {
    /**
     * listTailnetDevices - List tailnet devices
     *
     * Lists the devices in a tailnet.
     *
     * OAuth Scope: `devices:core:read`.
     *
     */
    "get"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListTailnetDevices.Responses.$200>;
  };
  ["/device/{deviceId}"]: {
    /**
     * getDevice - Get a device
     *
     * Retrieve the details for the specified device.
     *
     * OAuth Scope: `devices:core:read`.
     *
     */
    "get"(parameters?: Parameters<Paths.GetDevice.QueryParameters> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetDevice.Responses.$200>;
    /**
     * deleteDevice - Delete a device
     *
     * Deletes the device from its tailnet.
     * The device must belong to the requesting user's tailnet.
     * Deleting devices shared with the tailnet is not supported.
     *
     * OAuth Scope: `devices:core`.
     *
     */
    "delete"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteDevice.Responses.$200>;
  };
  ["/device/{deviceId}/expire"]: {
    /**
     * expireDeviceKey - Expire a device's key
     *
     * Mark a device's node key as expired.
     * This will require the device to re-authenticate in order to connect to the tailnet.
     * The device must belong to the requesting user's tailnet.
     *
     * OAuth Scope: `devices:core`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ExpireDeviceKey.Responses.$200>;
  };
  ["/device/{deviceId}/routes"]: {
    /**
     * listDeviceRoutes - List device routes
     *
     * Retrieve the list of subnet routes that a device is advertising,
     * as well as those that are enabled for it.
     *
     * Routes must be both advertised and enabled for a device to act as a subnet router or exit node.
     * If a device has advertised routes, they are not exposed to traffic until they are enabled.
     * Conversely, if routes are enabled before they are advertised, they are not available for routing until the device in question has advertised them.
     *
     * Learn more about [subnet routers](/kb/1019/subnets) and [exit nodes](/kb/1103/exit-nodes).
     *
     * OAuth Scope: `devices:routes:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListDeviceRoutes.Responses.$200>;
    /**
     * setDeviceRoutes - Set device routes
     *
     * Set a device's enabled subnet routes by replacing the existing list of subnet routes with the supplied parameters.
     * [Advertised routes](/kb/1019/subnets#advertise-subnet-routes) cannot be set through the API, since they must be set directly on the device.
     *
     * Routes must be both advertised and enabled for a device to act as a subnet router or exit node.
     * If a device has advertised routes, they are not exposed to traffic until they are enabled.
     * Conversely, if routes are enabled before they are advertised, they are not available for routing until the device in question has advertised them.
     *
     * Learn more about [subnet routers](/kb/1019/subnets) and [exit nodes](/kb/1103/exit-nodes).
     *
     * OAuth Scope: `devices:routes`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.SetDeviceRoutes.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.SetDeviceRoutes.Responses.$200>;
  };
  ["/device/{deviceId}/authorized"]: {
    /**
     * authorizeDevice - Authorize device
     *
     * This call marks a device as authorized or revokes its authorization for tailnets where device authorization is required,
     * according to the authorized field in the payload.
     *
     * OAuth Scope: `devices:core`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.AuthorizeDevice.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.AuthorizeDevice.Responses.$200>;
  };
  ["/device/{deviceId}/name"]: {
    /**
     * setDeviceName - Set device name
     *
     * When a device is added to a tailnet, its Tailscale [device name](https://tailscale.com/kb/1098/machine-names) (also sometimes referred to as machine name) is generated from its OS hostname.
     * The device name is the canonical name for the device on your tailnet.
     *
     * Device name changes immediately get propogated through your tailnet, so be aware that any existing [Magic DNS](https://tailscale.com/kb/1081/magicdns) URLs using the old name will no longer work.
     *
     * OAuth Scope: `devices:core`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.SetDeviceName.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.SetDeviceName.Responses.$200>;
  };
  ["/device/{deviceId}/tags"]: {
    /**
     * setDeviceTags - Set device tags
     *
     * Tags let you assign an identity to a device that is separate from human users, and use that identity as part of an ACL to restrict access.
     * Tags are similar to role accounts, but more flexible.
     *
     * Tags are created in the tailnet policy file by defining the tag and an owner of the tag.
     * Once a device is tagged, the tag is the owner of that device.
     * A single node can have multiple tags assigned.
     *
     * Consult the policy file for your tailnet in the [admin console](https://login.tailscale.com/admin/acls) for the list of tags that have been created for your tailnet.
     * Learn more about [tags](https://tailscale.com/kb/1068/).
     *
     * OAuth Scope: `devices:core`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.SetDeviceTags.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.SetDeviceTags.Responses.$200>;
  };
  ["/device/{deviceId}/key"]: {
    /**
     * updateDeviceKey - Update device key
     *
     * When a device is added to a tailnet, its key expiry is set according to the tailnet's key expiry setting.
     * If the key is not refreshed and expires, the device can no longer communicate with other devices in the tailnet.
     *
     * OAuth Scope: `devices:core`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.UpdateDeviceKey.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.UpdateDeviceKey.Responses.$200>;
  };
  ["/device/{deviceId}/ip"]: {
    /**
     * setDeviceIp - Set device IPv4 address
     *
     * When a device is added to a tailnet, its Tailscale IPv4 address is set at random either from the CGNAT range,
     * or a subset of the CGNAT range specified by an [ip pool](https://tailscale.com/kb/1304/ip-pool).
     * This endpoint can be used to replace the existing IPv4 address with a specific value.
     *
     * This action will break any existing connections to this machine.
     * You will need to reconnect to this machine using the new IP address.
     * You may also need to flush your DNS cache.
     *
     * OAuth Scope: `devices:core`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.SetDeviceIp.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.SetDeviceIp.Responses.$200>;
  };
  ["/device/{deviceId}/attributes"]: {
    /**
     * getDevicePostureAttributes - Get device posture attributes
     *
     * Retrieve all posture attributes for the specified device.
     * This returns a JSON object of all the key-value pairs of posture attributes for the device.
     *
     * OAuth Scope: `devices:posture_attributes:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetDevicePostureAttributes.Responses.$200>;
  };
  ["/device/{deviceId}/attributes/{attributeKey}"]: {
    /**
     * setCustomDevicePostureAttributes - Set custom device posture attributes
     *
     * Create or update a custom posture attribute on the specified device.
     * User-managed attributes must be in the custom namespace,
     * which is indicated by prefixing the attribute key with `custom:`.
     *
     * Custom device posture attributes are available for the Personal and Enterprise plans.
     *
     * OAuth Scope: `devices:posture_attributes`.
     *
     */
    "post"(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.SetCustomDevicePostureAttributes.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.SetCustomDevicePostureAttributes.Responses.$200>;
    /**
     * deleteCustomDevicePostureAttributes - Delete custom device posture attributes
     *
     * Delete a posture attribute from the specified device.
     * This is only applicable to user-managed posture attributes in the custom namespace,
     * which is indicated by prefixing the attribute key with `custom:`.
     *
     * OAuth Scope: `devices:posture_attributes`.
     *
     */
    "delete"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteCustomDevicePostureAttributes.Responses.$200>;
  };
  ["/device/{deviceId}/device-invites"]: {
    /**
     * listDeviceInvites - List device invites
     *
     * List all share invites for a device.
     *
     * OAuth Scope: `device_invites:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListDeviceInvites.Responses.$200>;
    /**
     * createDeviceInvites - Create device invites
     *
     * Create new share invites for a device.
     *
     * Note that device invites cannot be created using an API access token generated from an OAuth client as the shared device is scoped to a user.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.CreateDeviceInvites.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.CreateDeviceInvites.Responses.$200>;
  };
  ["/tailnet/{tailnet}/user-invites"]: {
    /**
     * listUserInvites - List user invites
     *
     * List all open (not yet accepted) user invites to the tailnet.
     */
    "get"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListUserInvites.Responses.$200>;
    /**
     * createUserInvites - Create user invites
     *
     * Create, and optionally email out, new user invites to join the tailnet.
     *
     * > ⓘ Only permitted for user-owned keys, because invites require an inviting user.
     *
     */
    "post"(
      parameters?: Parameters<Components.TailnetParamsObject> | null,
      data?: Paths.CreateUserInvites.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.CreateUserInvites.Responses.$200>;
  };
  ["/user-invites/{userInviteId}"]: {
    /**
     * getUserInvite - Get a user invite
     *
     * Retrieve a specific user invite.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetUserInvite.Responses.$200>;
    /**
     * deleteUserInvite - Delete a user invite
     *
     * Deletes a specific user invite.
     *
     * > ⓘ Only permitted for user-owned keys, because invites require an inviting user.
     *
     */
    "delete"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteUserInvite.Responses.$200>;
  };
  ["/user-invites/{userInviteId}/resend"]: {
    /**
     * resendUserInvite - Resend a user invite
     *
     * Resend a user invite by email. You can only use this if the specified invite
     * was originally created with an email specified.
     * Refer to [creating user invites for a tailnet](#tag/userinvites/post/tailnet/{tailnet}/user-invites).
     *
     * Note: Invite resends are rate limited to one per minute.
     *
     * > ⓘ Only permitted for user-owned keys, because invites require an inviting user.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ResendUserInvite.Responses.$200>;
  };
  ["/device-invites/{deviceInviteId}"]: {
    /**
     * getDeviceInvite - Get a device invite
     *
     * Retrieve a specific device invite.
     *
     * OAuth Scope: `device_invites:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetDeviceInvite.Responses.$200>;
    /**
     * deleteDeviceInvite - Delete a device invite
     *
     * Delete a specific device invite.
     *
     * OAuth Scope: `device_invites`.
     *
     */
    "delete"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteDeviceInvite.Responses.$200>;
  };
  ["/device-invites/{deviceInviteId}/resend"]: {
    /**
     * resendDeviceInvite - Resend a device invite
     *
     * Resend a device invite by email. You can only use this if the specified invite
     * was originally created with an email specified.
     * Refer to [creating device invites for a device](#tag/deviceinvites/post/device/{deviceId}/device-invites).
     *
     * Note: Invite resends are rate limited to one per minute.
     *
     * Note that device invites cannot be resent using an API access token generated from an OAuth client as the shared device is scoped to a user.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ResendDeviceInvite.Responses.$200>;
  };
  ["/device-invites/-/accept"]: {
    /**
     * acceptDeviceInvite - Accept a device invite
     *
     * Accepts the invitation to share a device into the requesting user's tailnet.
     *
     * Note that device invites cannot be accepted using an API access token generated from an OAuth client as the shared device is scoped to a user.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.AcceptDeviceInvite.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.AcceptDeviceInvite.Responses.$200>;
  };
  ["/tailnet/{tailnet}/logging/configuration"]: {
    /**
     * listConfigurationAuditLogs - List configuration audit logs
     *
     * List all configuration audit logs for a tailnet.
     *
     * OAuth Scope: `logs:configuration:read`.
     *
     */
    "get"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListConfigurationAuditLogs.Responses.$200>;
  };
  ["/tailnet/{tailnet}/logging/network"]: {
    /**
     * listNetworkFlowLogs - List network flow logs
     *
     * List all network flow logs for a tailnet.
     *
     * OAuth Scope: `logs:network:read`.
     *
     */
    "get"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListNetworkFlowLogs.Responses.$200>;
  };
  ["/tailnet/{tailnet}/logging/{logType}/stream/status"]: {
    /**
     * getLogStreamingStatus - Get log streaming status
     *
     * Retrieve the log streaming status for the provided log type.
     *
     * OAuth Scope: `log_streaming:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetLogStreamingStatus.Responses.$200>;
  };
  ["/tailnet/{tailnet}/logging/{logType}/stream"]: {
    /**
     * getLogStreamingConfiguration - Get log streaming configuration
     *
     * Retrieve the log streaming configuration for the provided log type.
     *
     * OAuth Scope: `log_streaming:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetLogStreamingConfiguration.Responses.$200>;
    /**
     * setLogStreamingConfiguration - Set log streaming configuration
     *
     * Set the log streaming configuration for the provided log type.
     *
     * OAuth Scope: `log_streaming`. `device_invites` and `policy_file` are also required if streaming to a [private endpoint](https://tailscale.com/kb/1255/log-streaming#private-endpoints).
     *
     */
    "put"(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.SetLogStreamingConfiguration.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.SetLogStreamingConfiguration.Responses.$200>;
    /**
     * disableLogStreaming - Disable log streaming
     *
     * Delete the log streaming configuration for the provided log type.
     *
     * OAuth Scope: `log_streaming`.
     *
     */
    "delete"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DisableLogStreaming.Responses.$200>;
  };
  ["/tailnet/{tailnet}/aws-external-id"]: {
    /**
     * getAwsExternalId - Create or get AWS external id
     *
     * Get an AWS external id to use for streaming tailnet logs to S3 using role-based authentication,
     * creating a new one for this tailnet when necessary.
     *
     * OAuth Scope: `log_streaming`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.GetAwsExternalId.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.GetAwsExternalId.Responses.$200>;
  };
  ["/tailnet/{tailnet}/aws-external-id/{id}/validate-aws-trust-policy"]: {
    /**
     * validateAwsExternalId - Validate external ID integration with IAM role trust policy
     *
     * Validate that Tailscale can assume your IAM role with (and only with)
     * this external ID.
     *
     * OAuth Scope: `log_streaming`.
     *
     */
    "post"(
      parameters?: Parameters<Paths.Tailnet$TailnetAwsExternalId$IdValidateAwsTrustPolicy.PathParameters> | null,
      data?: Paths.ValidateAwsExternalId.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.ValidateAwsExternalId.Responses.$200>;
  };
  ["/tailnet/{tailnet}/dns/nameservers"]: {
    /**
     * listDnsNameservers - List DNS nameservers
     *
     * Lists the global DNS nameservers for a tailnet.
     *
     */
    "get"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListDnsNameservers.Responses.$200>;
    /**
     * setDnsNameservers - Set DNS nameservers
     *
     * Replaces the list of global DNS nameservers for the given tailnet with the list supplied in the request.
     *
     * Note that changing the list of DNS nameservers may also affect the status of MagicDNS (if MagicDNS is on; learn about [MagicDNS](https://tailscale.com/kb/1081)).
     * If all nameservers have been removed, MagicDNS will be automatically disabled (until explicitly turned back on by the user).
     *
     */
    "post"(
      parameters?: Parameters<Components.TailnetParamsObject> | null,
      data?: Paths.SetDnsNameservers.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.SetDnsNameservers.Responses.$200>;
  };
  ["/tailnet/{tailnet}/dns/preferences"]: {
    /**
     * getDnsPreferences - Get DNS preferences
     *
     * Retrieves the DNS preferences that are currently set for the given tailnet.
     *
     */
    "get"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetDnsPreferences.Responses.$200>;
    /**
     * setDnsPreferences - Set DNS preferences
     *
     * Set the DNS preferences for a tailnet; specifically, the MagicDNS setting.
     * Note that MagicDNS is dependent on DNS servers.
     * Learn about [MagicDNS](https://tailscale.com/kb/1081).
     *
     * If there is at least one DNS server, then MagicDNS can be enabled.
     * Otherwise, it returns an error.
     *
     * Note that removing all nameservers will turn off MagicDNS.
     * To reenable it, nameservers must be added back, and MagicDNS must be explicitly turned on.
     *
     */
    "post"(
      parameters?: Parameters<Components.TailnetParamsObject> | null,
      data?: Paths.SetDnsPreferences.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.SetDnsPreferences.Responses.$200>;
  };
  ["/tailnet/{tailnet}/dns/searchpaths"]: {
    /**
     * listDnsSearchPaths - List DNS search paths
     *
     * Retrieves the list of search paths, also referred to as *search domains*, that is currently set for the given tailnet.
     *
     */
    "get"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListDnsSearchPaths.Responses.$200>;
    /**
     * setDnsSearchPaths - Set DNS search paths
     *
     * Replaces the list of search paths for the given tailnet.
     *
     */
    "post"(
      parameters?: Parameters<Components.TailnetParamsObject> | null,
      data?: Paths.SetDnsSearchPaths.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.SetDnsSearchPaths.Responses.$200>;
  };
  ["/tailnet/{tailnet}/dns/split-dns"]: {
    /**
     * getSplitDns - Get split DNS
     *
     * Retrieves the split DNS settings, which is a map from domains to lists of nameservers, that is currently set for the given tailnet.
     *
     */
    "get"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetSplitDns.Responses.$200>;
    /**
     * updateSplitDns - Update split DNS
     *
     * Performs partial updates of the split DNS settings for a given tailnet.
     * Only domains specified in the request map will be modified.
     * Setting the value of a mapping to `null` clears the nameservers for that domain.
     *
     */
    "patch"(
      parameters?: Parameters<Components.TailnetParamsObject> | null,
      data?: Paths.UpdateSplitDns.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.UpdateSplitDns.Responses.$200>;
    /**
     * setSplitDns - Set split DNS
     *
     * Replaces the split DNS settings for a given tailnet.
     * Setting the value of a mapping to `null` clears the nameservers for that domain.
     * Sending an empty object clears nameservers for all domains.
     *
     */
    "put"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: Paths.SetSplitDns.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.SetSplitDns.Responses.$200>;
  };
  ["/tailnet/{tailnet}/keys"]: {
    /**
     * listTailnetKeys - List tailnet keys
     *
     * Returns a list of active auth keys, API access tokens and OAuth clients.
     *
     * If the parameter {all} was not specified, the set of keys returned depends on the access token used to make the request:
     * - If the API call is made with a user-owned API access token, this returns only the keys owned by that user.
     * - If the API call is made with an access token derived from an OAuth client, this returns all OAuth clients for the tailnet.
     *
     * OAuth Scope: `api_access_tokens:read` grants access to personal API access tokens.
     *
     * OAuth Scope: `auth_keys:read` grants access to machine auth keys.
     *
     * OAuth Scope: `oauth_keys:read` grants access to OAuth clients and OAuth tokens.
     *
     */
    "get"(parameters?: Parameters<Paths.ListTailnetKeys.QueryParameters> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListTailnetKeys.Responses.$200>;
    /**
     * createAuthKey - Create an auth key or OAuth client
     *
     * Creates a new [auth key](https://tailscale.com/kb/1085/) or [OAuth client](https://tailscale.com/kb/1215/) in the specified tailnet.
     * The key will be associated with the user who owns the API access token used to make this call,
     * or, if the call is made with an access token derived from an OAuth client, the key will be owned by the tailnet.
     *
     * Returns a JSON object with the generated key.
     * The key should be recorded and kept safe and secure because it wields the capabilities or scopes specified in the request.
     * The identity of the key is embedded in the key itself and can be used to perform operations on the key (e.g., revoking it or retrieving information about it).
     * The full key can no longer be retrieved after the initial response.
     *
     * OAuth Scope: `auth_keys` grants access to create machine auth keys.
     *
     * OAuth Scope: `oauth_keys` grants access to create OAuth clients.
     *
     */
    "post"(parameters?: Parameters<Components.TailnetParamsObject> | null, data?: Paths.CreateAuthKey.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.CreateAuthKey.Responses.$200>;
  };
  ["/tailnet/{tailnet}/keys/{keyId}"]: {
    /**
     * getKey - Get key
     *
     * Returns a JSON object with information about a specific api access token, OAuth client or auth key, such as its creation and expiration dates and its capabilities.
     *
     * OAuth Scope: `api_access_tokens:read` grants access to personal API access tokens.
     *
     * OAuth Scope: `auth_keys:read` grants access to machine auth keys.
     *
     * OAuth Scope: `oauth_keys:read` grants access to OAuth clients and OAuth tokens.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetKey.Responses.$200>;
    /**
     * deleteKey - Delete key
     *
     * Deletes a specific api access token or auth key.
     *
     * OAuth Scope: `api_access_tokens` grants access to personal API access tokens.
     *
     * OAuth Scope: `auth_keys` grants access to machine auth keys.
     *
     * OAuth Scope: `oauth_keys` grants access to OAuth clients and OAuth tokens.
     *
     */
    "delete"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteKey.Responses.$200>;
  };
  ["/tailnet/{tailnet}/acl"]: {
    /**
     * getPolicyFile - Get policy file
     *
     * Retrieves the current policy file for the given tailnet;
     * this includes the ACL along with the rules and tests that have been defined.
     *
     * This method can return the policy file as JSON or HuJSON, depending on the Accept header.
     * The response also includes an `ETag` header, which can be optionally included when [setting the policy file](#tag/policyfile/post/tailnet/{tailnet}/acl) to avoid missed updates.
     *
     * Learn more about [policy file ACL syntax](https://tailscale.com/kb/1337/acl-syntax).
     *
     * OAuth Scope: `policy_file:read`.
     *
     */
    "get"(parameters?: Parameters<Paths.GetPolicyFile.QueryParameters> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetPolicyFile.Responses.$200>;
    /**
     * setPolicyFile - Set policy file
     *
     * Sets the ACL for the given tailnet. HuJSON and JSON are both accepted inputs.
     * An `If-Match` header can be set to avoid missed updates.
     *
     * On success, returns the updated ACL in JSON or HuJSON according to the `Accept` header.
     * Otherwise, errors are returned for incorrectly defined ACLs, ACLs with failing tests on attempted updates, and mismatched `If-Match` header and `ETag`.
     *
     * Learn more about [policy file ACL syntax](https://tailscale.com/kb/1337/acl-syntax).
     *
     * OAuth Scope: `policy_file`.
     *
     */
    "post"(
      parameters?: Parameters<Paths.SetPolicyFile.HeaderParameters> | null,
      data?: Paths.SetPolicyFile.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.SetPolicyFile.Responses.$200>;
  };
  ["/tailnet/{tailnet}/acl/preview"]: {
    /**
     * previewRuleMatches - Preview rule matches
     *
     * When given a user or IP port to match against,
     * returns the tailnet policy rules that apply to that resource,
     * without saving the policy file to the server.
     *
     */
    "post"(
      parameters?: Parameters<Paths.Tailnet$TailnetAclPreview.QueryParameters> | null,
      data?: Paths.PreviewRuleMatches.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.PreviewRuleMatches.Responses.$200>;
  };
  ["/tailnet/{tailnet}/acl/validate"]: {
    /**
     * validateAndTestPolicyFile - Validate and test policy file
     *
     * This endpoint works in one of two modes, neither of which modifies your current tailnet policy file:
     *
     * - Run ACL tests: When the request body contains ACL tests as a JSON array,
     *   Tailscale runs ACL tests against the tailnet's current policy file.
     *   Learn more about [ACL tests](https://tailscale.com/kb/1337/acl-syntax#tests).
     * - Validate a new policy file: When the request body is a JSON object,
     *   Tailscale interprets the body as a hypothetical new tailnet policy file with new ACLs,
     *   including any new rules and tests.
     *   It validates that the policy file is parsable and runs tests to validate the existing rules.
     *
     * In either case, this method does not modify the tailnet policy file in any way.
     *
     * OAuth Scope: `policy_file:read`.
     *
     */
    "post"(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.ValidateAndTestPolicyFile.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.ValidateAndTestPolicyFile.Responses.$200>;
  };
  ["/tailnet/{tailnet}/posture/integrations"]: {
    /**
     * getPostureIntegrations - List all posture integrations
     *
     * List all of the posture integrations for a tailnet.
     *
     * OAuth Scope: `feature_settings:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetPostureIntegrations.Responses.$200>;
    /**
     * createPostureIntegration - Create a posture integration
     *
     * Create a posture integration, returning the resulting [PostureIntegration](#model/postureintegration).
     *
     * Must include `provider` and `clientSecret`.
     *
     * Currently, only one integration for each provider is supported.
     *
     * OAuth Scope: `feature_settings`.
     *
     */
    "post"(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.CreatePostureIntegration.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.CreatePostureIntegration.Responses.$200>;
  };
  ["/posture/integrations/{id}"]: {
    /**
     * getPostureIntegration - Get a posture integration
     *
     * Gets the posture integration identified by `{id}`.
     *
     * OAuth Scope: `feature_settings:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetPostureIntegration.Responses.$200>;
    /**
     * updatePostureIntegration - Update a posture integration
     *
     * Updates the posture integration identified by `{id}`. You may omit the `clientSecret` from your request to retain the previously configured `clientSecret`.
     *
     * OAuth Scope: `feature_settings`.
     *
     */
    "patch"(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.UpdatePostureIntegration.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.UpdatePostureIntegration.Responses.$200>;
    /**
     * deletePostureIntegration - Delete a posture integration
     *
     * Delete a specific posture integration.
     *
     * OAuth Scope: `feature_settings`.
     *
     */
    "delete"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeletePostureIntegration.Responses.$200>;
  };
  ["/tailnet/{tailnet}/users"]: {
    /**
     * listUsers - List users
     *
     * List all users of a tailnet.
     *
     * OAuth Scope: `users:read`.
     *
     */
    "get"(parameters?: Parameters<Paths.Tailnet$TailnetUsers.QueryParameters> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListUsers.Responses.$200>;
  };
  ["/users/{userId}"]: {
    /**
     * getUser - Get a user
     *
     * Retrieve details about the specified user.
     *
     * OAuth Scope: `users:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetUser.Responses.$200>;
  };
  ["/users/{userId}/role"]: {
    /**
     * updateUserRole - Update user role
     *
     * Update the role for the specified user.
     *
     * Learn more about [user roles](kb/1138/user-roles).
     *
     * OAuth Scope: `users`.
     *
     * > ⓘ User-based access tokens cannot update their own user's role.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.UpdateUserRole.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.UpdateUserRole.Responses.$200>;
  };
  ["/users/{userId}/approve"]: {
    /**
     * approveUser - Approve a user
     *
     * Approve a pending user's access to the tailnet.
     * This is a no-op if user approval has not been enabled for the tailnet, or if the user is already approved.
     *
     * User approval can be managed using the [tailnet settings endpoints](#tag/tailnetsettings).
     *
     * Learn more about [user approval](/kb/1239/user-approval) and [enabling user approval for your network](/kb/1239/user-approval#enable-user-approval-for-your-network).
     *
     * OAuth Scope: `users`.
     *
     * > ⓘ User-based access tokens cannot approve their own user.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ApproveUser.Responses.$200>;
  };
  ["/users/{userId}/suspend"]: {
    /**
     * suspendUser - Suspend a user
     *
     * > ⓘ This endpoint is available for the [Personal and Enterprise plans](/pricing).
     *
     * Suspends a user from their tailnet. Learn more about [suspending users](/kb/1145/remove-team-members#suspending-users).
     *
     * OAuth Scope: `users`.
     *
     * > ⓘ User-based access tokens cannot suspend their own user.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.SuspendUser.Responses.$200>;
  };
  ["/users/{userId}/restore"]: {
    /**
     * restoreUser - Restore a user
     *
     * > ⓘ This endpoint is available for the [Personal and Enterprise plans](/pricing).
     *
     * Restores a suspended user's access to their tailnet. Learn more about [restoring users](/kb/1145/remove-team-members#restoring-users).
     *
     * OAuth Scope: `users`.
     *
     * > ⓘ User-based access tokens cannot restore their own user.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.RestoreUser.Responses.$200>;
  };
  ["/users/{userId}/delete"]: {
    /**
     * deleteUser - Delete a user
     *
     * > ⓘ This endpoint is available for the [Personal and Enterprise plans](/pricing).
     *
     * Delete a user from their tailnet. Learn more about [deleting users](/kb/1145/remove-team-members#deleting-users).
     *
     * OAuth Scope: `users`.
     *
     * > ⓘ User-based access tokens cannot delete their own user.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteUser.Responses.$200>;
  };
  ["/tailnet/{tailnet}/contacts"]: {
    /**
     * getContacts - Get contacts
     *
     * Retrieve the tailnet's current contacts.
     *
     * OAuth Scope: `account_settings:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetContacts.Responses.$200>;
  };
  ["/tailnet/{tailnet}/contacts/{contactType}"]: {
    /**
     * updateContact - Update contact
     *
     * Update the preferences for this type of contact. If the email address has changed, the system will send a verification email to confirm the change.
     *
     * OAuth Scope: `account_settings`.
     *
     */
    "patch"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.UpdateContact.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.UpdateContact.Responses.$200>;
  };
  ["/tailnet/{tailnet}/contacts/{contactType}/resend-verification-email"]: {
    /**
     * resendContactVerificationEmail - Resend verification email
     *
     * Resends the verification email for this contact, if and only if verification is still pending.
     *
     * OAuth Scope: `account_settings`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ResendContactVerificationEmail.Responses.$200>;
  };
  ["/tailnet/{tailnet}/webhooks"]: {
    /**
     * listWebhooks - List webhooks
     *
     * List all webhooks for a tailnet.
     *
     * OAuth Scope: `webhooks:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.ListWebhooks.Responses.$200>;
    /**
     * createWebhook - Create a webhook
     *
     * Create a webhook within a tailnet.
     *
     * OAuth Scope: `webhooks`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.CreateWebhook.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.CreateWebhook.Responses.$200>;
  };
  ["/webhooks/{endpointId}"]: {
    /**
     * getWebhook - Get webhook
     *
     * Retrieve a specific webhook.
     *
     * OAuth Scope: `webhooks:read`.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetWebhook.Responses.$200>;
    /**
     * updateWebhook - Update webhook
     *
     * Update a specific webhook.
     *
     * OAuth Scope: `webhooks`.
     *
     */
    "patch"(parameters?: Parameters<UnknownParamsObject> | null, data?: Paths.UpdateWebhook.RequestBody, config?: AxiosRequestConfig): OperationResponse<Paths.UpdateWebhook.Responses.$200>;
    /**
     * deleteWebhook - Delete webhook
     *
     * Delete a specific webhook.
     *
     * OAuth Scope: `webhooks`.
     *
     */
    "delete"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.DeleteWebhook.Responses.$200>;
  };
  ["/webhooks/{endpointId}/test"]: {
    /**
     * testWebhook - Test a webhook
     *
     * Test a specific webhook by sending out a test event to the endpoint URL.
     * This endpoint queues the event which is sent out asynchronously.
     *
     * If your webhook is configured correctly, within a few seconds your webhook endpoint should receive an event with type of "test".
     *
     * OAuth Scope: `webhooks`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.TestWebhook.Responses.$202>;
  };
  ["/webhooks/{endpointId}/rotate"]: {
    /**
     * rotateWebhookSecret - Rotate webhook secret
     *
     * Rotate and generate a new secret for a specific webhook.
     *
     * This secret is used for generating the `Tailscale-Webhook-Signature` header in requests sent to the endpoint URL.
     * Learn more about [verifying webhook event signatures](/kb/1213/webhooks#verifying-an-event-signature).
     *
     * OAuth Scope: `webhooks`.
     *
     */
    "post"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.RotateWebhookSecret.Responses.$200>;
  };
  ["/tailnet/{tailnet}/settings"]: {
    /**
     * getTailnetSettings - Get tailnet settings
     *
     * Retrieve the settings for a specific tailnet.
     *
     * OAuth Scope: `feature_settings:read` - required to view all settings except those governed by the below scopes.
     *
     * OAuth Scope: `logs:network:read` - required to view the `networkFlowLoggingOn` setting.
     *
     * OAuth Scope: `policy_file:read` - required to view the `aclsExternallyManagedOn` & `aclsExternalLink` settings.
     *
     */
    "get"(parameters?: Parameters<UnknownParamsObject> | null, data?: any, config?: AxiosRequestConfig): OperationResponse<Paths.GetTailnetSettings.Responses.$200>;
    /**
     * updateTailnetSettings - Update tailnet settings
     *
     * Update the settings for a specific tailnet.
     *
     * OAuth Scope: `feature_settings` - required to update all settings except those governed by the below scopes.
     *
     * OAuth Scope: `logs:network` - required to update the `networkFlowLoggingOn` setting.
     *
     * OAuth Scope: `policy_file` - required to update the `aclsExternallyManagedOn` & `aclsExternalLink` settings.
     *
     */
    "patch"(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.UpdateTailnetSettings.RequestBody,
      config?: AxiosRequestConfig
    ): OperationResponse<Paths.UpdateTailnetSettings.Responses.$200>;
  };
}

export type Client = OpenAPIClient<OperationMethods, PathsDictionary>;

export type AwsExternalId = Components.Schemas.AwsExternalId;
export type ConfigurationAuditLog = Components.Schemas.ConfigurationAuditLog;
export type ConnectionCounts = Components.Schemas.ConnectionCounts;
export type Contact = Components.Schemas.Contact;
export type Device = Components.Schemas.Device;
export type DeviceInvite = Components.Schemas.DeviceInvite;
export type DevicePostureAttributes = Components.Schemas.DevicePostureAttributes;
export type DeviceRoutes = Components.Schemas.DeviceRoutes;
export type DnsPreferences = Components.Schemas.DnsPreferences;
export type DnsSearchPaths = Components.Schemas.DnsSearchPaths;
export type Error = Components.Schemas.Error;
export type Key = Components.Schemas.Key;
export type KeyCapabilities = Components.Schemas.KeyCapabilities;
export type LogType = Components.Schemas.LogType;
export type LogstreamEndpointConfiguration = Components.Schemas.LogstreamEndpointConfiguration;
export type LogstreamEndpointPublishingStatus = Components.Schemas.LogstreamEndpointPublishingStatus;
export type NetworkFlowLog = Components.Schemas.NetworkFlowLog;
export type PostureIntegration = Components.Schemas.PostureIntegration;
export type providerType = Components.Schemas.ProviderType;
export type SplitDns = Components.Schemas.SplitDns;
export type subscriptions = Components.Schemas.Subscriptions;
export type TailnetSettings = Components.Schemas.TailnetSettings;
export type User = Components.Schemas.User;
export type UserInvite = Components.Schemas.UserInvite;
export type Webhook = Components.Schemas.Webhook;
