# The node's hostname is its `host` in topf.yaml. talhelper set this from
# `hostname:` implicitly; TOPF uses `host` only as a label for selection and
# logging, so without this document the first apply renames every node to a
# generated talos-xxx-xxx name.
apiVersion: v1alpha1
kind: HostnameConfig
auto: "off"
hostname: {{ .Node.Host }}
