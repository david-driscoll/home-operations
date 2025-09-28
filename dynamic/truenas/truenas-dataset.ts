import * as pulumi from "@pulumi/pulumi";
import { TruenasProvider, TruenasResource, TruenasResourceInputs, TruenasResourceOutputs } from "./truenas.js";

// Dataset resource types
export interface DatasetInputs extends TruenasResourceInputs {
  /** Dataset name/path */
  name: pulumi.Input<string>;
  /** Pool where dataset will be created */
  pool?: pulumi.Input<string>;
  /** Dataset type (FILESYSTEM, VOLUME) */
  type?: pulumi.Input<"FILESYSTEM" | "VOLUME">;
  /** Quota in bytes */
  quota?: pulumi.Input<number>;
  /** Reservation in bytes */
  reservation?: pulumi.Input<number>;
  /** Compression algorithm */
  compression?: pulumi.Input<"off" | "on" | "gzip" | "lz4" | "lzjb" | "zle" | "zstd">;
  /** Deduplication */
  deduplication?: pulumi.Input<"on" | "off" | "verify" | "sha256" | "sha256,verify">;
  /** Record size for volumes */
  volsize?: pulumi.Input<number>;
  /** Block size for volumes */
  volblocksize?: pulumi.Input<number>;
  /** Additional ZFS properties */
  properties?: pulumi.Input<Record<string, string>>;
  /** Inherit properties from parent */
  inherit?: pulumi.Input<string[]>;
}

export interface DatasetOutputs extends pulumi.Unwrap<DatasetInputs>, TruenasResourceOutputs {
  /** Full dataset path */
  path: string;
  /** Mount point for filesystem datasets */
  mountpoint?: string;
  /** Available space in bytes */
  available?: number;
  /** Used space in bytes */
  used?: number;
}

// Dataset Provider Implementation
export class TruenasDatasetProvider extends TruenasProvider<DatasetInputs, DatasetOutputs> {
  resourceType = "truenas:index:Dataset";

  protected isReplaceProperty(propertyName: string): boolean {
    // These properties require resource replacement
    return ["name", "pool", "type"].includes(propertyName);
  }

  protected validateInputs(inputs: pulumi.Unwrap<DatasetInputs>): void {
    if (!inputs.name) {
      throw new Error("Dataset name is required");
    }
    if (inputs.name.includes(" ")) {
      throw new Error("Dataset name cannot contain spaces");
    }
    if (inputs.type === "VOLUME" && !inputs.volsize) {
      throw new Error("Volume size (volsize) is required for VOLUME datasets");
    }
  }

  async create(inputs: pulumi.Unwrap<DatasetInputs>): Promise<pulumi.dynamic.CreateResult> {
    this.validateInputs(inputs);

    try {
      const datasetData: any = {
        name: inputs.name,
        type: inputs.type || "FILESYSTEM",
      };

      // Add optional properties
      if (inputs.quota !== undefined) datasetData.quota = inputs.quota;
      if (inputs.reservation !== undefined) datasetData.reservation = inputs.reservation;
      if (inputs.compression !== undefined) datasetData.compression = inputs.compression;
      if (inputs.deduplication !== undefined) datasetData.deduplication = inputs.deduplication;
      if (inputs.volsize !== undefined) datasetData.volsize = inputs.volsize;
      if (inputs.volblocksize !== undefined) datasetData.volblocksize = inputs.volblocksize;

      // Add custom properties
      if (inputs.properties) {
        Object.assign(datasetData, inputs.properties);
      }

      const truenas = await this.getClient(inputs.credential);
      // Use the TrueNAS JSON-RPC API
      const result = await truenas.pool.dataset.create(datasetData);

      const id = result.id?.toString() || this.generateId();

      return {
        id: id,
        outs: {
          ...inputs,
          id: id,
          path: result.name || inputs.name,
          mountpoint: result.mountpoint || undefined,
          available: result.properties?.available?.parsed,
          used: result.properties?.used?.parsed,
        } as DatasetOutputs,
      };
    } catch (error: any) {
      throw new Error(`Failed to create dataset: ${error.message}`);
    }
  }

