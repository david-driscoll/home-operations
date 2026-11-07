/**
 * The region picker (GLOSSARY.md): every region exit's region and
 * availability, and moving one. docs/plans/wonderbolts-nuxt.md, ADR 0006.
 *
 * Runtime config is overridden per deployment by NUXT_* env (the HelmRelease
 * in kubernetes/apps/netbird-system/wonderbolts), never baked into the image.
 */
export default defineNuxtConfig({
  compatibilityDate: "2026-11-01",
  modules: ["@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  devtools: { enabled: false },
  telemetry: false,
  app: {
    head: {
      htmlAttrs: { lang: "en" },
      title: "Region exits",
      meta: [{ name: "robots", content: "noindex" }],
    },
  },
  // System fonts: nothing fetched from a font CDN at build or in the browser.
  ui: { fonts: false },
  // Icons come from the bundled @iconify-json/lucide, never the Iconify API.
  icon: { provider: "server", fallbackToApi: false, serverBundle: { collections: ["lucide"] } },
  runtimeConfig: {
    /** NUXT_REGION_EXITS: every region exit, in the overview's order. */
    regionExits: "spitfire,soarin,fleetfoot,misty-fly,high-winds",
    /** NUXT_AGENT_URL_TEMPLATE: a region exit's agent, `{name}` for the region exit. */
    agentUrlTemplate: "http://region-exits-{name}.netbird-system.svc:8080",
    /** NUXT_MOVER_GROUPS: the Authentik groups that may move a region exit. */
    moverGroups: "family,admins",
    public: {
      /** NUXT_PUBLIC_QUICK_COUNTRIES: one-click moves, in servers.json's names. */
      quickCountries: "USA,Canada,UK",
    },
  },
  nitro: { preset: "node-server" },
});
