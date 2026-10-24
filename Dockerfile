# syntax=docker/dockerfile:1.7
# The game server image (GDD section 11: ECS on Fargate, Graviton).
# Build from the repository root, because the server reads content/ and its
# migrations relative to its compiled files:
#   docker build --platform linux/arm64 -t long-boil-server .
# Only the rules and server workspaces are installed; the Expo client's
# dependencies never enter the image.

ARG NODE_IMAGE=node:22.23.4-bookworm-slim

# --- Build: compile rules and server with the dev dependencies -------------
FROM --platform=linux/arm64 ${NODE_IMAGE} AS build
WORKDIR /app/engine
# Every workspace's package.json, including the client's, so the lockfile
# matches; --workspace then limits the install to rules and server.
COPY engine/package.json engine/package-lock.json ./
COPY engine/packages/rules/package.json packages/rules/
COPY engine/packages/server/package.json packages/server/
COPY engine/packages/client/package.json packages/client/
RUN npm ci --workspace @long-boil/rules --workspace @long-boil/server --include-workspace-root --no-audit --no-fund
COPY engine/tsconfig.base.json ./
COPY engine/packages/rules/tsconfig.json packages/rules/
COPY engine/packages/rules/src packages/rules/src
COPY engine/packages/server/tsconfig.json packages/server/
COPY engine/packages/server/src packages/server/src
RUN npm run build

# --- Production dependencies only ------------------------------------------
FROM --platform=linux/arm64 ${NODE_IMAGE} AS deps
WORKDIR /app/engine
COPY engine/package.json engine/package-lock.json ./
COPY engine/packages/rules/package.json packages/rules/
COPY engine/packages/server/package.json packages/server/
COPY engine/packages/client/package.json packages/client/
RUN npm ci --omit=dev --workspace @long-boil/rules --workspace @long-boil/server --no-audit --no-fund

# --- Runtime ----------------------------------------------------------------
FROM --platform=linux/arm64 ${NODE_IMAGE}
ENV NODE_ENV=production
# Aurora's certificates are signed by the RDS CA, which is not in Node's own
# store. With this bundle trusted, PGSSLMODE=require makes node-pg verify the
# certificate chain and the host name (node-pg treats require as verify-full
# unless uselibpqcompat is set).
# Into a directory that already exists: ADD --chmod would also apply to any
# parent it had to create, locking the node user out of it.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /usr/local/share/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/rds-global-bundle.pem
WORKDIR /app
COPY --from=deps /app/engine/node_modules engine/node_modules
COPY engine/package.json engine/
COPY engine/packages/rules/package.json engine/packages/rules/
COPY --from=build /app/engine/packages/rules/dist engine/packages/rules/dist
COPY engine/packages/server/package.json engine/packages/server/
COPY --from=build /app/engine/packages/server/dist engine/packages/server/dist
COPY engine/packages/server/migrations engine/packages/server/migrations
COPY content content
# The image's own unprivileged user; nothing under /app is writable by it.
USER node
EXPOSE 3000
CMD ["node", "engine/packages/server/dist/main.js"]
