# Names the Talos API (apid) serves its certificate for. Was talconfig.yaml's
# `additionalMachineCertSans`. The list is topf.yaml's `data.certSANs`, shared
# with control-plane/11-apiserver-certsans.yaml.tpl -- see the note there.
{{- $rootDomain := env "ROOT_DOMAIN" }}
{{- if not $rootDomain }}{{ fail "ROOT_DOMAIN is unset -- mise exports it from .config/domains.sops.yaml, which needs the age key" }}{{ end }}
machine:
  certSANs:
{{- range .Data.certSANs }}
    - {{ . | replace "${ROOT_DOMAIN}" $rootDomain | quote }}
{{- end }}
