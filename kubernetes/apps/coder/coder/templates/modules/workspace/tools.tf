# Everything that is not an editor: agents, git identity, dotfiles, OpenBao.

# --- Coding agents ------------------------------------------------------------

module "claude_code" {
  count   = data.coder_workspace.me.start_count
  source  = "registry.coder.com/coder/claude-code/coder"
  version = "5.5.2"

  agent_id = coder_agent.main.id
  # Pre-creates the folder and pre-accepts the trust prompt for it.
  workdir                 = var.folder
  claude_code_oauth_token = var.claude_code_oauth_token
}

# Mux: parallel agents in the browser, opened on the same folder.
module "mux" {
  count   = data.coder_workspace.me.start_count
  source  = "registry.coder.com/coder/mux/coder"
  version = "2.0.0"

  agent_id    = coder_agent.main.id
  add_project = var.folder
  subdomain   = true
}

# --- Git ----------------------------------------------------------------------

# user.name and user.email from your Coder account, both overridable.
module "git_config" {
  count   = data.coder_workspace.me.start_count
  source  = "registry.coder.com/coder/git-config/coder"
  version = "1.0.35"

  agent_id              = coder_agent.main.id
  allow_email_change    = true
  allow_username_change = true

  coder_parameter_order = 160
}

# Signs commits with your Coder SSH key. For the signature to show as verified,
# add the key from Coder's Account > SSH Keys to the forge as a SIGNING key.
module "git_commit_signing" {
  count   = data.coder_workspace.me.start_count
  source  = "registry.coder.com/coder/git-commit-signing/coder"
  version = "1.0.32"

  agent_id = coder_agent.main.id
}

# --- Personalisation ----------------------------------------------------------

module "dotfiles" {
  count   = data.coder_workspace.me.start_count
  source  = "registry.coder.com/coder/dotfiles/coder"
  version = "1.4.2"

  agent_id = coder_agent.main.id

  # Pre-fills the parameter; the person can change or clear it. The ssh form,
  # so a private dotfiles repository works with the Coder SSH key.
  #
  # The name is the CODER username -- Coder does not know anyone's GitHub
  # handle -- so this is right for whoever uses the same name in both places
  # and a starting point to edit for everyone else. A default that points at a
  # repository that does not exist only fails the dotfiles script; the
  # workspace still starts.
  default_dotfiles_uri = "git@github.com:${data.coder_workspace_owner.me.name}/dotfiles.git"

  coder_parameter_order = 170
}

# --- Dev containers -----------------------------------------------------------

# The CLI the agent drives to build and start a dev container. Needs npm, so it
# is skipped on the Base image as well as when there is no Docker to drive.
module "devcontainers_cli" {
  count   = local.docker && data.coder_parameter.image.value != "codercom/example-base:ubuntu" ? data.coder_workspace.me.start_count : 0
  source  = "registry.coder.com/coder/devcontainers-cli/coder"
  version = "1.1.0"

  agent_id = coder_agent.main.id
}

# --- OpenBao ------------------------------------------------------------------
#
# The two modules are alternatives, not layers: each installs the CLI and each
# declares VAULT_ADDR, so both at once is a duplicate-env error.
#
#   vault_jwt_role == ""   CLI only. You log in yourself: `vault login -method=oidc`.
#   vault_jwt_role != ""   CLI plus an automatic login at every start, using the
#                          OIDC access token Coder holds for the workspace
#                          owner. That script blocks login and FAILS THE START
#                          when OpenBao refuses the token, which is why the role
#                          stays empty until the auth mount exists -- see
#                          VAULT_JWT_ENABLED in stacks/system/coder-templates.ts.
#
# Both install HashiCorp's `vault` binary. It speaks the same API as `bao`.

locals {
  vault_enabled = var.vault_addr != ""
  vault_login   = local.vault_enabled && var.vault_jwt_role != ""
}

module "vault_cli" {
  count   = local.vault_enabled && !local.vault_login ? data.coder_workspace.me.start_count : 0
  source  = "registry.coder.com/coder/vault-cli/coder"
  version = "1.1.2"

  agent_id   = coder_agent.main.id
  vault_addr = var.vault_addr
}

module "vault_jwt" {
  count   = local.vault_login ? data.coder_workspace.me.start_count : 0
  source  = "registry.coder.com/coder/vault-jwt/coder"
  version = "1.3.0"

  agent_id            = coder_agent.main.id
  vault_addr          = var.vault_addr
  vault_jwt_auth_path = var.vault_jwt_auth_path
  vault_jwt_role      = var.vault_jwt_role
}

# For `bao`, when a repository's mise config installs it.
resource "coder_env" "bao_addr" {
  count    = local.vault_enabled ? data.coder_workspace.me.start_count : 0
  agent_id = coder_agent.main.id
  name     = "BAO_ADDR"
  value    = var.vault_addr
}
