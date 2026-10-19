terraform {
  required_version = ">= 1.9"

  # No versions here: ../../shared/providers.tf holds the only pins.
  required_providers {
    coder = {
      source = "coder/coder"
    }
    kubernetes = {
      source = "hashicorp/kubernetes"
    }
  }
}

variable "folder" {
  description = "Absolute path the editors and agents open. Must not start with `~`."
  type        = string

  validation {
    condition     = startswith(var.folder, "/")
    error_message = "folder must be an absolute path; the JetBrains module rejects `~`."
  }
}

variable "namespace" {
  description = "Kubernetes namespace the workspace is created in."
  type        = string
}

variable "vault_addr" {
  description = "Address of OpenBao as a workspace reaches it. Empty leaves the Vault CLI and login out."
  type        = string
  default     = ""
}

variable "vault_jwt_role" {
  description = "OpenBao JWT role to log in with. Empty installs the CLI only."
  type        = string
  default     = ""
}

variable "vault_jwt_auth_path" {
  description = "Mount path of the OpenBao JWT auth method."
  type        = string
  default     = "coder"
}

variable "claude_code_oauth_token" {
  description = "OAuth token handed to Claude Code. Empty means each person signs in themselves."
  type        = string
  default     = ""
  sensitive   = true
}

variable "jetbrains_plugins" {
  description = "JetBrains Marketplace plugin IDs to install, keyed by IDE product code."
  type        = map(list(string))
  default     = {}
}

variable "code_server_extensions" {
  description = "Extension IDs installed into code-server at start."
  type        = list(string)
  default     = []
}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

locals {
  home = "/home/coder"

  # Parameters arrive as strings whatever their declared type.
  docker = data.coder_parameter.docker.value == "true"

  # Where the Docker sidecar puts its socket. A directory of its own in a
  # shared emptyDir, rather than /var/run, so mounting it hides nothing the
  # workspace image keeps there.
  docker_socket_dir = "/run/dind"

  labels = {
    "app.kubernetes.io/name"     = "coder-workspace"
    "app.kubernetes.io/instance" = "coder-workspace-${data.coder_workspace.me.id}"
    "app.kubernetes.io/part-of"  = "coder"
    "com.coder.resource"         = "true"
    "com.coder.workspace.id"     = data.coder_workspace.me.id
    "com.coder.workspace.name"   = data.coder_workspace.me.name
    "com.coder.user.id"          = data.coder_workspace_owner.me.id
    "com.coder.user.username"    = data.coder_workspace_owner.me.name
  }
}

output "agent_id" {
  description = "The workspace agent. Everything a template adds on top attaches to this."
  value       = coder_agent.main.id
}

output "home" {
  description = "The home directory, which is the persistent volume."
  value       = local.home
}

output "docker" {
  description = "Whether this workspace was created with the Docker sidecar, and so can run dev containers."
  value       = local.docker
}
