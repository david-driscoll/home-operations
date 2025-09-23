import * as pulumi from "@pulumi/pulumi";
import { TruenasProvider, TruenasResource, TruenasResourceInputs, TruenasResourceOutputs } from "./truenas.js";
import { Disk } from "@components/truenas/truenas-types.js";

// Disk resource types (mainly read-only for monitoring)
export interface DiskInputs extends TruenasResourceInputs {
  /** Disk identifier (for monitoring existing disks) */
  identifier: pulumi.Input<string>;
  /** HDD standby mode */
  hddstandby?: pulumi.Input<string>;
  /** Advanced power management */
  advpowermgmt?: pulumi.Input<string>;
  /** Acoustic level */
  acousticlevel?: pulumi.Input<string>;
  /** SMART options */
  smartoptions?: pulumi.Input<string>;
  /** Enable SMART */
  togglesmart?: pulumi.Input<boolean>;
  /** Disk password (for encryption) */
  passwd?: pulumi.Input<string>;
  /** Critical temperature threshold */
  critical?: pulumi.Input<number>;
  /** Difference temperature threshold */
  difference?: pulumi.Input<number>;
  /** Informational temperature threshold */
  informational?: pulumi.Input<number>;
}

export interface DiskOutputs extends pulumi.Unwrap<DiskInputs>, TruenasResourceOutputs {
  /** Disk name */
  name: string;
  /** Disk subsystem */
  subsystem: string;
  /** Disk number */
  number: number;
  /** Serial number */
  serial: string;
  /** LUN ID */
  lunid?: string;
  /** Disk size in bytes */
  size: number;
  /** Disk description */
  description: string;
  /** Transfer mode */
  transfermode: string;
  /** Disk model */
  model: string;
  /** Rotation rate (RPM) */
  rotationrate?: number;
  /** Disk type (SSD, HDD, etc.) */
  type: string;
  /** ZFS GUID */
  zfs_guid?: string;
  /** Bus type */
  bus: string;
  /** Device name */
  devname: string;
  /** Pool assignment */
  pool?: string;
  /** Supports SMART */
  supports_smart?: boolean;
  /** Enclosure info */
  enclosure?: {
    id: string;
    name: string;
    model: string;
    vendor: string;
    product: string;
  };
}

// Disk Provider Implementation (mainly read-only)
export class TruenasDiskProvider extends TruenasProvider<DiskInputs, DiskOutputs> {
  resourceType = "truenas:index:Disk";

  protected isReplaceProperty(propertyName: string): boolean {
    // These properties require resource replacement
    return ["identifier"].includes(propertyName);
  }

  protected validateInputs(inputs: pulumi.Unwrap<DiskInputs>): void {
    if (!inputs.identifier) {
      throw new Error("Disk identifier is required");
    }
  }

  async create(inputs: pulumi.Unwrap<DiskInputs>): Promise<pulumi.dynamic.CreateResult> {
    this.validateInputs(inputs);

    try {
      const truenas = await this.getClient(inputs.credential);

      // Get disk info by identifier
      const disks = await (truenas as any)["disk.query"]([{ field: "identifier", operator: "=", value: inputs.identifier }]);

      if (!disks || disks.length === 0) {
        throw new Error(`Disk with identifier ${inputs.identifier} not found`);
      }

      let disk = disks[0];

      // Update disk settings if provided
      const updateData: any = {};
      if (inputs.hddstandby !== undefined) updateData.hddstandby = inputs.hddstandby;
      if (inputs.advpowermgmt !== undefined) updateData.advpowermgmt = inputs.advpowermgmt;
      if (inputs.acousticlevel !== undefined) updateData.acousticlevel = inputs.acousticlevel;
      if (inputs.smartoptions !== undefined) updateData.smartoptions = inputs.smartoptions;
      if (inputs.togglesmart !== undefined) updateData.togglesmart = inputs.togglesmart;
      if (inputs.passwd !== undefined) updateData.passwd = inputs.passwd;
      if (inputs.critical !== undefined) updateData.critical = inputs.critical;
      if (inputs.difference !== undefined) updateData.difference = inputs.difference;
      if (inputs.informational !== undefined) updateData.informational = inputs.informational;

      if (Object.keys(updateData).length > 0) {
        await (truenas as any)["disk.update"](inputs.identifier, updateData);
        // Refresh disk info
        const updatedDisks = await (truenas as any)["disk.query"]([{ field: "identifier", operator: "=", value: inputs.identifier }]);
        disk = updatedDisks[0];
      }

      const id = inputs.identifier;

      return {
        id: id,
        outs: {
          ...inputs,
          id: id,
          name: disk.name,
          subsystem: disk.subsystem,
          number: disk.number,
          serial: disk.serial,
          lunid: disk.lunid,
          size: disk.size,
          description: disk.description,
          transfermode: disk.transfermode,
          model: disk.model,
          rotationrate: disk.rotationrate,
          type: disk.type,
          zfs_guid: disk.zfs_guid,
          bus: disk.bus,
          devname: disk.devname,
          pool: disk.pool,
          supports_smart: disk.supports_smart,
          enclosure: disk.enclosure
            ? {
                id: disk.enclosure.id,
                name: disk.enclosure.name,
                model: disk.enclosure.model,
                vendor: disk.enclosure.vendor,
                product: disk.enclosure.product,
              }
            : undefined,
        } as DiskOutputs,
      };
    } catch (error: any) {
      throw new Error(`Failed to manage disk: ${error.message}`);
    }
  }

