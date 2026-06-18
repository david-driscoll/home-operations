#!/bin/bash
cd "$(dirname "$0")" || exit 1
CONFIG=$(cat <<EOF
{
  "kind": "Config",
  "apiVersion": "v1",
  "clusters": [
    {
      "cluster": {
        "server": "https://sgc-kubeproxy.opossum-yo.ts.net"
      },
      "name": "sgc"
    }
  ],
  "contexts": [
    {
      "context": {
        "cluster": "sgc",
        "user": "sgc"
      },
      "name": "sgc"
    }
  ],
  "current-context": "sgc",
  "users": [
    {
      "name": "sgc",
      "user": {}
    }
  ]
}
EOF
)
echo "$CONFIG" > sgc.kubeconfig.json
echo "$CONFIG" | sed 's/sgc/equestria/g' > equestria.kubeconfig.json
op run --no-masking -- docker compose up --watch
