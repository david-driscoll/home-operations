# The network map's observed-layer collector: node:24-alpine plus one layer
# holding the collector and neo4j-driver (./bake.sh). docs/network-map/schema.md
# is what it writes; kubernetes/apps/database/network-map runs it hourly.
#
# This file is the LOCAL build, from the repository root:
#
#   docker build --platform linux/amd64 -f images/network-map/Dockerfile .
#
# The forge does not run it: .forgejo/workflows/network-map-image.yml runs the
# same ./bake.sh on the runner and appends its output to the base below with
# crane (./append-layer.sh). Change what goes into the image in bake.sh.
#
# The LAST FROM line is the base both builds use: the workflow reads its
# digest from here, and Renovate bumps it.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
RUN apk add --no-cache bash
# Only what ./inputs.sh lists gets this far (./Dockerfile.dockerignore).
COPY . /src
RUN /src/images/network-map/bake.sh /src /out

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
COPY --from=build /out/app /app
USER 1000
CMD ["node", "/app/src/main.ts"]
