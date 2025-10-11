import * as pulumi from "@pulumi/pulumi";

export abstract class SharedComponentResource extends pulumi.ComponentResource {
  protected readonly parent: pulumi.CustomResourceOptions;

  constructor(type: string, name: string, opts?: pulumi.ComponentResourceOptions) {
    super(type, name, {}, opts);
    this.parent = { parent: this };
  }
}
