# A workspace for a SET of repositories, cloned side by side.
#
# This file is only what makes the template different. The providers, the
# template variables and the workspace itself come from ../shared, and the
# modules from ../modules; all of it is copied in next to this file when the
# template is staged. See ../README.md.

variable "default_repository_urls" {
  # JSON in a string -- see the note in ../shared/variables.tf. It is also
  # exactly the shape a `list(string)` parameter's default has to be.
  description = "JSON array of the repositories offered by default, e.g. [\"git@host:owner/a.git\"]. The person creating the workspace can add to or remove from the list."
  type        = string
  default     = "[]"
}

data "coder_parameter" "repository_urls" {
  name         = "repository_urls"
  display_name = "Repositories"
  description  = "Clone URLs, one per entry. Use ssh URLs (git@host:owner/repo.git) for private repositories, and add your Coder SSH key (Account > SSH Keys) to the forge first. The first one is the repository whose mise tools are installed."
  icon         = "/icon/git.svg"
  type         = "list(string)"
  form_type    = "tag-select"
  # Adding one later clones it on the next start. Removing one only stops
  # managing it; the directory stays in the home volume.
  mutable = true
  order   = 10
  # Decoded and re-encoded so a malformed value fails the template build, where
  # it is read, instead of every workspace created from it.
  default = jsonencode(jsondecode(var.default_repository_urls))
}

locals {
  # `distinct` because the modules are keyed by URL, and a URL pasted twice
  # would otherwise be a duplicate-key error instead of a workspace.
  repository_urls = distinct([for url in jsondecode(data.coder_parameter.repository_urls.value) : trimspace(url) if trimspace(url) != ""])

  # The contract with ../shared/workspace.tf: open the directory that holds
  # all of the clones. Dev container discovery scans it, so every repository
  # with a devcontainer.json shows up in the dashboard, ready to start.
  folder = local.base_dir
}

module "repository" {
  for_each = toset(local.repository_urls)
  source   = "./modules/repository"

  agent_id = module.workspace.agent_id
  url      = each.value
  base_dir = local.base_dir

  # One repository only -- see the variable's description in the module. The
  # others get their tools the first time you `cd` into them and run
  # `mise install`, which mise prompts for once it is activated in the shell.
  mise = each.value == local.repository_urls[0]
}
