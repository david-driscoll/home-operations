#!/bin/bash
cd "$(dirname "$0")" || exit 1
# The tailnet is never written in the repo (docs/plans/private-domain-scrub.md).
# shellcheck source-path=SCRIPTDIR source=../../scripts/lib/private-names.sh
source ../../scripts/lib/private-names.sh
private_names || exit 1
cat >equestria.kubeconfig.json <<EOF
{
  "kind": "Config",
  "apiVersion": "v1",
  "clusters": [
    {
      "cluster": {
        "server": "https://equestria-kubeproxy.${TAILSCALE_DOMAIN}"
      },
      "name": "equestria"
    }
  ],
  "contexts": [
    {
      "context": {
        "cluster": "equestria",
        "user": "equestria"
      },
      "name": "equestria"
    }
  ],
  "current-context": "equestria",
  "users": [
    {
      "name": "equestria",
      "user": {}
    }
  ]
}
EOF
op run --no-masking -- docker compose up --watch
