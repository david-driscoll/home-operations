import { describe, expect, it } from "vitest";
import type { Availability } from "../../shared/types/regionExit";
import { availabilityColor, describeAvailability, describeMover, describePeople, describeRegion, easternDateTime, easternTime, peopleCount } from "../../shared/utils/describe";
import { canonicalRegion, egressMatchesRegion, isConnectedTo } from "../../shared/utils/regions";

describe("describeAvailability", () => {
  it.each<[Availability, string, "success" | "warning" | "error"]>([
    [{ state: "online" }, "Online", "success"],
    [{ state: "degraded", offlineOn: "netbird" }, "Offline on NetBird, Tailscale works", "warning"],
    [{ state: "degraded", offlineOn: "tailscale" }, "Offline on Tailscale, NetBird works", "warning"],
    [{ state: "offline", reason: "tunnel" }, "Offline: not connected to Mullvad", "error"],
    [{ state: "offline", reason: "overlays" }, "Offline: not connected to NetBird or Tailscale", "error"],
    [{ state: "unreachable" }, "Not responding", "error"],
  ])("labels %j %j, coloured %s", (availability, label, color) => {
    expect(describeAvailability("spitfire", availability).label).toBe(label);
    expect(availabilityColor(availability)).toBe(color);
  });

  it("says what still works when it is degraded, and the NetBird wait", () => {
    expect(describeAvailability("soarin", { state: "degraded", offlineOn: "netbird" }).detail).toBe(
      "People on Tailscale can still use soarin. People on NetBird cannot until it reconnects, which takes about 10 minutes after a restart.",
    );
  });
});

describe("the words", () => {
  it("describes regions, people and movers", () => {
    expect(describeRegion({ country: "USA", city: "Dallas TX" })).toBe("Dallas TX, USA");
    expect(describeRegion({ country: "Japan", city: null })).toBe("Japan");
    expect(describeRegion(null)).toBe("unknown");
    expect(peopleCount(1)).toBe("1 person");
    expect(peopleCount(0)).toBe("0 people");
    expect(describePeople("soarin", 1)).toBe("1 person is using soarin right now.");
    expect(describePeople("soarin", 3)).toBe("3 people are using soarin right now.");
    expect(describePeople("soarin", null)).toBe("The picker cannot tell how many people are using soarin.");
    expect(describeMover("Jamie")).toBe("Moved by Jamie");
    expect(describeMover(null)).toBe("Moved by unknown");
    expect(describeMover(undefined)).toBe("Moved by unknown");
  });

  it("shows times in Eastern, whatever the server's zone", () => {
    expect(easternTime("2026-11-07T19:05:00.000Z")).toBe("2:05 PM EST");
    expect(easternDateTime("2026-07-04T16:00:00.000Z")).toBe("Jul 4, 2026, 12:00 PM EDT");
  });
});

describe("canonicalRegion", () => {
  const regions = [
    { country: "UK", cities: ["London"] },
    { country: "USA", cities: ["New York NY"] },
  ];
  it("gives servers.json's spelling for a lowercased region, and title-cases one it does not list", () => {
    expect(canonicalRegion({ country: "usa", city: "new york ny" }, regions)).toEqual({ country: "USA", city: "New York NY" });
    expect(canonicalRegion({ country: "uk", city: null }, regions)).toEqual({ country: "UK", city: null });
    expect(canonicalRegion({ country: "lost land", city: "lost-city" }, regions)).toEqual({ country: "Lost Land", city: "Lost-City" });
  });
});

describe("egressMatchesRegion", () => {
  it.each([
    ["USA", "United States", true],
    ["UK", "United Kingdom", true],
    ["Czech Republic", "Czechia", true],
    ["Turkey", "Türkiye", true],
    ["Netherlands", "The Netherlands", true],
    ["Hong Kong", "Hong Kong (China)", true],
    ["USA", "Canada", false],
  ])("%s and %s: %s", (region, egress, same) => {
    expect(egressMatchesRegion(region, egress)).toBe(same);
  });
});

describe("isConnectedTo", () => {
  const to = { country: "USA", city: "Dallas TX" };
  it("is true once the tunnel is up and traffic leaves from the country, whatever the city", () => {
    expect(isConnectedTo({ tunnel: { up: true }, egress: { country: "United States" } }, to)).toBe(true);
  });
  it.each([
    ["the tunnel is down", { tunnel: { up: false }, egress: { country: "United States" } }],
    ["there is no egress yet", { tunnel: { up: true }, egress: null }],
    ["traffic still leaves from the old country", { tunnel: { up: true }, egress: { country: "Canada" } }],
    ["the agent did not answer", { tunnel: null, egress: null }],
  ])("is false while %s", (_, view) => {
    expect(isConnectedTo(view, to)).toBe(false);
  });
});
