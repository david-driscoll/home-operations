import { FullItem, OPConnect } from "@1password/connect";
import { removeUndefinedProperties } from "./helpers.ts";
import { FullItemAllOfFields } from "@1password/connect/dist/model/fullItemAllOfFields.js";
import { ItemFile } from "@1password/connect/dist/model/itemFile.js";
import { zipmap } from "@pulumi/std/zipmap.js";
import { FullItemAllOfSections, ItemUrls } from "@1password/connect/dist/model/models.js";

export interface OPClientItemFields {
  [key: string]: FullItemAllOfFields;
}

export interface OPClientItemFiles {
  [key: string]: ItemFile;
}

export interface OPClientItemSections {
  [key: string]: { id: string; label: string; fields: OPClientItemFields; files: OPClientItemFiles };
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
    return this.mapItem(await this.client.createItem(vaultUuid, this.mapToFullItem(vaultUuid, item)), undefined);
  }

  public async updateItem(id: string, item: OPClientItemInput) {
    const vaultUuid = await this.getVaultUuid("Eris");
    return this.mapItem(await this.client.updateItem(vaultUuid, { id, ...this.mapToFullItem(vaultUuid, item) } as any), id);
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

  private mapToFullItem(vaultId: string, item: OPClientItemInput & { id?: string }): FullItem {
    const sections = Object.entries(item.sections ?? [])
      .map(([key, s]) => ({ id: key, label: s.label }))
      .map(removeUndefinedProperties);
    const fields = [
      ...Object.entries(item.fields ?? []).map(([fieldKey, field]) => ({
        id: fieldKey,
        ...field,
      })),
      ...Object.entries(item.sections ?? []).flatMap(([sectionKey, s]) =>
        Object.entries(s.fields ?? []).map(([fieldKey, field]) => ({
          id: `${sectionKey}-${fieldKey}`,
          ...field,
        }))
      ),
    ]
      // .map((item) => {
      //   delete item.id;
      //   return item;
      // })
      .map(removeUndefinedProperties);
    const files = [...Object.values(item.files ?? []), ...Object.values(item.sections ?? []).flatMap((s) => Object.values(s.files ?? []))]
      // .map((item) => {
      //   delete item.id;
      //   return item;
      // })
      .map(removeUndefinedProperties);
    const result = {
      id: item.id,
      vault: { id: vaultId },
      title: item.title,
      category: item.category,
      urls: item.urls,
      tags: item.tags,
      sections,
      fields,
      files,
    };
    return result as any;
  }

  public mapItem(
    item: FullItem,
    id: string | undefined
  ): {
    id: string;
    title: string;
    category: FullItem.CategoryEnum;
    urls: ItemUrls[];
    tags: string[];
    sections: { [key: string]: { id: string; label: string; fields: { [key: string]: FullItemAllOfFields }; files: { [key: string]: ItemFile } } };
    fields: { [key: string]: FullItemAllOfFields };
    files: { [key: string]: ItemFile };
  } {
    const fields = item.fields ?? [];
    const sections = item.sections ?? [];
    const files = item.files ?? [];
    const rootFields: [string, FullItemAllOfFields][] = [];
    const rootFiles: [string, ItemFile][] = [];
    for (const field of fields) {
      if (field.value === undefined) {
        continue;
      }
      if (!field.section || !field.section.id) rootFields.push([field.label!, removeUndefinedProperties(field)] as const);
    }
    for (const file of files) {
      if (file.name === undefined) {
        continue;
      }
      if (!file.section || !file.section.id) rootFiles.push([file.name!, removeUndefinedProperties(file)] as const);
    }
    const sectionParts: [string, { id: string; label: string; fields: { [key: string]: FullItemAllOfFields }; files: { [key: string]: ItemFile } }][] = [];
    for (let section of sections) {
      if (section.id === undefined) {
        continue;
      }
      section = removeUndefinedProperties(section);
      const sectionFields = fields.filter((f) => f.section?.id === section.id).map((f) => [f.label!, removeUndefinedProperties(f)] as const);
      const sectionFiles = files.filter((f) => f.section?.id === section.id).map((f) => [f.name!, removeUndefinedProperties(f)] as const);
      sectionParts.push([section.id!, { id: section.id!, label: section.label ?? section.id!, fields: Object.fromEntries(sectionFields), files: Object.fromEntries(sectionFiles) }] as const);
    }

    item = removeUndefinedProperties(item);

    return {
      id: item.id ?? id!,
      title: item.title!,
      category: item.category!,
      urls: item.urls ?? [],
      tags: item.tags ?? [],
      sections: Object.fromEntries(sectionParts),
      fields: Object.fromEntries(rootFields),
      files: Object.fromEntries(rootFiles),
    };
  }
}
