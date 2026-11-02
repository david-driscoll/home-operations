/**
 * Stage the Coder templates the way Pulumi does, for checking them by hand.
 *
 *   node scripts/coder-templates/index.ts [out-dir]
 *
 * Prints one staged directory per line. Each is a complete template: run
 * `terraform init -backend=false && terraform validate` in it, or
 * `coder templates push <name> -d <dir>` to try one against the server under a
 * throwaway name. See kubernetes/apps/coder/coder/templates/README.md.
 */

import * as path from "node:path";
import { listCoderTemplates, stageCoderTemplate } from "../../components/coderTemplates.ts";

const outRoot = process.argv[2] ? path.resolve(process.argv[2]) : undefined;

for (const template of listCoderTemplates()) {
  console.log(stageCoderTemplate({ template, outRoot }));
}
