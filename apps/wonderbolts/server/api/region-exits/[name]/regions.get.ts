/** The countries and cities Mullvad offers, from the region exit's own servers.json. */
export default defineEventHandler(async event => {
  const config = agentConfig(event);
  const name = getRouterParam(event, "name") ?? "";
  if (!agentUrl(config, name)) throw createError({ statusCode: 404, statusMessage: `No region exit called ${name}` });
  return fetchRegions(config, name, globalThis.fetch);
});
