import { op } from "./op.ts";
import { readFile } from "fs/promises";
import type { Client } from "../types/tailscale.ts";
import { OpenAPIClientAxios } from "openapi-client-axios";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import axios from "axios";
const __filename = fileURLToPath(import.meta.url);
console.log({ url: import.meta.url, __filename: __filename });
const __dirname = dirname(__filename);

const tailscaleCredential = await op.getItemByTitle("Tailscale Terraform OAuth Client");
const specFilename = path.join(__dirname, "tailscale.json");
const spec = await readFile(specFilename, "utf-8");

export const client = new OpenAPIClientAxios({
  definition: JSON.parse(spec),
  axiosConfigDefaults: {
    headers: {
      // Authorization: `Bearer ${tailscaleCredential.fields["credential"].value}`,
    },
  },
});
export const tailscale = await client.init<Client>();

await axios
  .post(
    "https://api.tailscale.com/api/v2/oauth/token",
    axios.toFormData({
      client_id: tailscaleCredential.fields["username"].value!,
      client_secret: tailscaleCredential.fields["credential"].value!,
      grant_type: "client_credentials",
    })
  )
  .then((response) => {
    tailscale.defaults.headers["Authorization"] = `Bearer ${response.data.access_token}`;
  });
