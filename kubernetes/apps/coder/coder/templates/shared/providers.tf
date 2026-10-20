# Copied into the root of EVERY template when it is staged for upload -- see
# ../README.md. Edit it here; a template directory never carries its own copy.
#
# These two `version` pins are the only provider pins in the tree. The modules
# under ../modules declare the same providers WITHOUT a version, so Renovate
# has one line per provider to move and the templates cannot drift apart.

terraform {
  # Coder runs the Terraform it bundles (1.16 on Coder 2.38); 1.9 is the floor
  # the registry modules themselves ask for.
  required_version = ">= 1.9"

  required_providers {
    coder = {
      source  = "coder/coder"
      version = "2.19.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "3.4.0"
    }
  }
}

provider "coder" {}

# No arguments on purpose. The provisioner runs inside the `coder` pod, so the
# provider picks up that pod's ServiceAccount, and the chart's
# `coder-workspace-perms` Role is what it is allowed to do: pods, PVCs and
# deployments in the `coder` namespace, nothing else.
provider "kubernetes" {}
