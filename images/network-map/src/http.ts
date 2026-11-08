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
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
    if (!response.ok) throw new HttpError(`GET ${path}: HTTP ${response.status}${body ? ` ${body.slice(0, 200)}` : ""}`, response.status);
    return body;
  };
  return {
    getJson: async <T>(path: string) => JSON.parse(await get(path, "application/json")) as T,
    getText: (path, accept) => get(path, accept),
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
