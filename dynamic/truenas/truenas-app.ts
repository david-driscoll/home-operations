import * as pulumi from "@pulumi/pulumi";
import { TruenasProvider, TruenasResource, TruenasResourceInputs, TruenasResourceOutputs } from "./truenas.js";

// App resource types
export interface AppInputs extends TruenasResourceInputs {
  /** App name */
  name: pulumi.Input<string>;
  /** App catalog */
  catalog?: pulumi.Input<string>;
  /** App train (e.g., stable, community) */
  train?: pulumi.Input<string>;
  /** App version */
  version?: pulumi.Input<string>;
  /** App configuration values */
  values?: pulumi.Input<Record<string, any>>;
  /** Auto-upgrade enabled */
  auto_upgrade?: pulumi.Input<boolean>;
}

export interface AppOutputs extends pulumi.Unwrap<AppInputs>, TruenasResourceOutputs {
  /** App state */
  state: string;
  /** Installed version */
  installed_version: string;
  /** Available upgrade version */
  upgrade_available: boolean;
  /** Upgrade version */
  upgrade_version?: string;
  /** Chart metadata */
  chart_metadata: {
    name: string;
    version: string;
    description: string;
    home?: string;
    icon?: string;
    keywords?: string[];
  };
  /** Container images */
  container_images: Record<string, any>;
  /** Used ports */
  used_ports: Array<{
    port: number;
    protocol: string;
    host_port: number;
  }>;
  /** App notes */
  notes?: string;
  /** Resource usage */
  resources?: {
    cpu_usage: number;
    memory_usage: number;
    storage_usage: number;
  };
}

// App Provider Implementation
export class TruenasAppProvider extends TruenasProvider<AppInputs, AppOutputs> {
  resourceType = "truenas:index:App";

  protected isReplaceProperty(propertyName: string): boolean {
    // These properties require resource replacement
    return ["name", "catalog"].includes(propertyName);
  }

  protected validateInputs(inputs: pulumi.Unwrap<AppInputs>): void {
    if (!inputs.name) {
      throw new Error("App name is required");
    }
  }

  async create(inputs: pulumi.Unwrap<AppInputs>): Promise<pulumi.dynamic.CreateResult> {
    this.validateInputs(inputs);

    try {
      const appData: any = {
        app_name: inputs.name,
        catalog: inputs.catalog || "TRUENAS",
        train: inputs.train || "stable",
        values: inputs.values || {},
      };

      if (inputs.version) {
        appData.version = inputs.version;
      }

      const truenas = await this.getClient(inputs.credential);
      const result = await (truenas as any)["app.create"](appData);

      const id = inputs.name; // Use app name as ID

      return {
        id: id,
        outs: {
          ...inputs,
          id: id,
          state: result.state || "DEPLOYING",
          installed_version: result.version || inputs.version || "latest",
          upgrade_available: false,
          upgrade_version: undefined,
          chart_metadata: result.chart_metadata || {
            name: inputs.name,
            version: inputs.version || "latest",
            description: `App ${inputs.name}`,
          },
          container_images: result.container_images || {},
          used_ports: result.used_ports || [],
          notes: result.notes,
          resources: result.resources,
        },
      };
    } catch (error: any) {
      throw new Error(`Failed to create app: ${error.message}`);
    }
  }

  protected async doUpdate(id: string, olds: pulumi.Unwrap<AppOutputs>, news: pulumi.Unwrap<AppInputs>): Promise<Partial<pulumi.Unwrap<AppOutputs>>> {
    try {
      const updateData: any = {};

      // Update properties that can be changed
      if (news.values && JSON.stringify(news.values) !== JSON.stringify(olds.values)) {
        updateData.values = news.values;
      }
      if (news.version !== olds.version) {
        updateData.version = news.version;
      }
      if (news.auto_upgrade !== olds.auto_upgrade) {
        updateData.auto_upgrade = news.auto_upgrade;
      }

      const truenas = await this.getClient(news.credential);
      if (Object.keys(updateData).length > 0) {
        await (truenas as any)["app.update"](id, updateData);
      }

      // Read updated app
      const result = await (truenas as any)["app.get_instance"](id);

      return {
        ...news,
        state: result.state,
        installed_version: result.version,
        upgrade_available: result.upgrade_available || false,
        upgrade_version: result.upgrade_version,
        chart_metadata: result.chart_metadata,
        container_images: result.container_images || {},
        used_ports: result.used_ports || [],
        notes: result.notes,
        resources: result.resources,
      };
    } catch (error: any) {
      throw new Error(`Failed to update app: ${error.message}`);
    }
  }

  async delete(id: pulumi.ID, props: pulumi.Unwrap<AppOutputs>): Promise<void> {
    try {
      const truenas = await this.getClient(props.credential);
      await (truenas as any)["app.delete"](id.toString());
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw new Error(`Failed to delete app: ${error.message}`);
      }
    }
  }

  async read(id: pulumi.ID, props?: pulumi.Unwrap<AppOutputs>): Promise<pulumi.dynamic.ReadResult<pulumi.Unwrap<AppOutputs>>> {
    try {
      if (!props?.credential) {
        throw new Error("Credential is required for read operation");
      }

      const truenas = await this.getClient(props.credential);
      const result = await (truenas as any)["app.get_instance"](id.toString());

      return {
        id: id,
        props: {
          credential: props.credential,
          id: id.toString(),
          name: result.name || id.toString(),
          catalog: result.catalog,
          train: result.train,
          version: result.version,
          values: result.config || props.values,
          auto_upgrade: result.auto_upgrade,
          state: result.state,
          installed_version: result.version,
          upgrade_available: result.upgrade_available || false,
          upgrade_version: result.upgrade_version,
          chart_metadata: result.chart_metadata || {
            name: result.name || id.toString(),
            version: result.version || "unknown",
            description: result.description || "",
          },
          container_images: result.container_images || {},
          used_ports: result.used_ports || [],
          notes: result.notes,
          resources: result.resources,
        } as pulumi.Unwrap<AppOutputs>,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

// App Resource Class
export class TruenasApp extends TruenasResource<AppInputs, AppOutputs> {
  public readonly credential!: pulumi.Output<string>;
  public readonly name!: pulumi.Output<string>;
  public readonly catalog!: pulumi.Output<string | undefined>;
  public readonly train!: pulumi.Output<string | undefined>;
  public readonly version!: pulumi.Output<string | undefined>;
  public readonly values!: pulumi.Output<Record<string, any> | undefined>;
  public readonly auto_upgrade!: pulumi.Output<boolean | undefined>;
  public readonly state!: pulumi.Output<string>;
  public readonly installed_version!: pulumi.Output<string>;
  public readonly upgrade_available!: pulumi.Output<boolean>;
  public readonly upgrade_version!: pulumi.Output<string | undefined>;
  public readonly chart_metadata!: pulumi.Output<{
    name: string;
    version: string;
    description: string;
    home?: string;
    icon?: string;
    keywords?: string[];
  }>;
  public readonly container_images!: pulumi.Output<Record<string, any>>;
  public readonly used_ports!: pulumi.Output<
    Array<{
      port: number;
      protocol: string;
      host_port: number;
    }>
  >;
  public readonly notes!: pulumi.Output<string | undefined>;
  public readonly resources!: pulumi.Output<
    | {
        cpu_usage: number;
        memory_usage: number;
        storage_usage: number;
      }
    | undefined
  >;

  constructor(name: string, args: AppInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = new TruenasAppProvider();
    super("truenas:index:App", name, args, provider, opts);
  }
}
