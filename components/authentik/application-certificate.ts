import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import * as authentik from "@pulumi/authentik";
import { SharedComponentResource } from "./shared-component-resource.ts";
import { GlobalResources } from "@components/globals.ts";

export class ApplicationCertificate extends SharedComponentResource {
  public readonly privateKey: tls.PrivateKey;
  public readonly certificate: tls.SelfSignedCert;
  public readonly signingKey: authentik.CertificateKeyPair;

  constructor(name: string, args: { globals: GlobalResources }, opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:ApplicationCertificate", name, opts);

    const resourceName = (this as any).__name;
    this.privateKey = new tls.PrivateKey(
      `${name}-private-key`,
      {
        algorithm: "RSA",
        rsaBits: 4096,
      },
      this.parent
    );
    this.certificate = new tls.SelfSignedCert(
      `${name}-certificate`,
      {
        privateKeyPem: this.privateKey.privateKeyPem,
        allowedUses: ["cert_signing"],
        validityPeriodHours: Math.floor(365 * 24), // 1 year
        earlyRenewalHours: 24, // 1 day
        subject: {
          commonName: `${resourceName} Signing Key`,
          organizationalUnit: "Authentik",
          country: "Anywhere",
          locality: "Everywhere",
        },
      },
      this.parent
    );
    this.signingKey = new authentik.CertificateKeyPair(
      `${name}-key-pair`,
      {
        certificateData: this.certificate.certPem,
        keyData: this.privateKey.privateKeyPem,
      },
      this.parent
    );
  }
}
