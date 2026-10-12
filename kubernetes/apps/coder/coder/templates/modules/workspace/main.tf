# The workspace itself: the agent, the home volume and the pod.

locals {
  # A version Renovate can move, unlike the rolling workspace image tags in
  # parameters.tf. Matched by the "Annotated Terraform pins" manager in
  # .github/renovate.json5.
  # renovate: datasource=docker depName=docker
  dind_image = "docker:29-dind"
}

resource "coder_agent" "main" {
  os   = "linux"
  arch = "amd64"

  # No `dir`. The provider deprecates it, and anything but the home directory
  # breaks Coder Desktop's file sync. Terminals open in the home directory;
  # the editors below are each told `var.folder` themselves, and dev container
  # discovery finds the clones under it from there.

  # The VS Code Desktop button comes from the vscode-desktop module in ides.tf,
  # which opens `var.folder`; the built-in one would be a second button that
  # opens the home directory.
  display_apps {
    vscode                 = false
    vscode_insiders        = false
    web_terminal           = true
    ssh_helper             = true
    port_forwarding_helper = true
  }

  metadata {
    display_name = "CPU Usage"
    key          = "0_cpu_usage"
    script       = "coder stat cpu"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "RAM Usage"
    key          = "1_ram_usage"
    script       = "coder stat mem"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Home Disk"
    key          = "3_home_disk"
    script       = "coder stat disk --path $${HOME}"
    interval     = 60
    timeout      = 1
  }

  metadata {
    display_name = "CPU Usage (Host)"
    key          = "4_cpu_usage_host"
    script       = "coder stat cpu --host"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Memory Usage (Host)"
    key          = "5_mem_usage_host"
    script       = "coder stat mem --host"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Load Average (Host)"
    key          = "6_load_host"
    # Load average scaled by the number of cores.
    script   = <<-EOT
      echo "`cat /proc/loadavg | awk '{ print $1 }'` `nproc`" | awk '{ printf "%0.2f", $1/$2 }'
    EOT
    interval = 60
    timeout  = 1
  }
}

resource "kubernetes_persistent_volume_claim_v1" "home" {
  metadata {
    name      = "coder-${data.coder_workspace.me.id}-home"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"     = "coder-pvc"
      "app.kubernetes.io/instance" = "coder-pvc-${data.coder_workspace.me.id}"
    })
    annotations = {
      "com.coder.user.email" = data.coder_workspace_owner.me.email
    }
  }

  wait_until_bound = false

  spec {
    access_modes = ["ReadWriteOnce"]
    resources {
      requests = {
        storage = "${data.coder_parameter.home_disk_size.value}Gi"
      }
    }
  }
}

