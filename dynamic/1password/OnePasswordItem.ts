import { FullItem } from "@1password/connect";
import { FullItemAllOfFields } from "@1password/connect/dist/model/fullItemAllOfFields.js";
import { FullItemAllOfSections } from "@1password/connect/dist/model/fullItemAllOfSections.js";
import { ItemFile } from "@1password/connect/dist/model/itemFile.js";
import { ItemUrls } from "@1password/connect/dist/model/itemUrls.js";
import * as pulumi from "@pulumi/pulumi";
import { OPClient, OPClientItemInput } from "../../components/op.ts";
import * as jsondiffpatch from "jsondiffpatch";
import * as jsonpatch from "jsondiffpatch/formatters/jsonpatch";
import { DiffResult } from "@pulumi/pulumi/dynamic/index.js";
import { removeUndefinedProperties } from "../../components/helpers.ts";

export type OnePasswordItemFieldInput = pulumi.Input<FullItemAllOfFields>;
export type OnePasswordItemFileInput = pulumi.Input<ItemFile>;

export interface OnePasswordItemSectionInput {
  id: pulumi.Input<string>;
  label: pulumi.Input<string>;
  fields: pulumi.Input<Record<string, OnePasswordItemFieldInput>>;
  files: pulumi.Input<Record<string, OnePasswordItemFileInput>>;
}

export interface OnePasswordItemInputs {
  title: pulumi.Input<string>;
  category: pulumi.Input<FullItem.CategoryEnum>;
  urls?: pulumi.Input<ItemUrls[]>;
  tags?: pulumi.Input<pulumi.Input<string>[]>;
  fields?: pulumi.Input<Record<string, OnePasswordItemFieldInput>>;
  sections?: pulumi.Input<Record<string, OnePasswordItemSectionInput>>;
  files?: pulumi.Input<Record<string, OnePasswordItemFileInput>>;
}

export type OnePasswordItemFieldOutput = pulumi.Lifted<FullItemAllOfFields>;
export type OnePasswordItemFileOutput = pulumi.Lifted<ItemFile>;
export type OnePasswordItemSectionOutput = pulumi.Lifted<OnePasswordItemSectionInput>;
export interface OnePasswordItemProviderOutputs {
  id: pulumi.Output<string>;
  title: pulumi.Output<string>;
  category: pulumi.Output<number>;
  urls: pulumi.Output<ItemUrls[]>;
  tags: pulumi.Output<string[]>;
  sections: pulumi.Output<Record<string, OnePasswordItemSectionOutput>>;
  fields: pulumi.Output<Record<string, OnePasswordItemFieldOutput>>;
  files: pulumi.Output<Record<string, OnePasswordItemFileOutput>>;
}

class OnePasswordItemProvider implements pulumi.dynamic.ResourceProvider {
  async create(inputs: OPClientItemInput) {
    const client = new OPClient();

    const item = await client.createItem(inputs);
    return { id: item.id!, outs: { ...item, id: item.id! } };
  }

  async update(id: string, inputs: OPClientItemInput) {
    const client = new OPClient();

    const item = await client.updateItem(id, inputs);
    return { outs: { ...item, id } };
  }

  async delete(id: string) {
    const client = new OPClient();
    await client.deleteItem(id);
  }

  async read(id: string, props: OPClientItemInput) {
    const client = new OPClient();
    const item = await client.getItemById(id);
    return { id, props: { ...props, ...item, id } };
  }

  async diff(id: string, oldOutputs: pulumi.Unwrap<OnePasswordItemProviderOutputs>, newInputs: OPClientItemInput) {
    const replaces: string[] = [];
    const allowedProperties = ["title", "category", "urls", "tags", "sections", "fields", "files"];

    const differ = jsondiffpatch.create({
      propertyFilter: (name, context) => allowedProperties.some((prop) => name.startsWith(prop)),
    });
    const delta = differ.diff(oldOutputs, newInputs);
    const patch = jsonpatch
      .format(delta)
      .filter((z) => z.op !== "move")
      .filter((change) => {
        if (change.path.startsWith("/fields") && change.path.endsWith("/id")) return false;
        if (change.op === "remove") return false;
        return true;
      });

    for (const change of patch) {
      if (change.op === "replace" && change.path === "/category") {
        replaces.push(change.path.substring(1));
      }
    }
    const newLocal = {
      replaces: replaces,
      changes: patch.length > 0,
      stables: [],
      deleteBeforeReplace: true,
    } as DiffResult;
    console.log("OnePasswordItem diff", { oldOutputs, newInputs, patch, diffResult: newLocal });
    return newLocal;
  }
}

export class OnePasswordItem extends pulumi.dynamic.Resource {
  constructor(name: string, props: OnePasswordItemInputs, opts?: pulumi.CustomResourceOptions) {
    super(new OnePasswordItemProvider(), name, props, opts);
  }

  public readonly title!: pulumi.Output<string>;
  public readonly category!: pulumi.Output<number>;
  public readonly urls!: pulumi.Output<ItemUrls[]>;
  public readonly tags!: pulumi.Output<string[]>;
  public readonly sections!: pulumi.Output<Record<string, OnePasswordItemSectionOutput>>;
  public readonly fields!: pulumi.Output<Record<string, OnePasswordItemFieldOutput>>;
  public readonly files!: pulumi.Output<Record<string, OnePasswordItemFileOutput>>;
}
