import * as pulumi from "@pulumi/pulumi";
import { TruenasProvider, TruenasResource, TruenasResourceInputs, TruenasResourceOutputs } from "./truenas.js";

// SMB Share resource types
export interface SmbShareInputs extends TruenasResourceInputs {
  /** Share name */
  name: pulumi.Input<string>;
  /** Path to share */
  path: pulumi.Input<string>;
  /** Share comment */
  comment?: pulumi.Input<string>;
  /** Enable the share */
  enabled?: pulumi.Input<boolean>;
  /** Guest access allowed */
  guestok?: pulumi.Input<boolean>;
  /** Read only access */
  ro?: pulumi.Input<boolean>;
  /** Browseable share */
  browsable?: pulumi.Input<boolean>;
  /** Recycle bin */
  recyclebin?: pulumi.Input<boolean>;
  /** Show hidden files */
  showhiddenfiles?: pulumi.Input<boolean>;
  /** Access based share enumeration */
  abe?: pulumi.Input<boolean>;
  /** Additional SMB parameters */
  auxsmbconf?: pulumi.Input<string>;
  /** Host allow list */
  hostsallow?: pulumi.Input<string[]>;
  /** Host deny list */
  hostsdeny?: pulumi.Input<string[]>;
  /** Share ACL */
  acl?: pulumi.Input<boolean>;
  /** ACL entries */
  acl_entries?: pulumi.Input<
    Array<{
      ae_who_sid?: string;
      ae_who_id?: { [key: string]: any };
      ae_perm?: string;
      ae_type?: "ALLOW" | "DENY";
    }>
  >;
}

export interface SmbShareOutputs extends pulumi.Unwrap<SmbShareInputs>, TruenasResourceOutputs {
  /** Share locked status */
  locked?: boolean;
}

// SMB Share Provider Implementation
export class TruenasSmbShareProvider extends TruenasProvider<SmbShareInputs, SmbShareOutputs> {
  resourceType = "truenas:index:SmbShare";

  protected isReplaceProperty(propertyName: string): boolean {
    return ["name", "path"].includes(propertyName);
  }

  protected validateInputs(inputs: SmbShareInputs): void {
    if (!inputs.name) {
      throw new Error("SMB share name is required");
    }
    if (!inputs.path) {
      throw new Error("SMB share path is required");
    }
  }

  async create(inputs: pulumi.Unwrap<SmbShareInputs>): Promise<pulumi.dynamic.CreateResult> {
    this.validateInputs(inputs);

    try {
      const shareData: any = {
        name: inputs.name,
        path: inputs.path,
        comment: inputs.comment || "",
        enabled: inputs.enabled !== false,
        guestok: inputs.guestok || false,
        ro: inputs.ro || false,
        browsable: inputs.browsable !== false,
        recyclebin: inputs.recyclebin || false,
        abe: inputs.abe || false,
        auxsmbconf: inputs.auxsmbconf || "",
        hostsallow: inputs.hostsallow || [],
        hostsdeny: inputs.hostsdeny || [],
        acl: inputs.acl || false,
      };

      if (inputs.acl_entries) {
        shareData.acl_entries = inputs.acl_entries;
      }

      const truenas = await this.getClient(inputs.credential);
      const result = await truenas["sharing.smb.create"](shareData);

      const id = result.id?.toString() || this.generateId();

      return {
        id: id,
        outs: {
          ...inputs,
          id: id,
          locked: result.locked || false,
        } as SmbShareOutputs,
      };
    } catch (error: any) {
      throw new Error(`Failed to create SMB share: ${error.message}`);
    }
  }

