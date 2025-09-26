import { op } from "./op.ts";
import { readFile } from "fs/promises";
import type { Client } from "../types/tailscale.ts";
import { OpenAPIClientAxios } from "openapi-client-axios";

const tailscaleCredential = await op.getItemByTitle("Tailscale Terraform OAuth Client");

const spec = await readFile("./specs/tailscale.json", "utf-8");

export const client = new OpenAPIClientAxios({
  definition: spec,
  axiosConfigDefaults: {
    headers: {
      Authorization: `Bearer ${tailscaleCredential.fields["credential"].value}`,
    },
  },
});
export const tailscale = await client.init<Client>();
