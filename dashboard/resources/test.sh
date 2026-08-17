#!/bin/bash
cd "$(dirname "$0")" || exit 1
cat >equestria.kubeconfig.json <<'EOF'
{
  "kind": "Config",
  "apiVersion": "v1",
  "clusters": [
    {
      "cluster": {
        "server": "https://equestria-kubeproxy.opossum-yo.ts.net"
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
