import { FullItem } from "@1password/connect";
import { FullItemAllOfFields } from "@1password/connect/dist/model/fullItemAllOfFields.js";
import { FullItemAllOfSections } from "@1password/connect/dist/model/fullItemAllOfSections.js";
import { ItemFile } from "@1password/connect/dist/model/itemFile.js";
import { ItemUrls } from "@1password/connect/dist/model/itemUrls.js";
import * as pulumi from "@pulumi/pulumi";
import { OPClient } from "../../components/op.ts";
import * as jsondiffpatch from "jsondiffpatch";
import * as jsonpatch from "jsondiffpatch/formatters/jsonpatch";
import { DiffResult } from "@pulumi/pulumi/dynamic/index.js";

export interface OnePasswordItemInputs {
  title: pulumi.Input<string>;
  category: pulumi.Input<number>;
  urls?: pulumi.Input<pulumi.Input<ItemUrls>[]>;
  tags?: pulumi.Input<string[]>;
  sections?: pulumi.Input<pulumi.Input<FullItemAllOfSections>[]>;
  fields?: pulumi.Input<pulumi.Input<FullItemAllOfFields>[]>;
  files?: pulumi.Input<pulumi.Input<ItemFile>[]>;
}

interface OnePasswordItemProviderInputs {
  title: string;
  category: number;
  urls?: ItemUrls[];
  tags?: string[];
  sections?: FullItemAllOfSections[];
  fields?: FullItemAllOfFields[];
  files?: ItemFile[];
}

export interface OnePasswordItemProviderOutputs {
  id: pulumi.Output<string>;
  title: pulumi.Output<string>;
  category: pulumi.Output<number>;
  urls?: pulumi.Output<ItemUrls[]>;
  tags?: pulumi.Output<string[]>;
  sections?: pulumi.Output<FullItemAllOfSections[]>;
  fields?: pulumi.Output<FullItemAllOfFields[]>;
  files?: pulumi.Output<ItemFile[]>;
  favorite?: pulumi.Output<boolean>;
  version?: pulumi.Output<number>;
  trashed?: pulumi.Output<boolean>;
  createdAt?: pulumi.Output<Date>;
  updatedAt?: pulumi.Output<Date>;
  lastEditedBy?: pulumi.Output<string>;
}

class OnePasswordItemProvider implements pulumi.dynamic.ResourceProvider {
  async create(inputs: OnePasswordItemProviderInputs) {
    const client = new OPClient();

    inputs.fields ??= [];
    if (!inputs.fields.some((f) => f.label === "notesPlain")) {
      inputs.fields.splice(0, 0, { label: "notesPlain", purpose: FullItemAllOfFields.PurposeEnum.Notes, type: FullItemAllOfFields.TypeEnum.String });
    }

    const item = await client.createItem(inputs);
    return { id: item.id!, outs: { ...this.itemWithDefaults(item), id: item.id! } };
  }

  async update(id: string, inputs: OnePasswordItemProviderInputs) {
    const client = new OPClient();

    inputs.fields ??= [];
    if (!inputs.fields.some((f) => f.label === "notesPlain")) {
      inputs.fields.splice(0, 0, { label: "notesPlain", purpose: FullItemAllOfFields.PurposeEnum.Notes, type: FullItemAllOfFields.TypeEnum.String });
    }

    const item = await client.updateItem(id, inputs);
    return { outs: { ...this.itemWithDefaults(item), id } };
  }

  async delete(id: string) {
    const client = new OPClient();
    await client.deleteItem(id);
  }

  private itemWithDefaults(item: FullItem): any {
    return this.removeUndefinedProperties(item);
  }

  private removeUndefinedProperties(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.filter((item) => item !== undefined).map((item) => this.removeUndefinedProperties(item));
    }
    if (typeof obj === "object") {
      return Object.fromEntries(
        Object.entries(obj)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => [k, this.removeUndefinedProperties(v)] as const)
      );
    }
    return obj;
  }

  async read(id: string, props: OnePasswordItemProviderInputs) {
    const client = new OPClient();
    const item = await client.getItemById(id);
    return { id: item.id!, props: { ...props, ...this.itemWithDefaults(item), id: item.id! } };
  }

  async diff(id: string, oldOutputs: pulumi.Unwrap<OnePasswordItemProviderOutputs>, newInputs: OnePasswordItemProviderInputs) {
    const replaces: string[] = [];

    const differ = jsondiffpatch.create();
    if (oldOutputs.fields) {
      oldOutputs.fields = oldOutputs.fields.filter((f) => f.label !== "notesPlain");
    }
    const delta = differ.diff(oldOutputs, newInputs);
    const allowedProperties = ["title", "category", "urls", "tags", "sections", "fields", "files"];
    const patch = jsonpatch
      .format(delta)
      .filter((z) => z.op !== "move")
      .filter((change) => allowedProperties.some((prop) => change.path.substring(1).startsWith(prop)) && change.op !== "remove")
      .filter((change) => {
        if (change.path.startsWith("/fields") && change.path.endsWith("/id")) return false;
        return true;
      });

    for (const change of patch) {
      if (change.op === "replace" && change.path === "/category") {
        replaces.push(change.path.substring(1));
      }
    }

    return {
      replaces: replaces,
      changes: patch.length > 0,
      stables: [],
      deleteBeforeReplace: true,
    } as DiffResult;
  }
}

export class OnePasswordItem extends pulumi.dynamic.Resource {
  constructor(name: string, props: OnePasswordItemInputs, opts?: pulumi.CustomResourceOptions) {
    super(new OnePasswordItemProvider(), name, props, opts);
  }

  public readonly title!: pulumi.Output<string>;
  public readonly category!: pulumi.Output<FullItem.CategoryEnum>;
  public readonly urls!: pulumi.Output<ItemUrls[]>;
  public readonly tags!: pulumi.Output<string[]>;
  public readonly sections!: pulumi.Output<FullItemAllOfSections[]>;
  public readonly fields!: pulumi.Output<FullItemAllOfFields[]>;
  public readonly files!: pulumi.Output<ItemFile[]>;
  public readonly favorite?: pulumi.Output<boolean>;
  public readonly version?: pulumi.Output<number>;
  public readonly trashed?: pulumi.Output<boolean>;
  public readonly createdAt?: pulumi.Output<Date>;
  public readonly updatedAt?: pulumi.Output<Date>;
  public readonly lastEditedBy?: pulumi.Output<string>;
}
