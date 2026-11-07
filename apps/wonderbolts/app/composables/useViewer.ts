import type { Viewer } from "#shared/types/regionExit";

/** The forward-auth headers the server reads the viewer from (server/utils/viewer.ts). */
const IDENTITY_HEADERS = ["x-authentik-username", "x-authentik-name", "x-authentik-groups"];

/**
 * Who is looking. During server rendering the page's own request carries the
 * forward-auth headers, so they are handed to the internal call; in the
 * browser, Traefik adds them to that call itself.
 */
export function useViewer() {
  const forwarded = Object.fromEntries(Object.entries(useRequestHeaders(IDENTITY_HEADERS)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return useFetch<Viewer>("/api/viewer", {
    key: "viewer",
    headers: forwarded,
    default: (): Viewer => ({ username: null, name: null, canMove: false }),
  });
}
