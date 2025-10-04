import * as Unifi from "node-unifi";
import { OPClient } from "./op.ts";

const op = new OPClient();
const unifiCredential = await op.getItemByTitle("Unifi Api Key Eris Cluster");
export const controller = new Unifi.Controller({
  host: unifiCredential.fields?.hostname?.value,
  port: 443,
  sslverify: true,
});
