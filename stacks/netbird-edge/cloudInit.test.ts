/**
 * node --test stacks/netbird-edge/cloudInit.test.ts
 *
 * The day-0 cloud-init for the two kinds of netbird-edge VM. OCI keeps its two
 * workarounds (the iptables ACCEPT rules and the memory ballast); Azure needs
 * neither. Both get unattended-upgrades, Docker and the Tailscale join.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { BALLAST_GIB, DEFAULT_REBOOT_TIME, renderCloudInit } from "./cloudInit.ts";

const base = { hostname: "netbird-azure-eus2", tailscaleAuthKey: "tskey-auth-test", tailscaleTag: "tag:netbird-edge" };

function parsed(text: string): { hostname: string; packages: string[]; write_files: { path: string; content: string }[]; runcmd: string[] } {
  assert.ok(text.startsWith("#cloud-config\n"), "cloud-init needs the #cloud-config header");
  return parse(text);
}

describe("renderCloudInit", () => {
  for (const platform of ["oci", "azure"] as const) {
    it(`${platform}: is valid YAML with the common steps`, () => {
      const doc = parsed(renderCloudInit({ ...base, platform }));
      assert.equal(doc.hostname, base.hostname);
      assert.ok(doc.packages.includes("unattended-upgrades"));
      assert.ok(doc.packages.includes("bind9-dnsutils"));
      const reboot = doc.write_files.find(f => f.path === "/etc/apt/apt.conf.d/52unattended-reboot");
      assert.match(reboot?.content ?? "", new RegExp(`Automatic-Reboot-Time "${DEFAULT_REBOOT_TIME}"`));
      const key = doc.write_files.find(f => f.path === "/run/tailscale-authkey");
      assert.equal(key?.content, base.tailscaleAuthKey);
      const cmds = doc.runcmd.join("\n");
      assert.match(cmds, /get\.docker\.com/);
      assert.match(cmds, /tailscale up --auth-key=file:\/run\/tailscale-authkey --hostname=netbird-azure-eus2 --advertise-tags=tag:netbird-edge --ssh/);
      // The key file goes once tailscale has used it.
      assert.match(doc.runcmd.at(-1) ?? "", /rm -f \/run\/tailscale-authkey/);
    });
  }

  it("oci: opens the public ports in iptables and runs the memory ballast", () => {
    const text = renderCloudInit({ ...base, platform: "oci" });
    const doc = parsed(text);
    assert.ok(doc.write_files.some(f => f.path === "/etc/systemd/system/memory-ballast.service"));
    assert.match(text, new RegExp(`Hold ${BALLAST_GIB} GiB`));
    const cmds = doc.runcmd.join("\n");
    assert.match(cmds, /iptables -I INPUT "\$pos" -p tcp -m multiport --dports 80,443/);
    assert.match(cmds, /iptables -I INPUT "\$pos" -p udp -m multiport --dports 443,3478/);
    assert.doesNotMatch(cmds, /iptables -F/);
    // Both before Docker, so Docker's chains are never saved.
    assert.ok(cmds.indexOf("netfilter-persistent save") < cmds.indexOf("get.docker.com"));
    assert.match(cmds, /enable --now memory-ballast\.service/);
  });

  it("azure: no iptables rules and no ballast", () => {
    const text = renderCloudInit({ ...base, platform: "azure" });
    assert.doesNotMatch(text, /iptables/);
    assert.doesNotMatch(text, /netfilter-persistent/);
    assert.doesNotMatch(text, /memory-ballast/);
  });

  it("takes a per-host reboot time and refuses a malformed one", () => {
    const doc = parsed(renderCloudInit({ ...base, platform: "azure", rebootTime: "10:30" }));
    assert.match(doc.write_files[0].content, /Automatic-Reboot-Time "10:30"/);
    assert.throws(() => renderCloudInit({ ...base, platform: "azure", rebootTime: "25:00" }), /not HH:MM/);
    assert.throws(() => renderCloudInit({ ...base, platform: "azure", rebootTime: "9:00" }), /not HH:MM/);
  });
});
