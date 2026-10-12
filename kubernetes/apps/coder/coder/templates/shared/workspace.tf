# Copied into the root of EVERY template when it is staged for upload -- see
# ../README.md.
#
# The whole workspace -- agent, pod, home volume, editors, tools -- is one
# module call, and it is the same call in every template. What a template adds
# on top is only what makes it different: its own parameters and what it
# clones.
#
# THE CONTRACT with a template's own main.tf is one local:
#
#   local.folder   absolute path the editors and agents open, e.g.
#                  /home/coder/src/home-operations. No `~`: the JetBrains
#                  module rejects it.
#
# It has to be derivable from parameters alone. Anything in the template that
# needs the agent takes `module.workspace.agent_id`, so a folder computed from
# one of THOSE modules' outputs would be a cycle.

locals {
  # Where repositories are cloned: one directory each, side by side. Inside
  # the home volume, so a clone survives a restart.
  base_dir = "/home/coder/src"
}

module "workspace" {
  source = "./modules/workspace"

  folder                  = local.folder
  namespace               = var.namespace
  vault_addr              = var.vault_addr
  vault_jwt_role          = var.vault_jwt_role
  vault_jwt_auth_path     = var.vault_jwt_auth_path
  claude_code_oauth_token = var.claude_code_oauth_token
  jetbrains_plugins       = jsondecode(var.jetbrains_plugins)
  code_server_extensions  = jsondecode(var.code_server_extensions)
}
