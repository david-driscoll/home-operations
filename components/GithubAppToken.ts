import { ComponentResource, ComponentResourceOptions, type CustomResourceOptions, dynamic, type Input, interpolate, log, output, type Unwrap } from "@pulumi/pulumi";
import type { ResourceProvider } from "@pulumi/pulumi/dynamic/index.js";
import moment from "moment";

export interface GithubAppTokenInputs {
  /**
   * This is the ID of the GitHub App.
   */
  appId: Input<string>;
  /**
   * This is the ID of the GitHub App installation.
   */
  installationId: Input<string>;
  /**
   * This is the contents of the GitHub App private key PEM file.
   */
  pemFile: Input<string>;
}

export interface GithubAppTokenOutputs {
  /**
   * The GitHub App installation token.
   */
  token: string;
  /**
   * The expiration time of the GitHub App installation token.
   */
  expiresAt: string;
}

export interface GithubAppTokenProviderOutputs extends GithubAppTokenOutputs {
  id: string;
}

class GithubAppTokenProvider implements ResourceProvider {
  async create(inputs: Unwrap<GithubAppTokenInputs>) {
    const { createAppAuth } = await import("@octokit/auth-app");
    // NOTE: never log `inputs` here. It carries `pemFile` (the GitHub App private key) and
    // the serialized `__provider` closure. Dynamic-provider log messages are emitted
    // verbatim -- Pulumi's secret redaction covers resource inputs/outputs, not the text of
    // a diagnostic -- so a dump lands in the Stack CR status, pod logs, and downstream
    // metrics/log pipelines in the clear. Log only the non-secret identifiers.
    log.info(`Creating Github App Token for app ${inputs.appId} installation ${inputs.installationId}`);
    const auth = createAppAuth({
      appId: inputs.appId,
      privateKey: inputs.pemFile,
      installationId: inputs.installationId,
    });

    const installationAuthentication = await auth({
      type: "installation",
      installationId: inputs.installationId,
    });

    return {
      id: `github-app-token-${inputs.appId}-${inputs.installationId}`,
      outs: {
        token: installationAuthentication.token,
        expiresAt: installationAuthentication.expiresAt,
      },
    };
  }

  async update(id: string, inputs: Unwrap<GithubAppTokenInputs>) {
    return this.create(inputs);
  }

  async delete(id: string) {}

  async read(id: string, props: Unwrap<GithubAppTokenInputs>) {
    return { id, props: props };
  }

  async diff(id: string, oldOutputs: Unwrap<GithubAppTokenProviderOutputs>, newInputs: Unwrap<GithubAppTokenInputs>) {
    const expiresAt = moment(oldOutputs.expiresAt);
    const replaces = expiresAt.subtract(5, "minutes").isAfter(moment()) ? [] : ["token", "expiresAt"];

    return {
      replaces: replaces,
      changes: replaces.length > 0,
      stables: [],
    };
  }
}

export class GithubAppToken extends dynamic.Resource implements GithubAppTokenOutputs {
  constructor(name: string, props: GithubAppTokenInputs, opts?: CustomResourceOptions) {
    super(new GithubAppTokenProvider(), name, props, {
      additionalSecretOutputs: ["token"],
      deleteBeforeReplace: true,
      replaceOnChanges: ["*"],
      ...opts,
    });
  }
}
export interface GithubAppToken extends GithubAppTokenOutputs {}
