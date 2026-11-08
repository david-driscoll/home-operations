import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exitCode } from "./exit.ts";

describe("exitCode", () => {
  it("is 0 when every source succeeded", () => {
    assert.equal(exitCode([{ status: "ok" }, { status: "ok" }]), 0);
  });
  it("is 0 when one source failed and the rest succeeded", () => {
    assert.equal(exitCode([{ status: "ok" }, { status: "failed" }, { status: "partial" }]), 0);
  });
  it("is 1 only when every source failed", () => {
    assert.equal(exitCode([{ status: "failed" }, { status: "failed" }]), 1);
  });
  it("is 0 for partial-only runs, which still wrote data", () => {
    assert.equal(exitCode([{ status: "partial" }, { status: "failed" }]), 0);
  });
});
