# Kubernetes node labels and annotations: topf.yaml's `data.labels` /
# `data.annotations`, which is where each one's reason is written down. Was
# talconfig.yaml's nodeLabels / nodeAnnotations, i.e. `.machine.nodeLabels`;
# on Talos 1.14 they are KubeNodeConfig, which also carries the role labels and
# the control-plane NoSchedule taint Talos generates.
#
# Like everything in talos/, a label added here reaches the Node only once this
# node's config is applied (`mise run talos:apply-node <ip>`).
apiVersion: v1alpha1
kind: KubeNodeConfig
labels:
{{- range $key, $value := .Node.Data.labels }}
  {{ $key | quote }}: {{ $value | quote }}
{{- end }}
annotations:
{{- range $key, $value := .Node.Data.annotations }}
  {{ $key | quote }}: {{ $value | quote }}
{{- end }}
