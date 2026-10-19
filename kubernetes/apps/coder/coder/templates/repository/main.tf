# A workspace for ONE repository.
#
# This file is only what makes the template different. The providers, the
# template variables and the workspace itself come from ../shared, and the
# modules from ../modules; all of it is copied in next to this file when the
# template is staged. See ../README.md.

variable "default_repository_url" {
  description = "Repository offered by default. Empty makes the person creating the workspace supply one."
  type        = string
  default     = ""
}

variable "default_repository_branch" {
  description = "Branch offered by default. Empty means the repository's default branch."
  type        = string
  default     = ""
}

data "coder_parameter" "repository_url" {
  name         = "repository_url"
  display_name = "Repository"
  description  = "Clone URL. Use an ssh URL (git@host:owner/repo.git) for a private repository, and add your Coder SSH key (Account > SSH Keys) to the forge first."
  icon         = "/icon/git.svg"
  type         = "string"
  # Changing it later clones the new repository NEXT TO the old one and points
  # the editors at it; nothing in the home volume is removed.
  mutable = true
  order   = 10
  # `null`, not "": an empty default would make the parameter optional and the
  # workspace would start with nothing cloned.
  default = var.default_repository_url != "" ? var.default_repository_url : null

  # `^$|` is not an escape hatch for the person creating a workspace: with no
  # default the parameter is required, and Coder refuses an empty value
  # before validation runs. It is for Coder's TEMPLATE IMPORT, which plans
  # the template with every required parameter left empty -- and without
  # it that plan fails this regex and the template version cannot be
  # created at all.
  validation {
    regex = "^$|^(https://|ssh://|git@)\\S+$"
    error = "Enter an https:// or ssh clone URL."
  }
}

data "coder_parameter" "repository_branch" {
  name         = "repository_branch"
  display_name = "Branch"
  description  = "Branch to check out. Leave empty for the repository's default. Only used for the first clone."
  icon         = "/icon/git.svg"
  type         = "string"
  mutable      = true
  order        = 20
  default      = var.default_repository_branch
}

data "coder_parameter" "devcontainer" {
  name         = "devcontainer"
  display_name = "Start the dev container"
  description  = "Build and start the repository's dev container with the workspace. Needs a devcontainer.json in the repository and Docker enabled below. Leave it off and a dev container can still be started from the dashboard."
  icon         = "/icon/container.svg"
  type         = "bool"
  mutable      = true
  order        = 30
  default      = "false"
}

module "repository" {
  source = "./modules/repository"

  agent_id = module.workspace.agent_id
  url      = data.coder_parameter.repository_url.value
  branch   = data.coder_parameter.repository_branch.value
  base_dir = local.base_dir
  mise     = true

  devcontainer = module.workspace.docker && data.coder_parameter.devcontainer.value == "true"
}

locals {
  # The contract with ../shared/workspace.tf: open the clone itself.
  folder = module.repository.dir
}
