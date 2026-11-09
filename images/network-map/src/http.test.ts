/**
 * node --test images/network-map/src/http.test.ts
 *
 * The retry wrapper and `Retry-After` parsing. No network: a stub fetch and
 * an injected sleep.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ApiClient, HttpError, httpClient, parseRetryAfter, withRetry } from "./http.ts";

/** A client whose getJson throws `failures` errors, then answers `{ ok: true }`. */
function failing(failures: Error[]): ApiClient & { calls: number } {
  const queue = [...failures];
  const client = {
    calls: 0,
    getJson: async <T>() => {
      client.calls++;
      const next = queue.shift();
      if (next) throw next;
      return { ok: true } as T;
    },
    getText: async () => "",
  };
  return client;
}

describe("parseRetryAfter", () => {
  it("reads delta-seconds and an HTTP-date, and ignores junk", () => {
    assert.equal(parseRetryAfter("2"), 2_000);
    assert.equal(parseRetryAfter(" 0 "), 0);
    assert.equal(parseRetryAfter("Sun, 08 Nov 2026 12:00:05 GMT", Date.parse("2026-11-08T12:00:00Z")), 5_000);
    assert.equal(parseRetryAfter("Sun, 08 Nov 2026 11:00:00 GMT", Date.parse("2026-11-08T12:00:00Z")), 0, "a date in the past means now");
    assert.equal(parseRetryAfter("soon"), undefined);
    assert.equal(parseRetryAfter(null), undefined);
  });

  it("is carried on the HttpError from a real response", async () => {
    const fetchImpl = (async () => new Response("slow down", { status: 429, headers: { "Retry-After": "7" } })) as typeof fetch;
    const error = await httpClient({ baseUrl: "https://api.example.test", fetchImpl })
      .getJson("/x")
      .catch((e: unknown) => e);
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterMs, 7_000);
  });
});

describe("withRetry", () => {
  it("retries 429 and 503 with doubling backoff, then returns the answer", async () => {
    const waits: number[] = [];
    const inner = failing([new HttpError("429", 429), new HttpError("503", 503), new HttpError("429", 429)]);
    const value = await withRetry(inner, { sleep: async ms => void waits.push(ms) }).getJson("/x");
    assert.deepEqual(value, { ok: true });
    assert.deepEqual(waits, [1_000, 2_000, 4_000]);
    assert.equal(inner.calls, 4);
  });

  it("caps a long Retry-After at maxDelayMs", async () => {
    const waits: number[] = [];
    await withRetry(failing([new HttpError("429", 429, 600_000)]), { maxDelayMs: 5_000, sleep: async ms => void waits.push(ms) }).getJson("/x");
    assert.deepEqual(waits, [5_000]);
  });

  it("throws the last error after `attempts` tries", async () => {
    const inner = failing(Array.from({ length: 10 }, () => new HttpError("GET /x: HTTP 429", 429)));
    await assert.rejects(withRetry(inner, { attempts: 2, sleep: async () => {} }).getJson("/x"), /HTTP 429/);
    assert.equal(inner.calls, 2);
  });

  it("does not retry other errors", async () => {
    for (const error of [new HttpError("GET /x: HTTP 403", 403), new HttpError("GET /x: HTTP 500", 500), new Error("socket hang up")]) {
      const inner = failing([error]);
      await assert.rejects(withRetry(inner, { sleep: async () => assert.fail("no wait") }).getJson("/x"), error);
      assert.equal(inner.calls, 1);
    }
  });
});
