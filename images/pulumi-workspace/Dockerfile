# The Pulumi operator workspace image: upstream pulumi-nodejs plus everything
# a workspace run used to download, every run, onto the node's /var.
# docs/kubernetes/pulumi-workspace-image.md is the long version.
#
# This file is the LOCAL build, from the repository root:
#
#   docker build --platform linux/amd64 -f images/pulumi-workspace/Dockerfile .
#
# The forge does not run it. .forgejo/workflows/pulumi-workspace-image.yml runs
# the same ./bake.sh with this same base as its job container and appends the
# result as one layer (./append-layer.sh), because building a Dockerfile on the
# forge's runners would need their privileged Docker daemon. Both builds come
# out as this base plus one layer of the same files; change what goes into the
# image in bake.sh, not here.
#
# The FROM line is the image's version: ./tag.sh reads it, the workflow makes it
# the job container, and Renovate bumps it. No digest: pulumi-nodejs tags are
# immutable releases, and the workflow resolves and records the digest it
# built on.
FROM ghcr.io/pulumi/pulumi-nodejs:3.270.0@sha256:b9587e3ed318d0e1e3d4d05560f061e8cd3e81929433bfdb82bba1ad74e27e85

# Only what ./inputs.sh lists gets this far (./Dockerfile.dockerignore).
COPY . /tmp/bake-context
RUN /tmp/bake-context/images/pulumi-workspace/bake.sh /tmp/bake-context \
 && rm -rf /tmp/bake-context