  protected async doUpdate(id: string, olds: pulumi.Unwrap<DiskOutputs>, news: pulumi.Unwrap<DiskInputs>): Promise<Partial<pulumi.Unwrap<DiskOutputs>>> {
    try {
      const updateData: any = {};

      // Update properties that can be changed
      if (news.hddstandby !== olds.hddstandby) updateData.hddstandby = news.hddstandby;
      if (news.advpowermgmt !== olds.advpowermgmt) updateData.advpowermgmt = news.advpowermgmt;
      if (news.acousticlevel !== olds.acousticlevel) updateData.acousticlevel = news.acousticlevel;
      if (news.smartoptions !== olds.smartoptions) updateData.smartoptions = news.smartoptions;
      if (news.togglesmart !== olds.togglesmart) updateData.togglesmart = news.togglesmart;
      if (news.passwd !== olds.passwd) updateData.passwd = news.passwd;
      if (news.critical !== olds.critical) updateData.critical = news.critical;
      if (news.difference !== olds.difference) updateData.difference = news.difference;
      if (news.informational !== olds.informational) updateData.informational = news.informational;

      const truenas = await this.getClient(news.credential);
      if (Object.keys(updateData).length > 0) {
        await (truenas as any)["disk.update"](id, updateData);
      }

      // Read updated disk
      const disks = await (truenas as any)["disk.query"]([{ field: "identifier", operator: "=", value: id }]);
      const disk = disks[0];

      return {
        ...news,
        name: disk.name,
        subsystem: disk.subsystem,
        number: disk.number,
        serial: disk.serial,
        lunid: disk.lunid,
        size: disk.size,
        description: disk.description,
        transfermode: disk.transfermode,
        model: disk.model,
        rotationrate: disk.rotationrate,
        type: disk.type,
        zfs_guid: disk.zfs_guid,
        bus: disk.bus,
        devname: disk.devname,
        pool: disk.pool,
        supports_smart: disk.supports_smart,
        enclosure: disk.enclosure
          ? {
              id: disk.enclosure.id,
              name: disk.enclosure.name,
              model: disk.enclosure.model,
              vendor: disk.enclosure.vendor,
              product: disk.enclosure.product,
            }
          : undefined,
      };
    } catch (error: any) {
      throw new Error(`Failed to update disk: ${error.message}`);
    }
  }

