import * as pulumi from "@pulumi/pulumi";
import { TruenasProvider, TruenasResource, TruenasResourceInputs, TruenasResourceOutputs } from "./truenas.js";

// System resource types
export interface SystemInputs extends TruenasResourceInputs {
  /** System hostname */
  hostname?: pulumi.Input<string>;
  /** System timezone */
  timezone?: pulumi.Input<string>;
  /** System domain */
  domain?: pulumi.Input<string>;
  /** Additional DNS search domains */
  domain_search?: pulumi.Input<string[]>;
  /** DNS servers */
  nameservers?: pulumi.Input<string[]>;
  /** Default gateway */
  ipv4gateway?: pulumi.Input<string>;
  /** IPv6 default gateway */
  ipv6gateway?: pulumi.Input<string>;
  /** HTTP proxy */
  httpproxy?: pulumi.Input<string>;
  /** Language */
  language?: pulumi.Input<string>;
  /** Console keyboard map */
  kbdmap?: pulumi.Input<string>;
  /** System description */
  description?: pulumi.Input<string>;
  /** Location */
  location?: pulumi.Input<string>;
}

export interface SystemOutputs extends pulumi.Unwrap<SystemInputs>, TruenasResourceOutputs {
  /** TrueNAS version */
  version: string;
  /** System build time */
  buildtime: string;
  /** System uptime */
  uptime: string;
  /** System uptime in seconds */
  uptime_seconds: number;
  /** Physical memory in bytes */
  physmem: number;
  /** System model */
  model: string;
  /** CPU cores */
  cores: number;
  /** Physical CPU cores */
  physical_cores: number;
  /** Load averages */
  loadavg: number[];
  /** System serial number */
  system_serial: string;
  /** Boot time */
  boottime: string;
  /** Current datetime */
  datetime: string;
  /** System birthday */
  birthday: string;
  /** System manufacturer */
  system_manufacturer: string;
  /** System product */
  system_product: string;
  /** System product version */
  system_product_version: string;
  /** ECC memory support */
  ecc_memory: boolean;
  /** License information */
  license?: any;
}

// System Provider Implementation
export class TruenasSystemProvider extends TruenasProvider<SystemInputs, SystemOutputs> {
  resourceType = "truenas:index:System";

  protected isReplaceProperty(propertyName: string): boolean {
    // No properties require replacement for system configuration
    return false;
  }

  protected validateInputs(inputs: pulumi.Unwrap<SystemInputs>): void {
    // Basic validation for system inputs
    if (inputs.hostname && inputs.hostname.length > 253) {
      throw new Error("Hostname cannot be longer than 253 characters");
    }
  }

  async create(inputs: pulumi.Unwrap<SystemInputs>): Promise<pulumi.dynamic.CreateResult> {
    this.validateInputs(inputs);

    try {
      const truenas = await this.getClient(inputs.credential);

      // Get current system info
      const systemInfo = await truenas["system.info"]();

      // Update system configuration if any settings are provided
      const updateData: any = {};
      if (inputs.hostname !== undefined) updateData.hostname = inputs.hostname;
      if (inputs.timezone !== undefined) updateData.timezone = inputs.timezone;
      if (inputs.domain !== undefined) updateData.domain = inputs.domain;
      if (inputs.domain_search !== undefined) updateData.domain_search = inputs.domain_search;
      if (inputs.nameservers !== undefined) updateData.nameservers = inputs.nameservers;
      if (inputs.ipv4gateway !== undefined) updateData.ipv4gateway = inputs.ipv4gateway;
      if (inputs.ipv6gateway !== undefined) updateData.ipv6gateway = inputs.ipv6gateway;
      if (inputs.httpproxy !== undefined) updateData.httpproxy = inputs.httpproxy;
      if (inputs.language !== undefined) updateData.language = inputs.language;
      if (inputs.kbdmap !== undefined) updateData.kbdmap = inputs.kbdmap;
      if (inputs.description !== undefined) updateData.description = inputs.description;
      if (inputs.location !== undefined) updateData.location = inputs.location;

      if (Object.keys(updateData).length > 0) {
        await (truenas as any)["system.general.update"](updateData);
      }

      // Use hostname as ID since system is a singleton
      const id = systemInfo.hostname || "system";

      return {
        id: id,
        outs: {
          ...inputs,
          id: id,
          version: systemInfo.version,
          buildtime: systemInfo.buildtime,
          uptime: systemInfo.uptime,
          uptime_seconds: systemInfo.uptime_seconds,
          physmem: systemInfo.physmem,
          model: systemInfo.model,
          cores: systemInfo.cores,
          physical_cores: systemInfo.physical_cores,
          loadavg: systemInfo.loadavg,
          system_serial: systemInfo.system_serial,
          boottime: systemInfo.boottime,
          datetime: systemInfo.datetime,
          birthday: systemInfo.birthday,
          system_manufacturer: systemInfo.system_manufacturer,
          system_product: systemInfo.system_product,
          system_product_version: systemInfo.system_product_version,
          ecc_memory: systemInfo.ecc_memory,
          license: systemInfo.license,
        } as SystemOutputs,
      };
    } catch (error: any) {
      throw new Error(`Failed to configure system: ${error.message}`);
    }
  }

