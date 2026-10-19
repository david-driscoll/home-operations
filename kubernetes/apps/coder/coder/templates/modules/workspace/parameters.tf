# What a person chooses when they create a workspace. `order` starts at 100 so
# a template's own parameters (what to clone) sort above these without anyone
# having to renumber.

data "coder_parameter" "image" {
  name         = "image"
  display_name = "Image"
  description  = "What is installed outside the home directory. Everything else comes from the repository's own mise config, a dev container, or your dotfiles."
  icon         = "/icon/docker.svg"
  type         = "string"
  mutable      = true
  order        = 100
  default      = "codercom/example-node:ubuntu"

  # Rolling tags, pulled on every start (`image_pull_policy = "Always"`), so
  # there is no version here for Renovate to move. All three are built on the
  # same base and carry the Docker CLI, git, curl, jq and unzip, which the
  # modules in this template need.
  option {
    name        = "Node"
    description = "The base image plus Node.js LTS. The default, because Mux and the dev container CLI are npm packages."
    value       = "codercom/example-node:ubuntu"
  }
  option {
    name        = "Base"
    description = "Ubuntu with git and the Docker CLI. Mux falls back to a tarball; the dev container CLI will not install."
    value       = "codercom/example-base:ubuntu"
  }
  option {
    name        = "Universal"
    description = "Most languages preinstalled. Large, and slow to pull the first time on each node."
    value       = "codercom/example-universal:ubuntu"
  }
}

data "coder_parameter" "cpu" {
  name         = "cpu"
  display_name = "CPU"
  description  = "CPU limit, in cores. JetBrains IDEs want at least 4."
  icon         = "/icon/memory.svg"
  type         = "number"
  mutable      = true
  order        = 110
  default      = "4"

  option {
    name  = "2 Cores"
    value = "2"
  }
  option {
    name  = "4 Cores"
    value = "4"
  }
  option {
    name  = "6 Cores"
    value = "6"
  }
  option {
    name  = "8 Cores"
    value = "8"
  }
}

data "coder_parameter" "memory" {
  name         = "memory"
  display_name = "Memory"
  description  = "Memory limit, in GB. JetBrains IDEs want at least 8."
  icon         = "/icon/memory.svg"
  type         = "number"
  mutable      = true
  order        = 120
  default      = "8"

  option {
    name  = "4 GB"
    value = "4"
  }
  option {
    name  = "8 GB"
    value = "8"
  }
  option {
    name  = "12 GB"
    value = "12"
  }
  option {
    name  = "16 GB"
    value = "16"
  }
}

data "coder_parameter" "home_disk_size" {
  name         = "home_disk_size"
  display_name = "Home disk size"
  description  = "Size of the home volume in GB. It holds your clones, editor state and tool caches, and is the only thing that survives a restart."
  icon         = "/emojis/1f4be.png"
  type         = "number"
  # Longhorn can grow a volume but the template would have to drive it, and a
  # shrink is impossible. Fixed at creation, as in the stock template.
  mutable = false
  order   = 130
  default = "30"

  validation {
    min = 5
    max = 200
  }
}

data "coder_parameter" "docker" {
  name         = "docker"
  display_name = "Docker and dev containers"
  description  = "Run a Docker daemon next to the workspace. Needed for dev containers, `docker build` and `docker compose`. It is a privileged container, and its images are lost when the workspace stops."
  icon         = "/icon/docker.svg"
  type         = "bool"
  mutable      = true
  order        = 140
  default      = "true"
}
