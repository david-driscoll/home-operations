/**
 * Moving a region exit. Only family and admins may (ADR 0006): a friend gets
 * 403 here whatever the page shows. The agent then decides whether the move
 * needs confirming (409 with people on it) and makes it; its answer is passed
 * through as it is, status included.
 *
 * JSON only. A cross-site form cannot send application/json without a CORS
 * preflight this app never answers, so that and Sec-Fetch-Site keep another
 * site from moving a region exit with the person's Authentik session.
 */
import type { MoveRequest } from "../../../../shared/types/regionExit";

function moveFrom(body: unknown): MoveRequest | string {
  const move = body as { country?: unknown; city?: unknown; confirm?: unknown } | null;
  if (!move || typeof move !== "object") return "send a JSON object";
  if (typeof move.country !== "string" || move.country.trim() === "") return "pick a country";
  if (move.city !== undefined && move.city !== null && typeof move.city !== "string") return "city must be text";
  if (move.confirm !== undefined && typeof move.confirm !== "boolean") return "confirm must be true or false";
  const city = typeof move.city === "string" && move.city.trim() !== "" ? move.city.trim() : null;
  return { country: move.country.trim(), city, confirm: move.confirm === true };
}

export default defineEventHandler(async event => {
  const config = agentConfig(event);
  const name = getRouterParam(event, "name") ?? "";
  if (!agentUrl(config, name)) throw createError({ statusCode: 404, statusMessage: `No region exit called ${name}` });
  if (getRequestHeader(event, "sec-fetch-site") === "cross-site") throw createError({ statusCode: 403, statusMessage: "Moves come from the region picker only" });
  if (!(getRequestHeader(event, "content-type") ?? "").includes("application/json")) throw createError({ statusCode: 415, statusMessage: "Send JSON" });

  const viewer = requestViewer(event);
  if (!viewer.canMove) {
    console.log(JSON.stringify({ msg: "move refused", regionExit: name, username: viewer.username }));
    throw createError({ statusCode: 403, statusMessage: "Only family can move region exits" });
  }

  const move = moveFrom(await readBody(event).catch(() => null));
  if (typeof move === "string") throw createError({ statusCode: 400, statusMessage: move });

  const reply = await postMove(config, name, move, viewer.name ?? viewer.username, globalThis.fetch);
  console.log(
    JSON.stringify({
      msg: reply.status === 200 ? "region exit moved" : "move not made",
      regionExit: name,
      region: { country: move.country, city: move.city },
      confirm: move.confirm,
      username: viewer.username,
      name: viewer.name,
      status: reply.status,
    }),
  );
  setResponseStatus(event, reply.status);
  return reply.body;
});
