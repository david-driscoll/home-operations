# Replaces the generated KubeEtcdEncryptionConfig (deleted in ./10-cluster.yaml,
# which sorts before this file -- KEEP THE FILENAMES IN THAT ORDER). THIS ONE IS
# LOAD-BEARING -- getting it wrong makes the apiserver unable to read a single
# Secret.
#
# Every Secret in etcd is stored as `k8s:enc:secretbox:v1:key2:...` (the name
# Talos gave it under v1alpha1's `.cluster.secretboxEncryptionSecret`), and
# secretbox matches keys BY NAME. `identity: {}` is the read fallback for any
# Secret stored before encryption was turned on; the v1alpha1-generated config
# always carried it.
#
# talhelper 3.1.17 rendered this document with the key NAMED `key1` and no
# `identity` provider. Found the hard way on 2026-09-21: applied to pegasus,
# its apiserver failed informer sync on "no matching key was found for the
# provided Secretbox transformer" and stayed NotReady until this exact shape was
# applied by hand. No data was lost -- all 1241 Secrets still list cleanly
# through every apiserver -- because a NotReady apiserver drops out of the
# `kubernetes` endpoints and never took the writes.
#
# Under TOPF it is still needed, but for half the reason. Upstream fixed the key
# name ("fix: generate backwards compatible etcd encryption config", 1.14.0),
# and TOPF 0.6.1's machinery (v1.14.1) does generate `key2` -- but still WITHOUT
# `identity: {}`. Tested 2026-10-19 by rendering with this file and the delete
# removed and comparing against the live config. If a later TOPF generates
# key2 + identity itself, this file and the delete can both go -- check the
# rendered KubeEtcdEncryptionConfig against
# /system/secrets/kubernetes/kube-apiserver/encryptionconfig.yaml on a control
# plane before removing them.
#
# The secret is NOT in git. TALOS_SECRETBOX_ENCRYPTION_SECRET is exported by
# the `talos:*` tasks from talsecret.sops.yaml at render time (TOPF templates
# cannot read the secrets bundle), and this template refuses to render without
# it rather than rendering an empty key.
{{- $secretbox := env "TALOS_SECRETBOX_ENCRYPTION_SECRET" }}
{{- if not $secretbox }}{{ fail "TALOS_SECRETBOX_ENCRYPTION_SECRET is unset -- run through `mise run talos:...`, which reads it from talsecret.sops.yaml" }}{{ end }}
apiVersion: v1alpha1
kind: KubeEtcdEncryptionConfig
config:
  resources:
    - resources:
        - secrets
      providers:
        - secretbox:
            keys:
              - name: key2
                secret: {{ $secretbox }}
        - identity: {}
