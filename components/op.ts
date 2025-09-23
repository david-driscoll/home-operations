import { FullItem, OPConnect } from "@1password/connect";

const client = new OPConnect({
  serverURL: process.env.CONNECT_HOST!,
  token: process.env.CONNECT_TOKEN!,
  keepAlive: true,
});

let vaultUuid: string | undefined;

export const op = {
  async getItemByTitle(itemId: string) {
    if (!vaultUuid) {
      const vaults = await client.listVaults();
      const personalVault = vaults.find((v) => v.name === "Eris");
      if (!personalVault) {
        throw new Error("No vault found in 1Password Connect");
      }
      vaultUuid = personalVault.id!;
    }
    const item = await client.getItemByTitle(vaultUuid, itemId);
    item.sections = item.sections || [];
    item.fields = item.fields || [];
    item.files = item.files || [];
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
        item.sections.map((s) => {
          return [s.label!, s];
        })
      ),
      fields: Object.fromEntries<NonNullable<FullItem["fields"]>[number]>(
        item.fields.map((f) => {
          return [f.label!, f];
        })
      ),
      files: Object.fromEntries<NonNullable<FullItem["files"]>[number]>(
        item.files.map((f) => {
          return [f.name!, f];
        })
      ),
    };
  },
};
