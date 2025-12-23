# Definition File

Example: docker/_common/prometheus/definition.yaml

This file defines a few things that are useful for app information.

## Authentik

It defines the application, the url, icon, definition, etc.

This definition is used to create authentik applications via pulumi.  This also allows us to setup proxy auth or oidc auth.  When encountering an oidc configuration that configuration will be used to create the config, and generate a client id, and client secret.  That secret is then set in 1password as `${CLUSTER_CNAME}-[[metadata.name]]-oidc-credentials`.

## Gatus / Uptime

There can also be a few definitions for uptime usage, so that the application state or other things like dns can be monitored by the alpha-site gatus instance.

