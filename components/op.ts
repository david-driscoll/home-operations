import { FullItem, OPConnect } from "@1password/connect";

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

  public async createItem(item: Omit<FullItem, "id" | "vault" | "createdAt" | "updatedAt" | "trashed" | "version" | "lastEditedBy" | "extractOTP">) {
    const vaultUuid = await this.getVaultUuid("Eris");
    return this.client.createItem(vaultUuid, item as any);
  }

  public async updateItem(id: string, item: Omit<FullItem, "vault" | "createdAt" | "updatedAt" | "trashed" | "version" | "lastEditedBy" | "extractOTP">) {
    const vaultUuid = await this.getVaultUuid("Eris");
    return this.client.updateItem(vaultUuid, { id, ...item } as any);
  }

  public async deleteItem(id: string) {
    const vaultUuid = await this.getVaultUuid("Eris");
    return this.client.deleteItem(vaultUuid, id);
  }

  public async getItemById(itemId: string) {
    const vaultUuid = await this.getVaultUuid("Eris");
    return this.client.getItemById(vaultUuid, itemId);
  }

  public async getItemByTitle(itemId: string) {
    const vaultUuid = await this.getVaultUuid("Eris");
    const item = await this.client.getItemByTitle(vaultUuid, itemId);
    return {
      id: item.id!,
      title: item.title!,
      vault: item.vault!,
      category: item.category!,
      urls: item.urls || [],
      favorite: item.favorite || false,
      tags: item.tags || [],
      version: item.version || 0,
      trashed: item.trashed || false,
      createdAt: item.createdAt || "",
      updatedAt: item.updatedAt || "",
      lastEditedBy: item.lastEditedBy || "",
      sections: Object.fromEntries<NonNullable<FullItem["sections"]>[number]>(
        item.sections?.map((s) => {
          return [s.label!, s];
        }) ?? []
      ),
      fields: Object.fromEntries<NonNullable<FullItem["fields"]>[number]>(
        item.fields?.map((f) => {
          return [f.label!, f];
        }) ?? []
      ),
      files: Object.fromEntries<NonNullable<FullItem["files"]>[number]>(
        item.files?.map((f) => {
          return [f.name!, f];
        }) ?? []
      ),
    };
  }
}
