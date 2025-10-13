import { FullItem, OPConnect } from "@1password/connect";
import { removeUndefinedProperties } from "./helpers.ts";
import { FullItemAllOfFields } from "@1password/connect/dist/model/fullItemAllOfFields.js";
import { ItemFile } from "@1password/connect/dist/model/itemFile.js";
import { zipmap } from "@pulumi/std/zipmap.js";
import { FullItemAllOfSections, ItemUrls } from "@1password/connect/dist/model/models.js";
import { input } from "@pulumi/kubernetes/types/index.js";

export interface OPClientItemFields {
  [key: string]: FullItemAllOfFields;
}

export interface OPClientItemFiles {
  [key: string]: ItemFile;
}

export interface OPClientItemSections {
  [key: string]: { fields: OPClientItemFields; files: OPClientItemFiles };
}

export interface OPClientItem {
  title: string;
  category: FullItem.CategoryEnum;
  urls: ItemUrls[];
  tags: string[];
  sections: OPClientItemSections;
  fields: OPClientItemFields;
  files: OPClientItemFiles;
}

export type OPClientItemInput = Pick<OPClientItem, "title" | "category"> & Partial<Omit<OPClientItem, "title" | "category">>;

export class OPClient {
  public client: OPConnect;
  /**
   *
   */
  constructor() {
    this.client = new OPConnect({
      serverURL: process.env.CONNECT_HOST!,
      token: process.env.CONNECT_TOKEN!,
      keepAlive: true,
    });
  }

  private async getVaultUuid(vaultName: string) {
    const vaults = await this.client.listVaults();
    const personalVault = vaults.find((v) => v.name === vaultName);
    if (!personalVault) {
      throw new Error("No vault found in 1Password Connect");
    }
    return personalVault.id!;
  }

  public async createItem(item: OPClientItemInput) {
    const vaultUuid = await this.getVaultUuid("Eris");
    return this.mapItem(
      await this.client.createItem(vaultUuid, {
        ...this.mapToFullItem(item),
        vault: { id: vaultUuid },
      } as any),
      undefined,
    );
  }

  public async updateItem(id: string, item: OPClientItemInput) {
    const vaultUuid = await this.getVaultUuid("Eris");
    try {
      const result = await this.client.updateItem(vaultUuid, {
        id,
        ...this.mapToFullItem(item),
        vault: { id: vaultUuid },
      } as any);
      return this.mapItem(result, id);
    } catch (e) {
      console.error("Error updating item", e);
      throw e;
    }
  }

  public async deleteItem(id: string) {
    const vaultUuid = await this.getVaultUuid("Eris");
    return this.client.deleteItem(vaultUuid, id);
  }

  public async getItemById(itemId: string) {
    const vaultUuid = await this.getVaultUuid("Eris");
    return this.mapItem(await this.client.getItemById(vaultUuid, itemId), itemId);
  }

  public async getItemByTitle(itemId: string) {
    const vaultUuid = await this.getVaultUuid("Eris");
    return this.mapItem(await this.client.getItemByTitle(vaultUuid, itemId), undefined);
  }

  public mapToFullItem(item: OPClientItemInput & { id?: string }): Omit<FullItem, "vault" | "extractOTP"> {
    const sections = Object.entries(item.sections ?? {}).map(([key, s]) => ({ id: key, label: key }));
    const fields = Object.entries(item.fields ?? {}).map(([fieldKey, field]) => ({
      id: fieldKey,
      ...field,
      label: fieldKey,
    }));
    const sectionFields = Object.entries(item.sections ?? {}).flatMap(([sectionKey, section]) =>
      Object.entries(section.fields ?? {}).map(([fieldKey, field]) => ({
        id: `${sectionKey}-${fieldKey}`,
        ...field,
        section: { id: sectionKey },
        label: fieldKey,
      })),
    );

    const files = Object.entries(item.files ?? {}).map(([fileKey, file]) => ({
      id: fileKey,
      ...file,
      name: fileKey,
    }));

    const sectionFiles = Object.entries(item.sections ?? {}).flatMap(([sectionKey, section]) =>
      Object.entries(section.files ?? {}).map(([fileKey, file]) => ({
        id: `${sectionKey}-${fileKey}`,
        ...file,
        section: { id: sectionKey },
        name: fileKey,
      })),
    );

    const result = removeUndefinedProperties({
      id: item.id,
      title: item.title,
      category: item.category,
      urls: item.urls,
      tags: item.tags,
      sections,
      fields: [...sectionFields, ...fields],
      files: [...sectionFiles, ...files],
    });
    // console.log("mapToFullItem", { input: { fields: item.fields, sections: item.sections }, output: result.fields });
    return result;
  }

  public mapItem(
    item: Omit<FullItem, "vault" | "extractOTP">,
    id: string | undefined,
  ): {
    id: string;
    title: string;
    category: FullItem.CategoryEnum;
    urls: ItemUrls[];
    tags: string[];
    sections: {
      [key: string]: {
        id: string;
        fields: { [key: string]: Omit<FullItemAllOfFields, "section" | "label"> };
        files: { [key: string]: Omit<ItemFile, "section" | "label"> };
      };
    };
    fields: { [key: string]: Omit<FullItemAllOfFields, "section" | "label"> };
    files: { [key: string]: Omit<ItemFile, "section" | "label"> };
  } {
    const fields = item.fields ?? [];
    const sections = item.sections ?? [];
    const files = item.files ?? [];
    const rootFields: [string, FullItemAllOfFields][] = [];
    const rootFiles: [string, ItemFile][] = [];
    for (const field of fields) {
      if (field.value === undefined || (field.section && field.section.id !== "add more")) continue;
      rootFields.push([field.label!, field] as const);
    }
    for (const file of files) {
      if (file.content === undefined || (file.section && file.section.id !== "add more")) continue;
      rootFiles.push([file.name!, file] as const);
    }
    const sectionParts: [string, { id: string; label: string; fields: { [key: string]: FullItemAllOfFields }; files: { [key: string]: ItemFile } }][] = [];
    for (let section of sections) {
      if (section.id === undefined || section.id === "add more") {
        continue;
      }
      const sectionFields = fields.filter((f) => f.section?.id === section.id).map((f) => [f.label!, f] as const);
      const sectionFiles = files.filter((f) => f.section?.id === section.id).map((f) => [f.name!, f] as const);
      sectionParts.push([section.id!, { id: section.id!, label: section.label ?? section.id!, fields: Object.fromEntries(sectionFields), files: Object.fromEntries(sectionFiles) }] as const);
    }

    const result = removeUndefinedProperties({
      id: item.id ?? id!,
      title: item.title!,
      category: item.category!,
      urls: item.urls ?? [],
      tags: item.tags ?? [],
      sections: Object.fromEntries(sectionParts),
      fields: Object.fromEntries(rootFields),
      files: Object.fromEntries(rootFiles),
    });
    return result;
  }
}