  protected async doUpdate(id: string, olds: pulumi.Unwrap<SystemOutputs>, news: pulumi.Unwrap<SystemInputs>): Promise<Partial<pulumi.Unwrap<SystemOutputs>>> {
    try {
      const updateData: any = {};

      // Update properties that can be changed
      if (news.hostname !== olds.hostname) updateData.hostname = news.hostname;
      if (news.timezone !== olds.timezone) updateData.timezone = news.timezone;
      if (news.domain !== olds.domain) updateData.domain = news.domain;
      if (news.domain_search && JSON.stringify(news.domain_search) !== JSON.stringify(olds.domain_search)) {
        updateData.domain_search = news.domain_search;
      }
      if (news.nameservers && JSON.stringify(news.nameservers) !== JSON.stringify(olds.nameservers)) {
        updateData.nameservers = news.nameservers;
      }
      if (news.ipv4gateway !== olds.ipv4gateway) updateData.ipv4gateway = news.ipv4gateway;
      if (news.ipv6gateway !== olds.ipv6gateway) updateData.ipv6gateway = news.ipv6gateway;
      if (news.httpproxy !== olds.httpproxy) updateData.httpproxy = news.httpproxy;
      if (news.language !== olds.language) updateData.language = news.language;
      if (news.kbdmap !== olds.kbdmap) updateData.kbdmap = news.kbdmap;
      if (news.description !== olds.description) updateData.description = news.description;
      if (news.location !== olds.location) updateData.location = news.location;

      const truenas = await this.getClient(news.credential);
      if (Object.keys(updateData).length > 0) {
        await (truenas as any)["system.general.update"](updateData);
      }

      // Read updated system info
      const systemInfo = await truenas["system.info"]();

      return {
        ...news,
        version: systemInfo.version,
        buildtime: systemInfo.buildtime,
        uptime: systemInfo.uptime,
        uptime_seconds: systemInfo.uptime_seconds,
        physmem: systemInfo.physmem,
        model: systemInfo.model,
        cores: systemInfo.cores,
        physical_cores: systemInfo.physical_cores,
        loadavg: systemInfo.loadavg,
        system_serial: systemInfo.system_serial,
        boottime: systemInfo.boottime,
        datetime: systemInfo.datetime,
        birthday: systemInfo.birthday,
        system_manufacturer: systemInfo.system_manufacturer,
        system_product: systemInfo.system_product,
        system_product_version: systemInfo.system_product_version,
        ecc_memory: systemInfo.ecc_memory,
        license: systemInfo.license,
      };
    } catch (error: any) {
      throw new Error(`Failed to update system: ${error.message}`);
    }
  }

