#!/usr/bin/env bash
# Downloads and installs the Pkl VS Code extension from GitHub releases.
#
# Ported from rocketsurgeonsguild/Specular (build/scripts/install-pkl-vscode.sh),
# which is where this pattern originated. Lives under scripts/ here because this
# repo has no build/ directory.
#
# The extension ships only as a VSIX -- it is NOT on the VS Code marketplace --
# so it cannot be installed from .vscode/extensions.json and has to be fetched
# from GitHub and installed with `code --install-extension`. The recommendation
# in .vscode/extensions.json only makes VS Code show it as already-installed;
# this script is what actually puts it there.
#
# The extension downloads its own pkl-lsp jar from Maven at first use, but it
# locates Java from $JAVA_HOME or $PATH and needs Java 22 or newer. mise does not
# pin a JDK for this on purpose -- it would add a JDK download to every
# `mise install` and to CI for an editor-only feature. If you need one:
# `mise use java@temurin-25`.
#
# Version is pinned via PKL_VSCODE_VERSION (see .config/mise.toml [env]).
set -euo pipefail

VERSION="${PKL_VSCODE_VERSION:?PKL_VSCODE_VERSION must be set (see .config/mise.toml [env])}"
ROOT="${MISE_PROJECT_ROOT:-$(git rev-parse --show-toplevel)}"
CACHE_DIR="$ROOT/.pkl-vscode"
VSIX="$CACHE_DIR/pkl-vscode-${VERSION}.vsix"
SENTINEL="$CACHE_DIR/.installed-${VERSION}"
URL="https://github.com/apple/pkl-vscode/releases/download/${VERSION}/pkl-vscode-${VERSION}.vsix"

if [[ -f "$SENTINEL" ]]; then
    echo "pkl-vscode ${VERSION} already installed"
    exit 0
fi

if ! command -v code >/dev/null 2>&1; then
    echo "install-pkl-vscode: no \`code\` on PATH — install the VS Code shell command" >&2
    echo "  (Command Palette → 'Shell Command: Install code command in PATH')" >&2
    exit 127
fi

mkdir -p "$CACHE_DIR"
if [[ ! -f "$VSIX" ]]; then
    echo "Downloading pkl-vscode ${VERSION}..."
    curl -fsSL "$URL" -o "$VSIX"
fi

echo "Installing pkl-vscode ${VERSION}..."
code --install-extension "$VSIX"
touch "$SENTINEL"
echo "Installed pkl-vscode ${VERSION}"
