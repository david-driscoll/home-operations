/** The overview: every region exit's view, in order. One that does not answer is `unreachable`; the rest still show. */
export default defineEventHandler(async event => {
  setResponseHeader(event, "Cache-Control", "no-store");
  return { checkedAt: new Date().toISOString(), regionExits: await collectOverview(agentConfig(event), globalThis.fetch) };
});
