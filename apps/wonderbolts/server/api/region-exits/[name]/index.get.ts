/** One region exit's view, its region in servers.json's spelling. 404 for a name that is not a region exit. */
export default defineEventHandler(async event => {
  const config = agentConfig(event);
  const name = getRouterParam(event, "name") ?? "";
  if (!agentUrl(config, name)) throw createError({ statusCode: 404, statusMessage: `No region exit called ${name}` });
  setResponseHeader(event, "Cache-Control", "no-store");
  const { view } = await fetchPage(config, name, globalThis.fetch);
  return { checkedAt: new Date().toISOString(), view };
});
