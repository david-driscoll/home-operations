import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { SharedComponentResource } from "./shared-component-resource.js";
import { Fields } from "./fields.js";

export class StagePrompts extends SharedComponentResource {
  private _userSettings?: authentik.StagePrompt;
  private _enrollment?: authentik.StagePrompt;
  private _internalEnrollmentWrite?: authentik.StageUserWrite;
  private _externalEnrollmentWrite?: authentik.StageUserWrite;
  private _sourceAuthenticationUpdate?: authentik.StageUserWrite;

  constructor(
    private fields: Fields,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("custom:resource:AuthentikStagePrompts", "authentik-stage-prompts", opts);
  }

  public get userSettings(): authentik.StagePrompt {
    if (!this._userSettings) {
      this._userSettings = this.createStagePrompt("user-settings", (args) => {
        args.fields = [
          this.fields.name.stagePromptFieldId,
          this.fields.username.stagePromptFieldId,
          this.fields.email.stagePromptFieldId,
        ];
      });
    }
    return this._userSettings;
  }

  public get enrollment(): authentik.StagePrompt {
    if (!this._enrollment) {
      this._enrollment = this.createStagePrompt("enrollment", (args) => {
        args.fields = [
          this.fields.email.stagePromptFieldId,
          this.fields.username.stagePromptFieldId,
          this.fields.name.stagePromptFieldId,
        ];
      });
    }
    return this._enrollment;
  }

  public get internalEnrollmentWrite(): authentik.StageUserWrite {
    if (!this._internalEnrollmentWrite) {
      this._internalEnrollmentWrite = new authentik.StageUserWrite(
        "internal-enrollment-write",
        {
          createUsersAsInactive: false,
          userType: "internal",
          userCreationMode: "create_when_required",
        },
        this.parent
      );
    }
    return this._internalEnrollmentWrite;
  }

  public get externalEnrollmentWrite(): authentik.StageUserWrite {
    if (!this._externalEnrollmentWrite) {
      this._externalEnrollmentWrite = new authentik.StageUserWrite(
        "external-enrollment-write",
        {
          createUsersAsInactive: false,
          userType: "external",
          userCreationMode: "create_when_required",
        },
        this.parent
      );
    }
    return this._externalEnrollmentWrite;
  }

  public get sourceAuthenticationUpdate(): authentik.StageUserWrite {
    if (!this._sourceAuthenticationUpdate) {
      this._sourceAuthenticationUpdate = new authentik.StageUserWrite(
        "source-authentication-write",
        {
          createUsersAsInactive: false,
          userType: "internal",
          userCreationMode: "never_create",
        },
        this.parent
      );
    }
    return this._sourceAuthenticationUpdate;
  }

  private createStagePrompt(
    name: string,
    configure: (args: authentik.StagePromptArgs) => void
  ): authentik.StagePrompt {
    const args: authentik.StagePromptArgs = {
      fields: [],
    };
    configure(args);
    return new authentik.StagePrompt(name, args, this.parent);
  }
}
