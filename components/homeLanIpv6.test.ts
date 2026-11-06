/**
 * node --test components/homeLanIpv6.test.ts
 *
 * The Home ULA addresses Technitium is advertised on: they must be fixed,
 * readable, and only ever handed to hosts that are actually on Home.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_ULA_GATEWAY, HOME_ULA_PREFIX, homeUlaAddress, renderHomeUlaUnit, renderIpv6Sysctl } from "./homeLanIpv6.ts";

describe("homeUlaAddress", () => {
  it("writes the IPv4 address as the last four groups of Home's ULA /64", () => {
    assert.equal(homeUlaAddress("10.10.18.4"), "fd04:7815:6227:1:10:10:18:4");
    assert.equal(homeUlaAddress("10.10.216.234"), "fd04:7815:6227:1:10:10:216:234");
  });

  it("never collides with the gateway's address", () => {
    assert.notEqual(homeUlaAddress("10.10.0.1"), HOME_ULA_GATEWAY);
    assert.ok(HOME_ULA_PREFIX.startsWith(HOME_ULA_GATEWAY.replace(/::1$/, "")));
  });

  it("gives nothing to a host off Home, or to something that is not IPv4", () => {
    assert.equal(homeUlaAddress("192.168.1.20"), undefined);
    assert.equal(homeUlaAddress("100.64.1.2"), undefined);
    assert.equal(homeUlaAddress("10.11.0.5"), undefined);
    assert.equal(homeUlaAddress("10.10.300.1"), undefined);
    assert.equal(homeUlaAddress("fd00::1"), undefined);
    assert.equal(homeUlaAddress(undefined), undefined);
  });

  it("tolerates the trailing whitespace hostname -I leaves", () => {
    assert.equal(homeUlaAddress("10.10.73.24 \n"), "fd04:7815:6227:1:10:10:73:24");
  });
});

describe("renderIpv6Sysctl", () => {
  it("accepts router advertisements even though the host forwards", () => {
    assert.match(renderIpv6Sysctl(), /^net\.ipv6\.conf\.eth0\.accept_ra = 2$/m);
    assert.match(renderIpv6Sysctl(), /^net\.ipv6\.conf\.eth0\.disable_ipv6 = 0$/m);
  });
});

describe("renderHomeUlaUnit", () => {
  it("adds the address idempotently at boot", () => {
    const unit = renderHomeUlaUnit("fd04:7815:6227:1:10:10:18:4");
    assert.match(unit, /^ExecStart=\/sbin\/ip -6 addr replace fd04:7815:6227:1:10:10:18:4\/64 dev eth0$/m);
    assert.match(unit, /^RemainAfterExit=yes$/m);
    assert.match(unit, /^WantedBy=multi-user\.target$/m);
  });

  it("does nothing on a host off Home", () => {
    assert.match(renderHomeUlaUnit(undefined), /^ExecStart=\/bin\/true$/m);
  });

  it("refuses an address outside Home's range", () => {
    assert.throws(() => renderHomeUlaUnit("fd00::53"), /not in/);
  });
});