resource "kubernetes_deployment_v1" "main" {
  # Zero when the workspace is stopped: the pod goes, the home volume stays.
  count = data.coder_workspace.me.start_count

  depends_on       = [kubernetes_persistent_volume_claim_v1.home]
  wait_for_rollout = false

  metadata {
    name      = "coder-${data.coder_workspace.me.id}"
    namespace = var.namespace
    labels    = local.labels
    annotations = {
      "com.coder.user.email" = data.coder_workspace_owner.me.email
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = local.labels
    }

    # The home volume is ReadWriteOnce, so the old pod has to be gone before
    # the new one can mount it.
    strategy {
      type = "Recreate"
    }

    template {
      metadata {
        labels = local.labels
      }

      spec {
        # No pod-wide runAsNonRoot: the Docker sidecar has to be root, and a
        # container cannot opt out of a pod-level `runAsNonRoot: true` that
        # the kubelet has already enforced. The workspace container sets it
        # for itself below.
        security_context {
          fs_group               = 1000
          fs_group_change_policy = "OnRootMismatch"
        }

        # The Docker daemon, as a native sidecar (an init container with
        # `restartPolicy: Always`): the kubelet starts it and waits for its
        # startup probe BEFORE the workspace container, so the agent never
        # looks for a socket that is not there yet.
        #
        # Privileged is unavoidable for Docker-in-Docker -- dockerd manages
        # cgroups, mounts and iptables in its own namespace -- which is why
        # the whole thing is behind the `docker` parameter. It is the same
        # trade kubernetes/apps/coder/forgejo-runner makes in this namespace.
        dynamic "init_container" {
          for_each = local.docker ? [1] : []

          content {
            name           = "docker"
            image          = local.dind_image
            restart_policy = "Always"

            # Appended to the entrypoint's own `dockerd --host=...` list.
            #   --host   a second unix socket, in the emptyDir the workspace
            #            container shares.
            #   --group  that socket's group. 1000 is `coder` in the
            #            workspace image, so the CLI works without sudo.
            args = [
              "--host=unix://${local.docker_socket_dir}/docker.sock",
              "--group=1000",
            ]

            # KEEP THIS SET. The entrypoint always adds a TCP listener on
            # 0.0.0.0 as well, and the pod IP is reachable from the rest of
            # the cluster. With a certdir it generates a CA and starts that
            # listener with --tlsverify, so it is useless without a client key
            # nothing else has. Empty this and it becomes an unauthenticated
            # root daemon on :2375.
            env {
              name  = "DOCKER_TLS_CERTDIR"
              value = "/certs"
            }

            security_context {
              privileged      = true
              run_as_user     = 0
              run_as_non_root = false
            }

            resources {
              requests = {
                "cpu"    = "50m"
                "memory" = "256Mi"
              }
              # The containers it runs are accounted to IT, not to the
              # workspace container, so a dev container gets the same ceiling
              # the workspace was asked for.
              limits = {
                "memory" = "${data.coder_parameter.memory.value}Gi"
              }
            }

            startup_probe {
              exec {
                command = ["docker", "--host=unix://${local.docker_socket_dir}/docker.sock", "info"]
              }
              period_seconds    = 2
              failure_threshold = 60
            }

            volume_mount {
              name       = "docker-socket"
              mount_path = local.docker_socket_dir
            }

            # Image layers and container filesystems. An emptyDir: a stopped
            # workspace keeps nothing here, which is the price of not putting
            # a second volume behind every workspace.
            volume_mount {
              name       = "docker-data"
              mount_path = "/var/lib/docker"
            }

            # The same path as in the workspace container, and that is the
            # point. A dev container bind-mounts its workspace folder, and the
            # DAEMON resolves that path -- so /home/coder/src/x has to be the
            # same directory here as it is over there.
            volume_mount {
              name       = "home"
              mount_path = local.home
            }
          }
        }

        container {
          name  = "dev"
          image = data.coder_parameter.image.value
          # The image tags are rolling, so a start is also an update.
          image_pull_policy = "Always"
          command           = ["sh", "-c", coder_agent.main.init_script]

          security_context {
            run_as_user     = 1000
            run_as_non_root = true
          }

          env {
            name  = "CODER_AGENT_TOKEN"
            value = coder_agent.main.token
          }

          # On the agent PROCESS, not in `coder_agent.env`: the agent's own
          # dev container support shells out to `docker`, and that block only
          # reaches the sessions it starts.
          dynamic "env" {
            for_each = local.docker ? [1] : []
            content {
              name  = "DOCKER_HOST"
              value = "unix://${local.docker_socket_dir}/docker.sock"
            }
          }

          # Without a daemon the integration can only log errors about one.
          env {
            name  = "CODER_AGENT_DEVCONTAINERS_ENABLE"
            value = tostring(local.docker)
          }

          resources {
            requests = {
              "cpu"    = "250m"
              "memory" = "512Mi"
            }
            limits = {
              "cpu"    = data.coder_parameter.cpu.value
              "memory" = "${data.coder_parameter.memory.value}Gi"
            }
          }

          volume_mount {
            name       = "home"
            mount_path = local.home
            read_only  = false
          }

          dynamic "volume_mount" {
            for_each = local.docker ? [1] : []
            content {
              name       = "docker-socket"
              mount_path = local.docker_socket_dir
            }
          }
        }

        volume {
          name = "home"
          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim_v1.home.metadata[0].name
            read_only  = false
          }
        }

        dynamic "volume" {
          for_each = local.docker ? ["docker-socket", "docker-data"] : []
          content {
            name = volume.value
            empty_dir {}
          }
        }

        # Spread workspace pods across nodes where there is room to.
        affinity {
          pod_anti_affinity {
            preferred_during_scheduling_ignored_during_execution {
              weight = 1
              pod_affinity_term {
                topology_key = "kubernetes.io/hostname"
                label_selector {
                  match_expressions {
                    key      = "app.kubernetes.io/name"
                    operator = "In"
                    values   = ["coder-workspace"]
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