  async delete(id: pulumi.ID, props: pulumi.Unwrap<SystemOutputs>): Promise<void> {
    // System configuration cannot be "deleted", but we can reset to defaults
    try {
      const truenas = await this.getClient(props.credential);
      // Reset to default configuration (example values)
      await (truenas as any)["system.general.update"]({
        hostname: "truenas",
        timezone: "UTC",
        domain: "local",
        domain_search: [],
        nameservers: [],
        httpproxy: "",
        language: "en",
        kbdmap: "us",
        description: "",
        location: "",
      });
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw new Error(`Failed to reset system configuration: ${error.message}`);
      }
    }
  }

  async read(id: pulumi.ID, props?: pulumi.Unwrap<SystemOutputs>): Promise<pulumi.dynamic.ReadResult<pulumi.Unwrap<SystemOutputs>>> {
    try {
      if (!props?.credential) {
        throw new Error("Credential is required for read operation");
      }

      const truenas = await this.getClient(props.credential);
      const systemInfo = await truenas["system.info"]();

      // Get current system configuration
      const config = await (truenas as any)["system.general.config"]();

      return {
        id: id,
        props: {
          credential: props.credential,
          id: id.toString(),
          hostname: config.hostname,
          timezone: config.timezone,
          domain: config.domain,
          domain_search: config.domain_search,
          nameservers: config.nameservers,
          ipv4gateway: config.ipv4gateway,
          ipv6gateway: config.ipv6gateway,
          httpproxy: config.httpproxy,
          language: config.language,
          kbdmap: config.kbdmap,
          description: config.description,
          location: config.location,
          version: systemInfo.version,
          buildtime: systemInfo.buildtime,
          uptime: systemInfo.uptime,
          uptime_seconds: systemInfo.uptime_seconds,
          physmem: systemInfo.physmem,
          model: systemInfo.model,
          cores: systemInfo.cores,
          physical_cores: systemInfo.physical_cores,
          loadavg: systemInfo.loadavg,
          system_serial: systemInfo.system_serial,
          boottime: systemInfo.boottime,
          datetime: systemInfo.datetime,
          birthday: systemInfo.birthday,
          system_manufacturer: systemInfo.system_manufacturer,
          system_product: systemInfo.system_product,
          system_product_version: systemInfo.system_product_version,
          ecc_memory: systemInfo.ecc_memory,
          license: systemInfo.license,
        } as pulumi.Unwrap<SystemOutputs>,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

// System Resource Class
export class TruenasSystem extends TruenasResource<SystemInputs, SystemOutputs> {
  public readonly credential!: pulumi.Output<string>;
  public readonly hostname!: pulumi.Output<string | undefined>;
  public readonly timezone!: pulumi.Output<string | undefined>;
  public readonly domain!: pulumi.Output<string | undefined>;
  public readonly domain_search!: pulumi.Output<string[] | undefined>;
  public readonly nameservers!: pulumi.Output<string[] | undefined>;
  public readonly ipv4gateway!: pulumi.Output<string | undefined>;
  public readonly ipv6gateway!: pulumi.Output<string | undefined>;
  public readonly httpproxy!: pulumi.Output<string | undefined>;
  public readonly language!: pulumi.Output<string | undefined>;
  public readonly kbdmap!: pulumi.Output<string | undefined>;
  public readonly description!: pulumi.Output<string | undefined>;
  public readonly location!: pulumi.Output<string | undefined>;
  public readonly version!: pulumi.Output<string>;
  public readonly buildtime!: pulumi.Output<string>;
  public readonly uptime!: pulumi.Output<string>;
  public readonly uptime_seconds!: pulumi.Output<number>;
  public readonly physmem!: pulumi.Output<number>;
  public readonly model!: pulumi.Output<string>;
  public readonly cores!: pulumi.Output<number>;
  public readonly physical_cores!: pulumi.Output<number>;
  public readonly loadavg!: pulumi.Output<number[]>;
  public readonly system_serial!: pulumi.Output<string>;
  public readonly boottime!: pulumi.Output<string>;
  public readonly datetime!: pulumi.Output<string>;
  public readonly birthday!: pulumi.Output<string>;
  public readonly system_manufacturer!: pulumi.Output<string>;
  public readonly system_product!: pulumi.Output<string>;
  public readonly system_product_version!: pulumi.Output<string>;
  public readonly ecc_memory!: pulumi.Output<boolean>;
  public readonly license!: pulumi.Output<any>;

  constructor(name: string, args: SystemInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = new TruenasSystemProvider();
    super("truenas:index:System", name, args, provider, opts);
  }
}
