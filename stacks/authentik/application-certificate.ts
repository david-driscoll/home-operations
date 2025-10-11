import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import * as authentik from "@pulumi/authentik";
import { SharedComponentResource } from "./shared-component-resource.ts";

export class ApplicationCertificate extends SharedComponentResource {
  private _signingPrivateKey?: tls.PrivateKey;
  private _signingCertificate?: tls.SelfSignedCert;
  private _signingKeyPair?: authentik.CertificateKeyPair;

  constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:ApplicationCertificate", name, opts);
  }

  public get signingPrivateKey(): tls.PrivateKey {
    if (!this._signingPrivateKey) {
      const resourceName = (this as any).__name;
      this._signingPrivateKey = new tls.PrivateKey(
        `${resourceName}-private-key`,
        {
          algorithm: "RSA",
          rsaBits: 4096,
        },
        this.parent
      );
    }
    return this._signingPrivateKey;
  }

  public get signingCertificate(): tls.SelfSignedCert {
    if (!this._signingCertificate) {
      const resourceName = (this as any).__name;
      this._signingCertificate = new tls.SelfSignedCert(
        `${resourceName}-certificate`,
        {
          privateKeyPem: this.signingPrivateKey.privateKeyPem,
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
    }
    return this._signingCertificate;
  }

  public get signingKeyPair(): authentik.CertificateKeyPair {
    if (!this._signingKeyPair) {
      const resourceName = (this as any).__name;
      this._signingKeyPair = new authentik.CertificateKeyPair(
        `${resourceName}-key-pair`,
        {
          certificateData: this.signingCertificate.certPem,
          keyData: this.signingPrivateKey.privateKeyPem,
        },
        this.parent
      );
    }
    return this._signingKeyPair;
  }
}
