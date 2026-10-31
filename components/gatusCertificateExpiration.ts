import type { GatusDefinition } from "@openapi/application-definition.js";

/**
 * Every HTTPS endpoint Gatus watches also fails once its certificate is inside
 * this window. Let's Encrypt renews at about 30 days left, so a week to go means
 * renewal has already been failing for three -- TrueNAS's own ACME renewal did
 * exactly that, and its certificate lapsed with every check still green because
 * nothing looked at it. A week also stays clear of Let's Encrypt's shorter
 * lifetimes, which renew much closer to expiry.
 */
export const CERTIFICATE_EXPIRATION_CONDITION = "[CERTIFICATE_EXPIRATION] > 168h";

/**
 * Adds CERTIFICATE_EXPIRATION_CONDITION to an HTTPS endpoint. Left alone:
 * - anything that is not https:// (DNS, ICMP, TCP, heartbeats);
 * - an endpoint that already sets its own [CERTIFICATE_EXPIRATION] threshold;
 * - an endpoint with no conditions, which Gatus rejects -- a lone certificate
 *   check would make it load and go green without testing the service at all.
 *
 * Kept import-free (the type import is erased) so tests load it without
 * helpers.ts and its module graph.
 */
export function withCertificateExpiration(endpoint: GatusDefinition): GatusDefinition {
  const conditions = endpoint.conditions;
  if (!endpoint.url?.toLowerCase().startsWith("https://") || !conditions?.length) return endpoint;
  if (conditions.some(condition => condition.includes("[CERTIFICATE_EXPIRATION]"))) return endpoint;
  return { ...endpoint, conditions: [...conditions, CERTIFICATE_EXPIRATION_CONDITION] };
}
