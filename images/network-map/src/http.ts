/**
 * The one HTTP seam every source goes through. A source takes an `ApiClient`
 * and never calls fetch itself, so its tests hand it `fixtureClient` and run
 * with no network.
 */

export interface ApiClient {
  /** GET `path` (relative to the client's base URL) and parse JSON. Throws on a non-2xx. */
  getJson<T>(path: string): Promise<T>;
  /** GET `path` and return the body as text, with an explicit Accept. */
  getText(path: string, accept: string): Promise<string>;
}

export class HttpError extends Error {
  readonly status: number;
  /** The server's `Retry-After`, in milliseconds, when it sent one. */
  readonly retryAfterMs?: number;
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** `Retry-After` as milliseconds: delta-seconds or an HTTP-date. Undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, nowMs: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}

export interface HttpClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** For tests of the client itself; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Joins base and path without doubling or dropping the slash. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function httpClient(options: HttpClientOptions): ApiClient {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const get = async (path: string, accept: string): Promise<string> => {
    const url = joinUrl(options.baseUrl, path);
    const response = await doFetch(url, { headers: { Accept: accept, ...options.headers }, signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.text();
    // The path, never the URL: the host can be a private name, and a header never is logged.
    if (!response.ok) throw new HttpError(`GET ${path}: HTTP ${response.status}${body ? ` ${body.slice(0, 200)}` : ""}`, response.status, parseRetryAfter(response.headers.get("retry-after")));
    return body;
  };
  return {
    getJson: async <T>(path: string) => JSON.parse(await get(path, "application/json")) as T,
    getText: (path, accept) => get(path, accept),
  };
}

/** Statuses that mean "too busy, ask again later": API Priority and Fairness answers 429. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 503]);

export interface RetryOptions {
  /** Tries in all, the first included. */
  attempts?: number;
  /** The first backoff; each later one doubles. */
  baseDelayMs?: number;
  /** No single wait is longer, whatever `Retry-After` asks. */
  maxDelayMs?: number;
  /** For tests: the wait. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY: Required<Omit<RetryOptions, "sleep">> = { attempts: 4, baseDelayMs: 1_000, maxDelayMs: 20_000 };

const realSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Wraps a client so a 429 or 503 is retried: up to `attempts` tries, waiting
 * the server's `Retry-After` when it sent one, else `baseDelayMs` doubling,
 * never longer than `maxDelayMs`. Any other error, and the last try's, is
 * thrown as-is. Opt-in per source, so a source whose API must not be re-asked
 * keeps failing fast.
 */
export function withRetry(client: ApiClient, options: RetryOptions = {}): ApiClient {
  const { attempts, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY, ...options };
  const sleep = options.sleep ?? realSleep;
  const retrying = async <T>(call: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await call();
      } catch (error) {
        if (attempt >= attempts || !(error instanceof HttpError) || !RETRYABLE_STATUSES.has(error.status)) throw error;
        await sleep(Math.min(maxDelayMs, error.retryAfterMs ?? baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  };
  return {
    getJson: <T>(path: string) => retrying(() => client.getJson<T>(path)),
    getText: (path, accept) => retrying(() => client.getText(path, accept)),
  };
}

/**
 * A client that answers from a path -> body map. A missing path is a 404,
 * an `Error` value is thrown as-is, and a string body is returned as text.
 */
export function fixtureClient(fixtures: Record<string, unknown>): ApiClient & { calls: string[] } {
  const calls: string[] = [];
  const answer = (path: string) => {
    calls.push(path);
    if (!(path in fixtures)) throw new HttpError(`GET ${path}: HTTP 404`, 404);
    const value = fixtures[path];
    if (value instanceof Error) throw value;
    return value;
  };
  return {
    calls,
    getJson: async <T>(path: string) => {
      const value = answer(path);
      return (typeof value === "string" ? JSON.parse(value) : structuredClone(value)) as T;
    },
    getText: async (path: string) => {
      const value = answer(path);
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}