  async delete(id: pulumi.ID, props: pulumi.Unwrap<DiskOutputs>): Promise<void> {
    // Disks are physical hardware - we just remove from management
    // In a real implementation, you might want to wipe the disk or remove from pool
    try {
      const truenas = await this.getClient(props.credential);
      // Reset disk settings to defaults
      await (truenas as any)["disk.update"](id.toString(), {
        hddstandby: "ALWAYS ON",
        advpowermgmt: "DISABLED",
        acousticlevel: "DISABLED",
        smartoptions: "",
        togglesmart: true,
        passwd: "",
        critical: null,
        difference: null,
        informational: null,
      });
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw new Error(`Failed to reset disk settings: ${error.message}`);
      }
    }
  }

  async read(id: pulumi.ID, props?: pulumi.Unwrap<DiskOutputs>): Promise<pulumi.dynamic.ReadResult<pulumi.Unwrap<DiskOutputs>>> {
    try {
      if (!props?.credential) {
        throw new Error("Credential is required for read operation");
      }

      const truenas = await this.getClient(props.credential);
      const disks = await (truenas as any)["disk.query"]([{ field: "identifier", operator: "=", value: id.toString() }]);

      if (!disks || disks.length === 0) {
        throw new Error(`Disk with identifier ${id} not found`);
      }

      const disk = disks[0];

      return {
        id: id,
        props: {
          credential: props.credential,
          id: id.toString(),
          identifier: disk.identifier,
          hddstandby: disk.hddstandby,
          advpowermgmt: disk.advpowermgmt,
          acousticlevel: disk.acousticlevel,
          smartoptions: disk.smartoptions,
          togglesmart: disk.togglesmart,
          passwd: undefined, // Never return sensitive data
          critical: disk.critical,
          difference: disk.difference,
          informational: disk.informational,
          name: disk.name,
          subsystem: disk.subsystem,
          number: disk.number,
          serial: disk.serial,
          lunid: disk.lunid,
          size: disk.size,
          description: disk.description,
          transfermode: disk.transfermode,
          model: disk.model,
          rotationrate: disk.rotationrate,
          type: disk.type,
          zfs_guid: disk.zfs_guid,
          bus: disk.bus,
          devname: disk.devname,
          pool: disk.pool,
          supports_smart: disk.supports_smart,
          enclosure: disk.enclosure
            ? {
                id: disk.enclosure.id,
                name: disk.enclosure.name,
                model: disk.enclosure.model,
                vendor: disk.enclosure.vendor,
                product: disk.enclosure.product,
              }
            : undefined,
        } as pulumi.Unwrap<DiskOutputs>,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

// Disk Resource Class
export class TruenasDisk extends TruenasResource<DiskInputs, DiskOutputs> {
  public readonly credential!: pulumi.Output<string>;
  public readonly identifier!: pulumi.Output<string>;
  public readonly hddstandby!: pulumi.Output<string | undefined>;
  public readonly advpowermgmt!: pulumi.Output<string | undefined>;
  public readonly acousticlevel!: pulumi.Output<string | undefined>;
  public readonly smartoptions!: pulumi.Output<string | undefined>;
  public readonly togglesmart!: pulumi.Output<boolean | undefined>;
  public readonly passwd!: pulumi.Output<string | undefined>;
  public readonly critical!: pulumi.Output<number | undefined>;
  public readonly difference!: pulumi.Output<number | undefined>;
  public readonly informational!: pulumi.Output<number | undefined>;
  public readonly name!: pulumi.Output<string>;
  public readonly subsystem!: pulumi.Output<string>;
  public readonly number!: pulumi.Output<number>;
  public readonly serial!: pulumi.Output<string>;
  public readonly lunid!: pulumi.Output<string | undefined>;
  public readonly size!: pulumi.Output<number>;
  public readonly description!: pulumi.Output<string>;
  public readonly transfermode!: pulumi.Output<string>;
  public readonly model!: pulumi.Output<string>;
  public readonly rotationrate!: pulumi.Output<number | undefined>;
  public readonly type!: pulumi.Output<string>;
  public readonly zfs_guid!: pulumi.Output<string | undefined>;
  public readonly bus!: pulumi.Output<string>;
  public readonly devname!: pulumi.Output<string>;
  public readonly pool!: pulumi.Output<string | undefined>;
  public readonly supports_smart!: pulumi.Output<boolean | undefined>;
  public readonly enclosure!: pulumi.Output<
    | {
        id: string;
        name: string;
        model: string;
        vendor: string;
        product: string;
      }
    | undefined
  >;

  constructor(name: string, args: DiskInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = new TruenasDiskProvider();
    super("truenas:index:Disk", name, args, provider, opts);
  }
}
