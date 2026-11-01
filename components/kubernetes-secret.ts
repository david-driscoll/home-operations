import { readFile } from "node:fs/promises";
import { request } from "node:https";

const SERVICE_ACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";
const REQUEST_TIMEOUT_MS = 10_000;

export interface TlsSecret {
  certificate: string;
  key: string;
}

/** The `tls.crt` / `tls.key` pair of a `kubernetes.io/tls` Secret, base64-decoded. */
export function decodeTlsSecret(secret: { data?: Record<string, string> }): TlsSecret | undefined {
  const certificate = secret.data?.["tls.crt"];
  const key = secret.data?.["tls.key"];
  if (!certificate || !key) return undefined;
  return {
    certificate: Buffer.from(certificate, "base64").toString("utf8"),
    key: Buffer.from(key, "base64").toString("utf8"),
  };
}

/**
 * Reads one `kubernetes.io/tls` Secret from the cluster this process runs in, as the pod's own
 * service account, in the pod's own namespace.
 *
 * Deliberately a plain REST call rather than `k8s.core.v1.Secret.get`. A Pulumi resource read
 * that fails aborts the whole update, and the caller (components/globals.ts) must be able to
 * degrade to "no certificate" instead — a laptop preview, or a Secret that is not issued yet,
 * must never stall Proxmox host management. Throws on anything unexpected; the caller decides
 * what that means.
 */
export async function readClusterTlsSecret(name: string): Promise<TlsSecret> {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  if (!host) throw new Error("KUBERNETES_SERVICE_HOST is not set, so this is not running inside a cluster");
  const port = process.env.KUBERNETES_SERVICE_PORT ?? "443";

  const [token, namespace, ca] = await Promise.all([readFile(`${SERVICE_ACCOUNT_DIR}/token`, "utf8"), readFile(`${SERVICE_ACCOUNT_DIR}/namespace`, "utf8"), readFile(`${SERVICE_ACCOUNT_DIR}/ca.crt`)]);

  const body = await new Promise<string>((resolve, reject) => {
    const req = request(
      {
        host,
        port,
        path: `/api/v1/namespaces/${encodeURIComponent(namespace.trim())}/secrets/${encodeURIComponent(name)}`,
        method: "GET",
        ca,
        headers: { Authorization: `Bearer ${token.trim()}`, Accept: "application/json" },
        timeout: REQUEST_TIMEOUT_MS,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode === 200) resolve(text);
          else reject(new Error(`GET secret ${namespace.trim()}/${name} returned HTTP ${res.statusCode}`));
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`GET secret ${name} timed out after ${REQUEST_TIMEOUT_MS}ms`)));
    req.on("error", reject);
    req.end();
  });

  const decoded = decodeTlsSecret(JSON.parse(body));
  if (!decoded) throw new Error(`Secret ${name} has no tls.crt / tls.key (not issued yet?)`);
  return decoded;
}
