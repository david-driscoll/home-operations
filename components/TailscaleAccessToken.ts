import { ComponentResource, ComponentResourceOptions, type CustomResourceOptions, dynamic, type Input, interpolate, output, type Unwrap } from "@pulumi/pulumi";
import type { ResourceProvider } from "@pulumi/pulumi/dynamic/index.js";
import moment from "moment";

export interface TailscaleAccessTokenInputs {
  /**
   * This is the OAuth client ID for the Tailscale API.
   */
  username: Input<string>;
  /**
   * This is the OAuth client secret for the Tailscale API.
   */
  credential: Input<string>;
}

export interface TailscaleAccessTokenOutputs {
  /**
   * The GitHub App installation token.
   */
  token: string;
  /**
   * The expiration time of the GitHub App installation token.
   */
  expiresAt: string;
}

export interface TailscaleAccessTokenProviderOutputs extends TailscaleAccessTokenOutputs {
  id: string;
}

class TailscaleAccessTokenProvider implements ResourceProvider {
  async create(inputs: Unwrap<TailscaleAccessTokenInputs>) {
    const token = await this.getTailscaleAccessToken(inputs);

    return {
      id: `tailscale-token-${inputs.username}`,
      outs: {
        token: token.access_token,
        expiresAt: token.expires_in,
      },
    };
  }

  async getTailscaleAccessToken(args: { username: string; credential: string }) {
    const { ClientCredentials } = await import("simple-oauth2");
    const oauth = new ClientCredentials({
      client: {
        id: args.username,
        secret: args.credential,
      },
      auth: {
        tokenHost: "https://api.tailscale.com/api/v2/",
        tokenPath: "oauth/token",
      },
    });

    return await oauth.getToken({}).then(z => z.token as { access_token: string; expires_in: string });
  }

  async update(id: string, inputs: Unwrap<TailscaleAccessTokenInputs>) {
    return this.create(inputs);
  }

  async delete(id: string) {}

  async read(id: string, props: Unwrap<TailscaleAccessTokenInputs>) {
    return { id, props: props };
  }

  async diff(id: string, oldOutputs: Unwrap<TailscaleAccessTokenProviderOutputs>, newInputs: Unwrap<TailscaleAccessTokenInputs>) {
    const expiresAt = moment(oldOutputs.expiresAt);
    const replaces = expiresAt.subtract(5, "minutes").isAfter(moment()) ? [] : ["token", "expiresAt"];

    return {
      replaces: replaces,
      changes: replaces.length > 0,
      stables: [],
    };
  }
}

export class TailscaleAccessToken extends dynamic.Resource implements TailscaleAccessTokenOutputs {
  constructor(name: string, props: TailscaleAccessTokenInputs, opts?: CustomResourceOptions) {
    super(new TailscaleAccessTokenProvider(), name, props, {
      additionalSecretOutputs: ["token"],
      replaceOnChanges: ["*"],
      ...opts,
    });
  }
}
export interface TailscaleAccessToken extends TailscaleAccessTokenOutputs {}
