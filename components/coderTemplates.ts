/**
 * Assembling a Coder template from the shared files it is built on.
 *
 * A Coder template is ONE directory, uploaded as a tarball: Terraform cannot
 * reach a module or a file outside it, and a symlink is uploaded as a symlink
 * and dangles on the other side. So the templates under
 * `kubernetes/apps/coder/coder/templates` are not uploadable as they sit --
 * each one holds only what makes it different, and the rest is shared:
 *
 *   templates/
 *     shared/       root-level files every template gets (providers, template
 *                   variables, the `module "workspace"` call)
 *     modules/      local Terraform modules every template can call
 *     <template>/   the template's own files
 *
 * `stageCoderTemplate` copies the three into one directory, which is what gets
 * uploaded. That directory is build output: never edit it, never commit it.
 *
 * No Pulumi import in this file on purpose. `scripts/coder-templates` stages
 * the same way to run `terraform validate`, and it has no Pulumi runtime.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** The templates' home in the repository. */
export const CODER_TEMPLATES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../kubernetes/apps/coder/coder/templates");

/** Directories under the root that are inputs to every template rather than templates themselves. */
const SHARED_DIR = "shared";
const MODULES_DIR = "modules";

/**
 * Left behind by a `terraform init` run in place. Uploading them would ship a
 * provider cache, or somebody's state, to the Coder server.
 */
const EXCLUDED = new Set([".terraform", ".terraform.lock.hcl", "terraform.tfstate", "terraform.tfstate.backup"]);

const copyFilter = (source: string) => !EXCLUDED.has(path.basename(source));

/** Every directory under the root that is a template. */
export function listCoderTemplates(root: string = CODER_TEMPLATES_ROOT): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== SHARED_DIR && entry.name !== MODULES_DIR)
    .map(entry => entry.name)
    .sort();
}

/**
 * Where staged templates go by default. Under the system temp directory and
 * the SAME path on every run: the Coder provider records the directory it
 * uploaded from, and a path that moved between runs would read as a change.
 */
export function defaultCoderTemplateStagingRoot(): string {
  return path.join(os.tmpdir(), "home-operations-coder-templates");
}

export interface StageCoderTemplateArgs {
  /** Directory name under the templates root, e.g. `repository`. */
  template: string;
  /** Where to build it. Defaults to `defaultCoderTemplateStagingRoot()`. */
  outRoot?: string;
  /** The templates root. Defaults to the one in this repository. */
  root?: string;
}

/**
 * Build one uploadable template directory and return its path.
 *
 * The result is rebuilt from nothing every time, so a file deleted from the
 * repository is deleted from the next upload too.
 */
export function stageCoderTemplate(args: StageCoderTemplateArgs): string {
  const root = args.root ?? CODER_TEMPLATES_ROOT;
  const source = path.join(root, args.template);
  const shared = path.join(root, SHARED_DIR);
  const modules = path.join(root, MODULES_DIR);
  const out = path.join(args.outRoot ?? defaultCoderTemplateStagingRoot(), args.template);

  if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Coder template "${args.template}" not found at ${source}. Templates: ${listCoderTemplates(root).join(", ")}.`);
  }

  // A template that defined its own providers.tf would silently replace the
  // shared one for itself alone, which is exactly the drift the shared files
  // exist to prevent. Refuse instead of picking a winner.
  const sharedNames = fs.readdirSync(shared);
  const collisions = fs.readdirSync(source).filter(name => sharedNames.includes(name) || name === MODULES_DIR);
  if (collisions.length > 0) {
    throw new Error(`Coder template "${args.template}" has files that collide with ${SHARED_DIR}/ or ${MODULES_DIR}/: ${collisions.join(", ")}. Rename them.`);
  }

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(shared, out, { recursive: true, filter: copyFilter });
  fs.cpSync(source, out, { recursive: true, filter: copyFilter });
  fs.cpSync(modules, path.join(out, MODULES_DIR), { recursive: true, filter: copyFilter });

  return out;
}
