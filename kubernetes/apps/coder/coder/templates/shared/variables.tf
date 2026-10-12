# Copied into the root of EVERY template when it is staged for upload -- see
# ../README.md.
#
# These are TEMPLATE variables: one value per template version, set by Pulumi
# (`tf_vars` in stacks/system/coder-templates.ts), never asked of the person
# creating a workspace. Anything a person should choose is a `coder_parameter`
# instead.
#
# Every one has a default so a template still plans when it is pushed by hand
# with `coder templates push` and no variables at all.

variable "namespace" {
  description = "Kubernetes namespace the workspaces are created in. Must be one the provisioner's ServiceAccount may write to."
  type        = string
  default     = "coder"
}

variable "vault_addr" {
  description = "Address of OpenBao as a workspace reaches it. Empty leaves the Vault CLI and login out of the workspace."
  type        = string
  default     = ""
}

variable "vault_jwt_role" {
  description = "OpenBao JWT role a workspace logs in with, using its owner's OIDC access token. Empty installs the CLI only -- which is what it has to be until the auth mount exists, because a failed login fails the workspace start."
  type        = string
  default     = ""
}

variable "vault_jwt_auth_path" {
  description = "Mount path of the OpenBao JWT auth method that trusts Coder's OIDC provider."
  type        = string
  default     = "coder"
}

variable "claude_code_oauth_token" {
  description = "OAuth token handed to Claude Code as CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`). Empty means each person signs in themselves; the login lives in the home volume and survives restarts."
  type        = string
  default     = ""
  sensitive   = true
}

# The next two are JSON in a string, not `map(...)` / `list(...)`. Coder hands
# every template variable to Terraform as a string, and whether a structured
# type survives that depends on the Coder version; a string decoded with
# `jsondecode` does not.

variable "jetbrains_plugins" {
  description = "JSON object of JetBrains Marketplace plugin IDs to install, keyed by IDE product code, e.g. {\"RD\":[\"com.intellij.kubernetes\"]}."
  type        = string
  default     = "{}"
}

variable "code_server_extensions" {
  description = "JSON array of extension IDs installed into code-server at start, e.g. [\"hashicorp.terraform\"]."
  type        = string
  default     = "[]"
}
