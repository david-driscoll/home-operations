# Extra names on the kube-apiserver serving certificate: topf.yaml's
# `data.certSANs`, the same list all/11-machine-certsans.yaml.tpl gives the
# Talos API, so the two cannot drift apart.
#
# History: talhelper 3.1.17 SILENTLY DROPPED talconfig.yaml's
# `additionalApiServerCertSans` once talosVersion was 1.14 -- the SANs used to
# live in `.cluster.apiServer.certSANs`, the new home is this field, and
# talhelper mapped the talconfig key to neither. Caught in the
# `apply-config --dry-run` diff, before anything was applied. That is why this
# is restated by hand rather than trusted to a tool's mapping.
{{- $rootDomain := env "ROOT_DOMAIN" }}
{{- if not $rootDomain }}{{ fail "ROOT_DOMAIN is unset -- mise exports it from .config/domains.sops.yaml, which needs the age key" }}{{ end }}
apiVersion: v1alpha1
kind: KubeAPIServerConfig
certExtraSANs:
{{- range .Data.certSANs }}
  - {{ . | replace "${ROOT_DOMAIN}" $rootDomain | quote }}
{{- end }}
