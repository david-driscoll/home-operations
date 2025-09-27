import { ID, Input, Unwrap, dynamic, output } from "@pulumi/pulumi";
import * as pulumi from "@pulumi/pulumi";
import { createTruenasClient } from "../../components/truenas.js";
import { diff } from "jiff";
import TypedTrueNASClient from "../../components/truenas/typed-truenas-client.js";

// Base interface for all TrueNAS resource inputs
export interface TruenasResourceInputs {
  credential: Input<string>;
}

// Base interface for all TrueNAS resource outputs
export interface TruenasResourceOutputs extends pulumi.Unwrap<TruenasResourceInputs> {
  id: string;
}

// Base TrueNAS Dynamic Provider with generic types
export abstract class TruenasProvider<TInputs extends TruenasResourceInputs, TOutputs extends TruenasResourceOutputs> implements dynamic.ResourceProvider<Unwrap<TInputs>, Unwrap<TOutputs>> {
  abstract resourceType: string;
  private _client: TypedTrueNASClient | undefined;

  protected async getClient(credential: string) {
    return (this._client ??= await createTruenasClient(credential));
  }

  protected get stables() {
    return [];
  }

  /**
   * Compare old and new inputs to determine what changed
   */
  async diff(id: ID, outputs: Unwrap<TOutputs>, inputs: Unwrap<TInputs>): Promise<dynamic.DiffResult> {
    const results = diff(outputs, inputs).filter((z) => z.path !== "id");

    return {
      changes: results.length > 0,
      replaces: [],
      stables: [...this.stables, "id"],
      deleteBeforeReplace: true,
    };
  }

  /**
   * Create a new resource
   */
  abstract create(inputs: Unwrap<TInputs>): Promise<pulumi.dynamic.CreateResult<Unwrap<TOutputs>>>;

  /**
   * Update an existing resource
   */
  async update(id: pulumi.ID, olds: Unwrap<TOutputs>, news: Unwrap<TInputs>): Promise<pulumi.dynamic.UpdateResult<Unwrap<TOutputs>>> {
    // Default implementation - override in subclasses for custom update logic
    const result = await this.doUpdate(id.toString(), olds, news);
    return {
      outs: {
        ...news,
        id: id.toString(),
        ...result,
      } as Unwrap<TOutputs>,
    };
  }

  /**
   * Override in subclasses to implement actual update logic
   */
  protected abstract doUpdate(id: string, olds: Unwrap<TOutputs>, news: Unwrap<TInputs>): Promise<Partial<Unwrap<TOutputs>>>;

  /**
   * Delete a resource
   */
  abstract delete(id: pulumi.ID, props: Unwrap<TOutputs>): Promise<void>;

  /**
   * Read/refresh a resource
   */
  abstract read(id: pulumi.ID, props?: Unwrap<TOutputs>): Promise<pulumi.dynamic.ReadResult<Unwrap<TOutputs>>>;

  /**
   * Override in subclasses to determine if an error indicates resource not found
   */
  protected isNotFoundError(error: any): boolean {
    // JSON-RPC errors have different structure than HTTP errors
    return (
      error?.code === -32601 || // Method not found
      error?.message?.includes("not found") ||
      (error?.data?.errname === "CallError" && error?.data?.reason?.includes("not found"))
    );
  }

  /**
   * Validate inputs before create/update
   */
  protected validateInputs(inputs: Unwrap<TInputs>): void {
    // Override in subclasses for validation
  }

  /**
   * Generate a unique ID for new resources
   */
  protected generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Base class for TrueNAS Custom Resources
export abstract class TruenasResource<TInputs extends TruenasResourceInputs, TOutputs extends TruenasResourceOutputs> extends pulumi.dynamic.Resource {
  constructor(type: string, name: string, props: TInputs, provider: TruenasProvider<pulumi.Unwrap<TInputs>, TOutputs>, opts?: pulumi.CustomResourceOptions) {
    super(
      provider,
      name,
      props,
      {
        ...opts,
        id: opts?.id,
      },
      type
    );
  }
}
