import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { SharedComponentResource } from "./shared-component-resource.js";
import { Roles, Groups } from "../constants.ts";

export class Policies extends SharedComponentResource {
  private _passwordComplexity?: authentik.PolicyPassword;
  private _sourceAuthenticationIfSingleSignOn?: authentik.PolicyExpression;
  private _sourceEnrollmentIfSingleSignOn?: authentik.PolicyExpression;
  private _userSettingsAuthorization?: authentik.PolicyExpression;
  private _defaultGroups?: authentik.PolicyExpression;
  private _defaultSourceGroups?: authentik.PolicyExpression;

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:AuthentikPolicies", "authentik-policies", opts);
  }

  public get passwordComplexity(): authentik.PolicyPassword {
    if (!this._passwordComplexity) {
      this._passwordComplexity = new authentik.PolicyPassword(
        "password-complexity",
        {
          checkStaticRules: true,
          checkHaveIBeenPwned: true,
          checkZxcvbn: true,
          zxcvbnScoreThreshold: 2,
          hibpAllowedCount: 0,
          lengthMin: 8,
          errorMessage: "Password needs to be 8 characters or longer.",
        },
        this.parent
      );
    }
    return this._passwordComplexity;
  }

  public get sourceAuthenticationIfSingleSignOn(): authentik.PolicyExpression {
    if (!this._sourceAuthenticationIfSingleSignOn) {
      this._sourceAuthenticationIfSingleSignOn = new authentik.PolicyExpression(
        "source-authentication-if-single-sign-on",
        {
          expression: "return ak_is_sso_flow",
        },
        this.parent
      );
    }
    return this._sourceAuthenticationIfSingleSignOn;
  }

  public get sourceEnrollmentIfSingleSignOn(): authentik.PolicyExpression {
    if (!this._sourceEnrollmentIfSingleSignOn) {
      this._sourceEnrollmentIfSingleSignOn = new authentik.PolicyExpression(
        "source-enrollment-if-single-sign-on",
        {
          expression: "return ak_is_sso_flow",
        },
        this.parent
      );
    }
    return this._sourceEnrollmentIfSingleSignOn;
  }

  public get userSettingsAuthorization(): authentik.PolicyExpression {
    if (!this._userSettingsAuthorization) {
      this._userSettingsAuthorization = new authentik.PolicyExpression(
        "user-settings-authorization",
        {
          expression: `from authentik.core.models import (
    USER_ATTRIBUTE_CHANGE_EMAIL,
    USER_ATTRIBUTE_CHANGE_NAME,
    USER_ATTRIBUTE_CHANGE_USERNAME
)
prompt_data = request.context.get("prompt_data")

if not request.user.group_attributes(request.http_request).get(
    USER_ATTRIBUTE_CHANGE_EMAIL, request.http_request.tenant.default_user_change_email
):
    if prompt_data.get("email") != request.user.email:
        ak_message("Not allowed to change email address.")
        return False

if not request.user.group_attributes(request.http_request).get(
    USER_ATTRIBUTE_CHANGE_NAME, request.http_request.tenant.default_user_change_name
):
    if prompt_data.get("name") != request.user.name:
        ak_message("Not allowed to change name.")
        return False

if not request.user.group_attributes(request.http_request).get(
    USER_ATTRIBUTE_CHANGE_USERNAME, request.http_request.tenant.default_user_change_username
):
    if prompt_data.get("username") != request.user.username:
        ak_message("Not allowed to change username.")
        return False

return True`,
        },
        this.parent
      );
    }
    return this._userSettingsAuthorization;
  }

  public get defaultGroups(): authentik.PolicyExpression {
    if (!this._defaultGroups) {
      this._defaultGroups = new authentik.PolicyExpression(
        "default-groups",
        {
          expression: `from authentik.core.models import Group
group, _ = Group.objects.get_or_create(name="${Roles.Users}")
# ["groups"] *must* be set to an array of Group objects, names alone are not enough.
request.context["flow_plan"].context["groups"] = [group]
return True`,
        },
        this.parent
      );
    }
    return this._defaultGroups;
  }

  public get defaultSourceGroups(): authentik.PolicyExpression {
    if (!this._defaultSourceGroups) {
      this._defaultSourceGroups = new authentik.PolicyExpression(
        "default-source-groups",
        {
          expression: `from authentik.core.models import Group

sourceGroups = request.context['source']['groups']
groups = []
if not sourceGroups:
  sourceGroups = ["${Roles.Users}"]

for group_name in sourceGroups:
  group, _ = Group.objects.get_or_create(name=group_name)
  groups.append(group)

request.context["flow_plan"].context["groups"] = groups
return True`,
        },
        this.parent
      );
    }
    return this._defaultSourceGroups;
  }
}