  protected async doUpdate(id: string, olds: pulumi.Unwrap<SmbShareOutputs>, news: pulumi.Unwrap<SmbShareInputs>): Promise<Partial<pulumi.Unwrap<SmbShareOutputs>>> {
    try {
      const updateData: any = {
        comment: news.comment || "",
        enabled: news.enabled !== false,
        guestok: news.guestok || false,
        ro: news.ro || false,
        browsable: news.browsable !== false,
        recyclebin: news.recyclebin || false,
        abe: news.abe || false,
        auxsmbconf: news.auxsmbconf || "",
        hostsallow: news.hostsallow || [],
        hostsdeny: news.hostsdeny || [],
        acl: news.acl || false,
      };

      if (news.acl_entries) {
        updateData.acl_entries = news.acl_entries;
      }

      const truenas = await this.getClient(news.credential);
      await truenas["sharing.smb.update"](parseInt(id), updateData);

      const result = await truenas["sharing.smb.query"]([{ field: "id", operator: "=", value: parseInt(id) }]);
      const share = result[0];

      return {
        ...news,
        locked: share?.locked || false,
      };
    } catch (error: any) {
      throw new Error(`Failed to update SMB share: ${error.message}`);
    }
  }

  async delete(id: pulumi.ID, props: pulumi.Unwrap<SmbShareOutputs>): Promise<void> {
    try {
      const truenas = await this.getClient(props.credential);
      await truenas["sharing.smb.delete"](parseInt(id.toString()));
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw new Error(`Failed to delete SMB share: ${error.message}`);
      }
    }
  }

  async read(id: pulumi.ID, props?: pulumi.Unwrap<SmbShareOutputs>): Promise<pulumi.dynamic.ReadResult<pulumi.Unwrap<SmbShareOutputs>>> {
    try {
      if (!props?.credential) {
        throw new Error("Credential is required for read operation");
      }

      const truenas = await this.getClient(props.credential);
      const result = await truenas["sharing.smb.query"]([{ field: "id", operator: "=", value: parseInt(id.toString()) }]);
      const share = result[0];

      if (!share) {
        throw new Error(`SMB share with id ${id} not found`);
      }

      return {
        id: id,
        props: {
          credential: props.credential,
          id: id.toString(),
          name: share.name,
          path: share.path,
          comment: share.comment,
          enabled: share.enabled,
          guestok: share.guestok,
          ro: share.ro,
          browsable: share.browsable,
          recyclebin: share.recyclebin,
          showhiddenfiles: false, // Not available in JSON-RPC API types
          abe: share.abe,
          auxsmbconf: share.auxsmbconf,
          hostsallow: share.hostsallow || [],
          hostsdeny: share.hostsdeny || [],
          acl: share.acl,
          acl_entries: undefined, // Not available in JSON-RPC API types
          locked: share.locked || false,
        } as pulumi.Unwrap<SmbShareOutputs>,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

// SMB Share Resource Class
export class TruenasSmbShare extends TruenasResource<SmbShareInputs, SmbShareOutputs> implements pulumi.Lifted<pulumi.Unwrap<SmbShareOutputs>> {
  public readonly credential!: pulumi.Output<string>;
  public readonly name!: pulumi.Output<string>;
  public readonly path!: pulumi.Output<string>;
  public readonly comment!: pulumi.Output<string | undefined>;
  public readonly enabled!: pulumi.Output<boolean | undefined>;
  public readonly guestok!: pulumi.Output<boolean | undefined>;
  public readonly ro!: pulumi.Output<boolean | undefined>;
  public readonly browsable!: pulumi.Output<boolean | undefined>;
  public readonly recyclebin!: pulumi.Output<boolean | undefined>;
  public readonly showhiddenfiles!: pulumi.Output<boolean | undefined>;
  public readonly abe!: pulumi.Output<boolean | undefined>;
  public readonly auxsmbconf!: pulumi.Output<string | undefined>;
  public readonly hostsallow!: pulumi.Output<string[] | undefined>;
  public readonly hostsdeny!: pulumi.Output<string[] | undefined>;
  public readonly acl!: pulumi.Output<boolean | undefined>;
  public readonly acl_entries!: pulumi.Output<
    | Array<{
        ae_who_sid?: string;
        ae_who_id?: { [key: string]: any };
        ae_perm?: string;
        ae_type?: "ALLOW" | "DENY";
      }>
    | undefined
  >;
  public readonly locked!: pulumi.Output<boolean | undefined>;

  constructor(name: string, args: SmbShareInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = new TruenasSmbShareProvider();
    super("truenas:index:SmbShare", name, args, provider, opts);
  }
}
