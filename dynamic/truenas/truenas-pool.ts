import * as pulumi from "@pulumi/pulumi";
import { TruenasProvider, TruenasResource, TruenasResourceInputs, TruenasResourceOutputs } from "./truenas.js";
import { Pool } from "@components/truenas/truenas-types.js";

// Pool resource types
export interface PoolInputs extends TruenasResourceInputs {
  /** Pool name */
  name: pulumi.Input<string>;
  /** Pool topology configuration */
  topology: pulumi.Input<{
    data: Array<{
      type: string;
      disks?: string[];
      children?: any[];
    }>;
    cache?: Array<{
      type: string;
      disks?: string[];
    }>;
    log?: Array<{
      type: string;
      disks?: string[];
    }>;
    spare?: string[];
    special?: Array<{
      type: string;
      disks?: string[];
    }>;
    dedup?: Array<{
      type: string;
      disks?: string[];
    }>;
  }>;
  /** Enable encryption */
  encryption?: pulumi.Input<boolean>;
  /** Encryption algorithm */
  encryption_algorithm?: pulumi.Input<"AES-128-CCM" | "AES-192-CCM" | "AES-256-CCM" | "AES-128-GCM" | "AES-192-GCM" | "AES-256-GCM">;
  /** Encryption passphrase */
  passphrase?: pulumi.Input<string>;
  /** Auto-trim setting */
  autotrim?: pulumi.Input<"on" | "off">;
  /** Additional pool options */
  options?: pulumi.Input<Record<string, any>>;
}

export interface PoolOutputs extends pulumi.Unwrap<PoolInputs>, TruenasResourceOutputs {
  /** Pool GUID */
  guid: string;
  /** Pool status */
  status: string;
  /** Pool size in bytes */
  size: number;
  /** Allocated space in bytes */
  allocated: number;
  /** Free space in bytes */
  free: number;
  /** Pool health status */
  healthy: boolean;
  /** Pool fragmentation percentage */
  fragmentation: string;
  /** Pool scan information */
  scan?: {
    function: string;
    state: string;
    percentage?: number;
    errors: number;
  };
}

// Pool Provider Implementation
export class TruenasPoolProvider extends TruenasProvider<PoolInputs, PoolOutputs> {
  resourceType = "truenas:index:Pool";

  protected isReplaceProperty(propertyName: string): boolean {
    // These properties require resource replacement
    return ["name", "topology", "encryption"].includes(propertyName);
  }

  protected validateInputs(inputs: pulumi.Unwrap<PoolInputs>): void {
    if (!inputs.name) {
      throw new Error("Pool name is required");
    }
    if (!inputs.topology || !inputs.topology.data || inputs.topology.data.length === 0) {
      throw new Error("Pool topology with at least one data vdev is required");
    }
    if (inputs.name.includes(" ")) {
      throw new Error("Pool name cannot contain spaces");
    }
  }

  async create(inputs: pulumi.Unwrap<PoolInputs>): Promise<pulumi.dynamic.CreateResult> {
    this.validateInputs(inputs);

    try {
      const poolData: any = {
        name: inputs.name,
        topology: inputs.topology,
      };

      // Add optional properties
      if (inputs.encryption) {
        poolData.encryption = true;
        if (inputs.encryption_algorithm) {
          poolData.encryption_options = {
            algorithm: inputs.encryption_algorithm,
          };
        }
        if (inputs.passphrase) {
          poolData.encryption_options = {
            ...poolData.encryption_options,
            passphrase: inputs.passphrase,
          };
        }
      }

      if (inputs.autotrim !== undefined) {
        poolData.autotrim = inputs.autotrim;
      }

      if (inputs.options) {
        Object.assign(poolData, inputs.options);
      }

      const truenas = await this.getClient(inputs.credential);
      const result = await truenas["pool.create"](poolData);

      const id = result.id?.toString() || this.generateId();

      return {
        id: id,
        outs: {
          ...inputs,
          id: id,
          guid: result.guid,
          status: result.status,
          size: result.size,
          allocated: result.allocated,
          free: result.free,
          healthy: result.healthy,
          fragmentation: result.fragmentation,
          scan: result.scan
            ? {
                function: result.scan.function,
                state: result.scan.state,
                percentage: result.scan.percentage ?? undefined,
                errors: result.scan.errors,
              }
            : undefined,
        } as PoolOutputs,
      };
    } catch (error: any) {
      throw new Error(`Failed to create pool: ${error.message}`);
    }
  }

