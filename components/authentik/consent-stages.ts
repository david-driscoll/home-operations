import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { SharedComponentResource } from "./shared-component-resource.ts";

export class ConsentStages extends SharedComponentResource {
  private _oneMonth?: authentik.StageConsent;
  private _oneWeek?: authentik.StageConsent;
  private _require?: authentik.StageConsent;
  private _permanent?: authentik.StageConsent;

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:ConsentStages", "stages-authorization", opts);
  }

  public get oneMonth(): authentik.StageConsent {
    if (!this._oneMonth) {
      this._oneMonth = new authentik.StageConsent(
        "custom-authorization-consent-one-month",
        {
          consentExpireIn: "days=30",
          mode: "expiring",
        },
        this.parent
      );
    }
    return this._oneMonth;
  }

  public get oneWeek(): authentik.StageConsent {
    if (!this._oneWeek) {
      this._oneWeek = new authentik.StageConsent(
        "custom-authorization-consent-one-week",
        {
          consentExpireIn: "days=7",
          mode: "expiring",
        },
        this.parent
      );
    }
    return this._oneWeek;
  }

  public get require(): authentik.StageConsent {
    if (!this._require) {
      this._require = new authentik.StageConsent(
        "custom-authorization-consent-require",
        {
          mode: "always_require",
        },
        this.parent
      );
    }
    return this._require;
  }

  public get permanent(): authentik.StageConsent {
    if (!this._permanent) {
      this._permanent = new authentik.StageConsent(
        "custom-authorization-consent-permanent",
        {
          mode: "permanent",
        },
        this.parent
      );
    }
    return this._permanent;
  }
}
