// list-plugins.mjs <node_modules> -- every Pulumi plugin an installed tree will
// ask for, so bake.sh can install them into the image ahead of time.
//
// Prints one line per plugin, de-duplicated and sorted:
//
//   resource <name> <version> [<server>]       -> `pulumi plugin install`
//   parameterized <name> <version> <tf-source> <tf-version>
//                                              -> `pulumi package get-schema`
//
// WHY WALK node_modules AND NOT ASK PULUMI. `pulumi plugin install` with no
// arguments asks the language host for one program's required plugins, and a
// stack's program only names what its own package.json depends on. Most of the
// providers here are reached through components/ instead, so per-stack answers
// miss them, and the engine then downloads them on first use during `up` --
// the very download this image exists to remove. Every package that ships a
// provider says so in its package.json, so reading all of them is complete.
//
// Two ways a package says so:
//
//   * a `pulumi` stanza: { resource: true, name, version, server? }. This is
//     what the language host itself reads.
//   * older packages only carry an install script,
//     `node scripts/install-pulumi-plugin.js resource <name> <version>`.
//
// PARAMETERIZED PROVIDERS. The SDKs under sdks/ are generated from Terraform
// providers through `terraform-provider`: their stanza names that plugin plus a
// `parameterization` whose base64 value is
// {"remote":{"url":"registry.terraform.io/<ns>/<name>","version":"<v>"}}.
// At run time the plugin downloads that Terraform provider into
// ~/.pulumi/dynamic_tf_plugins/<url>/<version>/<os_arch>/. Asking for the
// package's schema with the same two arguments makes it download into the same
// place, which is how bake.sh primes that cache (verified on 0.14.0: the
// directory layout is identical to a live workspace's).
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: list-plugins.mjs <node_modules>");
  process.exit(2);
}

const lines = new Set();
const INSTALL_SCRIPT = /install-pulumi-plugin\.js\s+resource\s+(\S+)\s+v?(\S+)/;

function visitPackage(dir) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return;
  }
  const stanza = pkg.pulumi;
  if (stanza?.resource && stanza.name) {
    const version = String(stanza.version ?? pkg.version).replace(/^v/, "");
    lines.add(["resource", stanza.name, version, stanza.server].filter(Boolean).join(" "));
    if (stanza.parameterization?.value) {
      const { remote } = JSON.parse(Buffer.from(stanza.parameterization.value, "base64").toString("utf8"));
      if (remote?.url && remote?.version) {
        lines.add(["parameterized", stanza.name, version, remote.url, remote.version].join(" "));
      }
    }
    return;
  }
  const script = pkg.scripts?.install ?? pkg.scripts?.postinstall ?? "";
  const match = INSTALL_SCRIPT.exec(script);
  if (match) lines.add(`resource ${match[1]} ${match[2]}`);
}

// Every package directory under a node_modules, including scoped ones and the
// node_modules nested inside packages.
function walk(modules) {
  let entries;
  try {
    entries = fs.readdirSync(modules, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(modules, entry.name);
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith("@")) {
      walk(full);
      continue;
    }
    visitPackage(full);
    walk(path.join(full, "node_modules"));
  }
}

walk(root);
for (const line of [...lines].sort()) console.log(line);