  protected async doUpdate(id: string, olds: pulumi.Unwrap<PoolOutputs>, news: pulumi.Unwrap<PoolInputs>): Promise<Partial<pulumi.Unwrap<PoolOutputs>>> {
    try {
      const updateData: any = {};

      // Update properties that can be changed
      if (news.autotrim !== olds.autotrim) {
        updateData.autotrim = news.autotrim;
      }

      if (news.options) {
        Object.assign(updateData, news.options);
      }

      const truenas = await this.getClient(news.credential);
      if (Object.keys(updateData).length > 0) {
        await truenas["pool.update"](parseInt(id), updateData);
      }

      // Read updated pool
      const result = await truenas["pool.get_instance"](parseInt(id));

      return {
        ...news,
        guid: result.guid,
        status: result.status,
        size: result.size,
        allocated: result.allocated,
        free: result.free,
        healthy: result.healthy,
        fragmentation: result.fragmentation,
        scan: result.scan
          ? {
              function: result.scan.function,
              state: result.scan.state,
              percentage: result.scan.percentage ?? undefined,
              errors: result.scan.errors,
            }
          : undefined,
      };
    } catch (error: any) {
      throw new Error(`Failed to update pool: ${error.message}`);
    }
  }

  async delete(id: pulumi.ID, props: pulumi.Unwrap<PoolOutputs>): Promise<void> {
    try {
      const truenas = await this.getClient(props.credential);
      // Use export instead of delete for safety
      await truenas["pool.export"](parseInt(id.toString()));
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw new Error(`Failed to delete pool: ${error.message}`);
      }
    }
  }

  async read(id: pulumi.ID, props?: pulumi.Unwrap<PoolOutputs>): Promise<pulumi.dynamic.ReadResult<pulumi.Unwrap<PoolOutputs>>> {
    try {
      if (!props?.credential) {
        throw new Error("Credential is required for read operation");
      }

      const truenas = await this.getClient(props.credential);
      const result = await truenas["pool.get_instance"](parseInt(id.toString()));

      return {
        id: id,
        props: {
          credential: props.credential,
          id: id.toString(),
          name: result.name,
          topology: props.topology, // Use original topology from props since API structure differs
          encryption: result.encrypt > 0,
          encryption_algorithm: undefined, // Not returned by API
          passphrase: undefined, // Never return sensitive data
          autotrim: result.autotrim?.value as any,
          options: props.options,
          guid: result.guid,
          status: result.status,
          size: result.size,
          allocated: result.allocated,
          free: result.free,
          healthy: result.healthy,
          fragmentation: result.fragmentation,
          scan: result.scan
            ? {
                function: result.scan.function,
                state: result.scan.state,
                percentage: result.scan.percentage ?? undefined,
                errors: result.scan.errors,
              }
            : undefined,
        } as pulumi.Unwrap<PoolOutputs>,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

// Pool Resource Class
export class TruenasPool extends TruenasResource<PoolInputs, PoolOutputs> {
  public readonly credential!: pulumi.Output<string>;
  public readonly name!: pulumi.Output<string>;
  public readonly topology!: pulumi.Output<any>;
  public readonly encryption!: pulumi.Output<boolean | undefined>;
  public readonly encryption_algorithm!: pulumi.Output<"AES-128-CCM" | "AES-192-CCM" | "AES-256-CCM" | "AES-128-GCM" | "AES-192-GCM" | "AES-256-GCM" | undefined>;
  public readonly passphrase!: pulumi.Output<string | undefined>;
  public readonly autotrim!: pulumi.Output<"on" | "off" | undefined>;
  public readonly options!: pulumi.Output<Record<string, any> | undefined>;
  public readonly guid!: pulumi.Output<string>;
  public readonly status!: pulumi.Output<string>;
  public readonly size!: pulumi.Output<number>;
  public readonly allocated!: pulumi.Output<number>;
  public readonly free!: pulumi.Output<number>;
  public readonly healthy!: pulumi.Output<boolean>;
  public readonly fragmentation!: pulumi.Output<string>;
  public readonly scan!: pulumi.Output<
    | {
        function: string;
        state: string;
        percentage?: number;
        errors: number;
      }
    | undefined
  >;

  constructor(name: string, args: PoolInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = new TruenasPoolProvider();
    super("truenas:index:Pool", name, args, provider, opts);
  }
}
