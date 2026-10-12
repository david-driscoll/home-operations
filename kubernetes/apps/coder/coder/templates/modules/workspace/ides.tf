# Editors. Every one of them opens `var.folder`.
#
# All of these carry `count = start_count`: a stopped workspace has no agent to
# attach an app or a script to.

# VS Code in the browser.
module "code_server" {
  count   = data.coder_workspace.me.start_count
  source  = "registry.coder.com/coder/code-server/coder"
  version = "1.6.0"

  agent_id   = coder_agent.main.id
  folder     = var.folder
  extensions = var.code_server_extensions

  # Also install whatever the repository itself recommends in
  # .vscode/extensions.json, once it has been cloned.
  auto_install_extensions = true

  # On its own origin (<app>--<workspace>--<owner>.code.<root domain>) rather
  # than a path under Coder's, so a page served from the workspace cannot
  # reach Coder's own cookies. The wildcard hostname is already routed --
  # see ../../../httproute.yaml.
  subdomain = true
}

# VS Code on your own machine, over the Coder extension.
module "vscode_desktop" {
  count   = data.coder_workspace.me.start_count
  source  = "registry.coder.com/coder/vscode-desktop/coder"
  version = "1.3.0"

  agent_id = coder_agent.main.id
  folder   = var.folder
}

# JetBrains IDEs through Toolbox (2.7 or newer, with the Coder plugin). With no
# `default` the module asks which IDEs you want as a workspace parameter, and
# makes one button for each.
module "jetbrains" {
  count   = data.coder_workspace.me.start_count
  source  = "registry.coder.com/coder/jetbrains/coder"
  version = "1.4.0"

  agent_id = coder_agent.main.id
  folder   = var.folder

  # Below the workspace parameters in parameters.tf.
  coder_parameter_order = 150
}

# Marketplace plugins for those IDEs. It can only install into an IDE that is
# already on the volume, so plugins appear on the start AFTER the one where you
# first opened the IDE.
module "jetbrains_plugins" {
  count   = length(var.jetbrains_plugins) > 0 ? data.coder_workspace.me.start_count : 0
  source  = "registry.coder.com/harsh9485/jetbrains-plugins/coder"
  version = "0.1.1"

  agent_id          = coder_agent.main.id
  jetbrains_plugins = var.jetbrains_plugins
}
