import { describe, expect, it } from "vitest";
import { groupsFrom, headerText, viewerFrom } from "../../server/utils/viewer";

const headers = (values: Record<string, string>) => (name: string) => values[name];

describe("viewerFrom", () => {
  it.each([
    ["family", "family|users", true],
    ["admins", "admins", true],
    ["friends", "friends|users", false],
    ["media-managers", "media-managers", false],
    ["no group", "", false],
  ])("lets %s move a region exit: %s -> %s", (_, groups, canMove) => {
    expect(viewerFrom(headers({ "x-authentik-username": "jamie", "x-authentik-groups": groups })).canMove).toBe(canMove);
  });

  it("lets nobody move without a username, whatever the groups say", () => {
    expect(viewerFrom(headers({ "x-authentik-groups": "admins" })).canMove).toBe(false);
  });

  it("matches group names exactly, not by substring", () => {
    expect(viewerFrom(headers({ "x-authentik-username": "pat", "x-authentik-groups": "not-family|familyish" })).canMove).toBe(false);
  });

  it("uses the display name, falling back to the username", () => {
    expect(viewerFrom(headers({ "x-authentik-username": "jamie", "x-authentik-name": "Jamie Doe" }))).toEqual({ username: "jamie", name: "Jamie Doe", canMove: false });
    expect(viewerFrom(headers({ "x-authentik-username": "jamie", "x-authentik-name": "  " })).name).toBe("jamie");
  });

  it("takes the mover groups from config", () => {
    expect(viewerFrom(headers({ "x-authentik-username": "pat", "x-authentik-groups": "friends" }), ["friends"]).canMove).toBe(true);
  });
});

describe("groupsFrom", () => {
  it("splits Authentik's pipe-separated list", () => {
    expect(groupsFrom("family| users |")).toEqual(["family", "users"]);
    expect(groupsFrom(undefined)).toEqual([]);
  });
});

describe("headerText", () => {
  it("decodes UTF-8 that Node read as latin1", () => {
    expect(headerText(Buffer.from("Zoë 🦄", "utf8").toString("latin1"))).toBe("Zoë 🦄");
  });

  it("keeps plain ASCII as it is", () => {
    expect(headerText("Jamie Doe")).toBe("Jamie Doe");
  });

  it("keeps a latin1 value that is not UTF-8 as it is", () => {
    expect(headerText("café")).toBe("café");
  });

  it("keeps text that is already wider than latin1", () => {
    expect(headerText("Zoë 🦄")).toBe("Zoë 🦄");
  });

  it("is null for nothing", () => {
    expect(headerText(undefined)).toBeNull();
    expect(headerText("   ")).toBeNull();
  });
});
