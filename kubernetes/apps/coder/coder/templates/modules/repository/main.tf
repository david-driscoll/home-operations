# One repository in a workspace: the clone, and optionally its tools and its
# dev container. A template calls this once per repository it clones.
#
# `dir` and `name` are computed from the variables alone, never from the
# registry modules below, so a template can feed `dir` back into the workspace
# module as the folder to open without creating a cycle through `agent_id`.

terraform {
  required_version = ">= 1.9"

  # No version here: ../../shared/providers.tf holds the only pin.
  required_providers {
    coder = {
      source = "coder/coder"
    }
  }
}

variable "agent_id" {
  description = "The workspace agent to attach to."
  type        = string
}

variable "url" {
  description = "Clone URL, https or ssh. A GitHub or GitLab `/tree/<branch>` URL is accepted and selects that branch."
  type        = string
}

variable "branch" {
  description = "Branch to check out. Empty means the repository's default."
  type        = string
  default     = ""
}

variable "base_dir" {
  description = "Absolute directory the repository is cloned INTO; the clone lands in a subdirectory named after the repository."
  type        = string
}

variable "mise" {
  description = "Install mise and run `mise install` in the clone. At most ONE repository per workspace may set this: the module writes its scripts to a fixed path, so two instances overwrite each other."
  type        = bool
  default     = false
}

variable "devcontainer" {
  description = "Build and start the repository's dev container when the workspace starts. The start fails if there is no devcontainer.json, so this is opt-in; without it a dev container is still discovered and can be started from the dashboard."
  type        = bool
  default     = false
}

data "coder_workspace" "me" {}

locals {
  # The same normalisation the git-clone module applies, repeated here because
  # its outputs cannot be used (see the header): drop a query string or
  # fragment, then a forge's /tree/<branch> suffix, then `.git`.
  bare_url = replace(replace(var.url, "/[?#].*$/", ""), "/(/-)?/tree/.*$/", "")
  name     = trimsuffix(basename(local.bare_url), ".git")
  dir      = "${var.base_dir}/${local.name}"
}

module "git_clone" {
  count   = data.coder_workspace.me.start_count
  source  = "registry.coder.com/coder/git-clone/coder"
  version = "2.0.5"

  agent_id    = var.agent_id
  url         = var.url
  branch_name = var.branch
  base_dir    = var.base_dir
  # Explicit, so the directory is `local.dir` by construction rather than by
  # two implementations of the same rule happening to agree.
  folder_name = local.name
}

# Installs mise, then waits for the clone and runs `mise install` in it, so the
# repository's pinned toolchain is there before anyone opens a terminal.
module "mise_install" {
  count   = var.mise ? data.coder_workspace.me.start_count : 0
  source  = "registry.coder.com/droopy4096/mise-install/coder"
  version = "1.0.0"

  agent_id = var.agent_id
  repo_dir = local.dir
  # A first clone of a large repository on a cold node can take a while.
  wait_seconds = 900
}

resource "coder_devcontainer" "this" {
  count            = var.devcontainer ? data.coder_workspace.me.start_count : 0
  agent_id         = var.agent_id
  workspace_folder = local.dir
}

output "name" {
  description = "The repository's name, which is also its directory name."
  value       = local.name
}

output "dir" {
  description = "Absolute path of the clone."
  value       = local.dir
}
