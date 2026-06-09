import { FullItem, GeneratorRecipe } from "@1password/connect";
import { FullItemAllOfFields } from "@1password/connect/dist/model/fullItemAllOfFields.js";
import { ItemUrls } from "@1password/connect/dist/model/itemUrls.js";
import * as pulumi from "@pulumi/pulumi";
import { OPClient, OPClientItemInput } from "../../components/op.ts";
import * as jsondiffpatch from "jsondiffpatch";
import * as jsonpatch from "jsondiffpatch/formatters/jsonpatch";
import { DiffResult } from "@pulumi/pulumi/dynamic/index.js";
import { getSecretItem } from "@components/store/index.ts";
import { awaitOutput } from "@components/helpers.ts";

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
  size: pulumi.Output<number>;
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

    const item = await this.retry(() => client.createItem(inputs));
    return { id: item?.id!, outs: { ...item, id: item?.id! } };
  }

  async update(id: string, inputs: OPClientItemInput) {
    const client = new OPClient();

    const item = await this.retry(() => client.updateItem(id, inputs));
    return { outs: { ...item, id } };
  }

  async retry<T>(action: () => Promise<NonNullable<T>>) {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await action();
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          throw error;
        }
      }
    }
    return Promise.reject(new Error("Max retries reached"));
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
      propertyFilter(name, context) {
        return name !== "meta";
      },
    });

    const fullNewInputs = client.mapItem(client.mapToFullItem(newInputs), id);

    const compareOlds = await awaitOutput(getSecretItem(oldOutputs));
    const compareNews = await awaitOutput(getSecretItem(fullNewInputs));
    const delta = differ.diff(compareOlds, compareNews);
    const patch = jsonpatch.format(delta).filter((z) => z.op !== "move");
    // .filter((change) => {
    //   if (change.op === "remove" && (change.path.endsWith("/id") || change.path.endsWith("/section"))) return false;
    //   if (change.path.startsWith("/fields") && change.path.endsWith("/id")) return false;
    //   if (change.path.endsWith("/label")) return false;
    //   return true;
    // })
    if (patch.length > 0) {
      pulumi.log.info(
        `OnePasswordItem diff for item ${newInputs.title} (${id}): ${JSON.stringify(
          {
            patch,
            compareOlds,
            compareNews,
          },
          null,
          2,
        )}`,
      );
    } else {
      pulumi.log.info(
        `OnePasswordItem no changes detected for item ${newInputs.title} (${id}): ${JSON.stringify(
          {
            patch,
            compareOlds,
            compareNews,
          },
          null,
          2,
        )}`,
      );
    }

    for (const change of patch) {
      replaces.push(change.path.substring(1));
    }

    return {
      replaces: replaces,
      changes: patch.length > 0,
      stables: [],
      deleteBeforeReplace: true,
    };
  }
}

export class OnePasswordItem extends pulumi.dynamic.Resource implements OnePasswordItemOutputs {
  constructor(name: string, props: OnePasswordItemInputs, opts?: pulumi.CustomResourceOptions) {
    super(new OnePasswordItemProvider(), name, props, { deleteBeforeReplace: true, replaceOnChanges: ["*"], ...opts });
  }
}
export interface OnePasswordItem extends OnePasswordItemOutputs {}
