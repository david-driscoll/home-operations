import * as pulumi from "@pulumi/pulumi";
import { TruenasProvider, TruenasResource, TruenasResourceInputs, TruenasResourceOutputs } from "./truenas.js";

// NFS Share resource types
export interface NfsShareInputs extends TruenasResourceInputs {
  /** Paths to share */
  paths: pulumi.Input<string[]>;
  /** Share comment */
  comment?: pulumi.Input<string>;
  /** Networks allowed to access */
  networks?: pulumi.Input<string[]>;
  /** Hosts allowed to access */
  hosts?: pulumi.Input<string[]>;
  /** Read only access */
  ro?: pulumi.Input<boolean>;
  /** Map root user */
  maproot_user?: pulumi.Input<string>;
  /** Map root group */
  maproot_group?: pulumi.Input<string>;
  /** Map all users */
  mapall_user?: pulumi.Input<string>;
  /** Map all groups */
  mapall_group?: pulumi.Input<string>;
  /** Security flavors */
  security?: pulumi.Input<("SYS" | "KRB5" | "KRB5I" | "KRB5P")[]>;
  /** Enable the share */
  enabled?: pulumi.Input<boolean>;
}

export interface NfsShareOutputs extends pulumi.Unwrap<NfsShareInputs>, TruenasResourceOutputs {
  /** Share locked status */
  locked?: boolean;
}

// NFS Share Provider Implementation
export class TruenasNfsShareProvider extends TruenasProvider<NfsShareInputs, NfsShareOutputs> {
  resourceType = "truenas:index:NfsShare";

  protected isReplaceProperty(propertyName: string): boolean {
    return ["paths"].includes(propertyName);
  }

  protected validateInputs(inputs: pulumi.Unwrap<NfsShareInputs>): void {
    if (!inputs.paths || inputs.paths.length === 0) {
      throw new Error("At least one path is required for NFS share");
    }
  }

  async create(inputs: pulumi.Unwrap<NfsShareInputs>): Promise<pulumi.dynamic.CreateResult> {
    this.validateInputs(inputs);

    try {
      const shareData: any = {
        path: inputs.paths[0], // TrueNAS JSON-RPC uses single path instead of paths array
        comment: inputs.comment || "",
        networks: inputs.networks || [],
        hosts: inputs.hosts || [],
        ro: inputs.ro || false,
        enabled: inputs.enabled !== false,
        security: inputs.security || ["SYS"],
      };

      // Add optional mapping properties
      if (inputs.maproot_user) shareData.maproot_user = inputs.maproot_user;
      if (inputs.maproot_group) shareData.maproot_group = inputs.maproot_group;
      if (inputs.mapall_user) shareData.mapall_user = inputs.mapall_user;
      if (inputs.mapall_group) shareData.mapall_group = inputs.mapall_group;

      const truenas = await this.getClient(inputs.credential);
      const result = await truenas["sharing.nfs.create"](shareData);

      const id = result.id?.toString() || this.generateId();

      return {
        id: id,
        outs: {
          ...inputs,
          id: id,
          locked: result.locked || false,
        } as NfsShareOutputs,
      };
    } catch (error: any) {
      throw new Error(`Failed to create NFS share: ${error.message}`);
    }
  }

  protected async doUpdate(id: string, olds: pulumi.Unwrap<NfsShareOutputs>, news: pulumi.Unwrap<NfsShareInputs>): Promise<Partial<pulumi.Unwrap<NfsShareOutputs>>> {
    try {
      const updateData: any = {
        comment: news.comment || "",
        networks: news.networks || [],
        hosts: news.hosts || [],
        ro: news.ro || false,
        enabled: news.enabled !== false,
        security: news.security || ["SYS"],
      };

      // Add optional mapping properties
      if (news.maproot_user) updateData.maproot_user = news.maproot_user;
      if (news.maproot_group) updateData.maproot_group = news.maproot_group;
      if (news.mapall_user) updateData.mapall_user = news.mapall_user;
      if (news.mapall_group) updateData.mapall_group = news.mapall_group;

      const truenas = await this.getClient(news.credential);
      await truenas["sharing.nfs.update"](parseInt(id), updateData);

      const result = await truenas["sharing.nfs.query"]([{ field: "id", operator: "=", value: parseInt(id) }]);
      const share = result[0];

      return {
        ...news,
        locked: share?.locked || false,
      };
    } catch (error: any) {
      throw new Error(`Failed to update NFS share: ${error.message}`);
    }
  }

  async delete(id: pulumi.ID, props: pulumi.Unwrap<NfsShareOutputs>): Promise<void> {
    try {
      const truenas = await this.getClient(props.credential);
      await truenas["sharing.nfs.delete"](parseInt(id.toString()));
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw new Error(`Failed to delete NFS share: ${error.message}`);
      }
    }
  }

  async read(id: pulumi.ID, props?: pulumi.Unwrap<NfsShareOutputs>): Promise<pulumi.dynamic.ReadResult<pulumi.Unwrap<NfsShareOutputs>>> {
    try {
      if (!props?.credential) {
        throw new Error("Credential is required for read operation");
      }

      const truenas = await this.getClient(props.credential);
      const result = await truenas["sharing.nfs.query"]([{ field: "id", operator: "=", value: parseInt(id.toString()) }]);
      const share = result[0];

      if (!share) {
        throw new Error(`NFS share with id ${id} not found`);
      }

      return {
        id: id,
        props: {
          credential: props.credential,
          id: id.toString(),
          paths: [share.path], // Convert single path back to array for compatibility
          comment: share.comment,
          networks: share.networks || [],
          hosts: share.hosts || [],
          ro: share.ro,
          maproot_user: share.maproot_user || undefined,
          maproot_group: share.maproot_group || undefined,
          mapall_user: share.mapall_user || undefined,
          mapall_group: share.mapall_group || undefined,
          security: (share.security || ["SYS"]) as ("SYS" | "KRB5" | "KRB5I" | "KRB5P")[],
          enabled: share.enabled,
          locked: share.locked || false,
        } as pulumi.Unwrap<NfsShareOutputs>,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

// NFS Share Resource Class
export class TruenasNfsShare extends TruenasResource<NfsShareInputs, NfsShareOutputs> implements pulumi.Lifted<pulumi.Unwrap<NfsShareOutputs>> {
  public readonly credential!: pulumi.Output<string>;
  public readonly paths!: pulumi.Output<string[]>;
  public readonly comment!: pulumi.Output<string | undefined>;
  public readonly networks!: pulumi.Output<string[] | undefined>;
  public readonly hosts!: pulumi.Output<string[] | undefined>;
  public readonly ro!: pulumi.Output<boolean | undefined>;
  public readonly maproot_user!: pulumi.Output<string | undefined>;
  public readonly maproot_group!: pulumi.Output<string | undefined>;
  public readonly mapall_user!: pulumi.Output<string | undefined>;
  public readonly mapall_group!: pulumi.Output<string | undefined>;
  public readonly security!: pulumi.Output<("SYS" | "KRB5" | "KRB5I" | "KRB5P")[] | undefined>;
  public readonly enabled!: pulumi.Output<boolean | undefined>;
  public readonly locked!: pulumi.Output<boolean | undefined>;

  constructor(name: string, args: NfsShareInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = new TruenasNfsShareProvider();
    super("truenas:index:NfsShare", name, args, provider, opts);
  }
}
