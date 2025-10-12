import { FullItem, GeneratorRecipe } from "@1password/connect";
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

export const TypeEnum = FullItemAllOfFields.TypeEnum;
export type TypeEnum = FullItemAllOfFields.TypeEnum;
export const PurposeEnum = FullItemAllOfFields.PurposeEnum;
export type PurposeEnum = FullItemAllOfFields.PurposeEnum;
export const CategoryEnum = FullItem.CategoryEnum;
export type CategoryEnum = FullItem.CategoryEnum;

export interface OnePasswordItemFieldInput {
  type?: pulumi.Input<TypeEnum>;
  purpose?: pulumi.Input<PurposeEnum>;
  value?: pulumi.Input<string | undefined>;
  generate?: pulumi.Input<boolean>;
  recipe?: pulumi.Input<GeneratorRecipe>;
  entropy?: pulumi.Input<number>;
  otp?: pulumi.Input<string>;
}
export interface OnePasswordItemFileInput {
  content_path?: pulumi.Input<string>;
  content?: pulumi.Input<string>;
}

export interface OnePasswordItemSectionInput {
  fields?: pulumi.Input<Record<string, pulumi.Input<OnePasswordItemFieldInput>>>;
  files?: pulumi.Input<Record<string, pulumi.Input<OnePasswordItemFileInput>>>;
}

export interface OnePasswordItemInputs {
  title: pulumi.Input<string>;
  category: pulumi.Input<CategoryEnum>;
  urls?: pulumi.Input<ItemUrls[]>;
  tags?: pulumi.Input<pulumi.Input<string>[]>;
  fields?: pulumi.Input<Record<string, pulumi.Input<OnePasswordItemFieldInput>>>;
  sections?: pulumi.Input<Record<string, pulumi.Input<OnePasswordItemSectionInput>>>;
  files?: pulumi.Input<Record<string, pulumi.Input<OnePasswordItemFileInput>>>;
}

export interface OnePasswordItemFieldOutput {
  id: pulumi.Output<string>;
  type: pulumi.Output<TypeEnum>;
  purpose: pulumi.Output<PurposeEnum>;
  value: pulumi.Output<string>;
  otp: pulumi.Output<string>;
}

export interface OnePasswordItemFileOutput {
  id: pulumi.Output<string>;
  name: pulumi.Output<string>;
  content_path: pulumi.Output<string>;
  content: pulumi.Output<string>;
}

export interface OnePasswordItemSectionOutput {
  id: pulumi.Output<string>;
  fields: pulumi.Output<Record<string, pulumi.Output<OnePasswordItemFieldOutput>>>;
  files: pulumi.Output<Record<string, pulumi.Output<OnePasswordItemFileOutput>>>;
}

export interface OnePasswordItemOutputs {
  title: pulumi.Output<string>;
  category: pulumi.Output<CategoryEnum>;
  urls: pulumi.Output<ItemUrls[]>;
  tags: pulumi.Output<pulumi.Output<string>[]>;
  sections: pulumi.Output<Record<string, pulumi.Output<OnePasswordItemSectionOutput>>>;
  fields: pulumi.Output<Record<string, pulumi.Output<OnePasswordItemFieldOutput>>>;
  files: pulumi.Output<Record<string, pulumi.Output<OnePasswordItemFileOutput>>>;
}

export interface OnePasswordItemProviderOutputs {
  id: string;
  title: string;
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
    const client = new OPClient();
    const replaces: string[] = [];
    const allowedProperties = ["title", "category", "urls", "tags", "sections", "fields", "files"];

    const differ = jsondiffpatch.create({
      propertyFilter: (name, context) => allowedProperties.some((prop) => name.startsWith(prop)),
    });
    const newerInputs = client.mapItem(client.mapToFullItem(newInputs), id);
    const old = Object.assign({} as any, oldOutputs);
    delete old["__provider"];
    const newer = Object.assign({} as any, newerInputs);
    delete newer["__provider"];
    const delta = differ.diff(old, newer);
    const patch = jsonpatch
      .format(delta)
      .filter((z) => z.op !== "move")
      .filter((change) => {
        if (change.path.startsWith("/fields") && change.path.endsWith("/id")) return false;
        return true;
      });
    console.log("OnePasswordItemProvider.diff", { old, newer, patch });

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
    return newLocal;
  }
}

export class OnePasswordItem extends pulumi.dynamic.Resource implements OnePasswordItemOutputs {
  constructor(name: string, props: OnePasswordItemInputs, opts?: pulumi.CustomResourceOptions) {
    super(new OnePasswordItemProvider(), name, props, opts);
  }
}
export interface OnePasswordItem extends OnePasswordItemOutputs {}