  protected async doUpdate(id: string, olds: pulumi.Unwrap<DatasetOutputs>, news: pulumi.Unwrap<DatasetInputs>): Promise<Partial<pulumi.Unwrap<DatasetOutputs>>> {
    try {
      const updateData: any = {};

      // Update properties that can be changed
      if (news.quota !== olds.quota) updateData.quota = news.quota;
      if (news.reservation !== olds.reservation) updateData.reservation = news.reservation;
      if (news.compression !== olds.compression) updateData.compression = news.compression;
      if (news.deduplication !== olds.deduplication) updateData.deduplication = news.deduplication;

      if (news.properties) {
        Object.assign(updateData, news.properties);
      }

      const truenas = await this.getClient(news.credential);
      if (Object.keys(updateData).length > 0) {
        await truenas.pool.dataset.update(id, updateData);
      }

      // Read updated dataset
      const result = await truenas.pool.dataset.getInstance(id);

      return {
        ...news,
        path: result.name,
        mountpoint: result.mountpoint || undefined,
        available: result.properties?.available?.parsed,
        used: result.properties?.used?.parsed,
        quota: result.properties?.quota?.parsed,
        reservation: result.properties?.reservation?.parsed,
        compression: result.properties?.compression?.value as any,
        deduplication: result.properties?.deduplication?.value as any,
      };
    } catch (error: any) {
      throw new Error(`Failed to update dataset: ${error.message}`);
    }
  }

  async delete(id: pulumi.ID, props: pulumi.Unwrap<DatasetOutputs>): Promise<void> {
    try {
      const truenas = await this.getClient(props.credential);
      await truenas.pool.dataset.delete(id.toString());
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw new Error(`Failed to delete dataset: ${error.message}`);
      }
    }
  }
  async read(id: pulumi.ID, props?: pulumi.Unwrap<DatasetOutputs>): Promise<pulumi.dynamic.ReadResult<pulumi.Unwrap<DatasetOutputs>>> {
    try {
      if (!props?.credential) {
        throw new Error("Credential is required for read operation");
      }

      const truenas = await this.getClient(props.credential);
      const result = await truenas.pool.dataset.getInstance(id.toString());

      return {
        id: id,
        props: {
          credential: props.credential,
          id: id.toString(),
          name: result.name,
          path: result.name,
          type: result.type as "FILESYSTEM" | "VOLUME",
          mountpoint: result.mountpoint || undefined,
          available: result.properties?.available?.parsed,
          used: result.properties?.used?.parsed,
          quota: result.properties?.quota?.parsed,
          reservation: result.properties?.reservation?.parsed,
          compression: result.properties?.compression?.value as any,
          deduplication: result.properties?.deduplication?.value as any,
          pool: result.pool,
          volsize: result.properties?.volsize?.parsed,
          volblocksize: result.properties?.volblocksize?.parsed,
          properties: props.properties,
          inherit: props.inherit,
        } as pulumi.Unwrap<DatasetOutputs>,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

// Dataset Resource Class
export class TruenasDataset extends TruenasResource<DatasetInputs, DatasetOutputs> implements pulumi.Lifted<pulumi.Unwrap<DatasetOutputs>> {
  public readonly credential!: pulumi.Output<string>;
  public readonly name!: pulumi.Output<string>;
  public readonly pool!: pulumi.Output<string>;
  public readonly type!: pulumi.Output<"FILESYSTEM" | "VOLUME">;
  public readonly quota!: pulumi.Output<number>;
  public readonly reservation!: pulumi.Output<number>;
  public readonly compression!: pulumi.Output<"off" | "on" | "gzip" | "lz4" | "lzjb" | "zle" | "zstd">;
  public readonly deduplication!: pulumi.Output<"on" | "off" | "verify" | "sha256" | "sha256,verify">;
  public readonly volsize!: pulumi.Output<number>;
  public readonly volblocksize!: pulumi.Output<number>;
  public readonly properties!: pulumi.Output<Record<string, string>>;
  public readonly inherit!: pulumi.Output<string[]>;
  public readonly path!: pulumi.Output<string>;
  public readonly mountpoint!: pulumi.Output<string>;
  public readonly available!: pulumi.Output<number>;
  public readonly used!: pulumi.Output<number>;

  constructor(name: string, args: DatasetInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = new TruenasDatasetProvider();
    super("truenas:index:Dataset", name, args, provider, opts);
  }
}
