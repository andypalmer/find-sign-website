# Builds one of the apps in apps/: the public search site (default) or the admin app
#   docker build -t find-sign-search .
#   docker build -t find-sign-admin --build-arg APP=admin .
# The image holds no settings: give the container its environment (each app's example.env lists them),
# e.g. with env_file in deploy/compose.yaml. CI publishes both images to ghcr.io

# Stage 1: Build the application
FROM node:26-alpine AS builder
ARG APP=search
WORKDIR /app
# workspace manifests first, so dependencies stay cached until one changes
COPY package*.json ./
COPY apps/search/package.json apps/search/
COPY apps/admin/package.json apps/admin/
COPY packages/core/package.json packages/core/
COPY packages/data-io/package.json packages/data-io/
COPY packages/indexer/package.json packages/indexer/
COPY packages/test-helpers/package.json packages/test-helpers/
# records builds itself to dist/ when installed (its prepare script), so it needs its source here
COPY packages/records packages/records
RUN npm ci
COPY . .
RUN npm run build -w apps/$APP

# Stage 2: Final production image
FROM node:26-alpine
ARG APP=search
WORKDIR /app
# the build bundles the workspace packages, so only the hoisted third party modules are needed
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/$APP/build ./build
COPY --from=builder /app/apps/$APP/package.json ./package.json

# Define production environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
# SvelteKit with adapter-node outputs to the 'build' directory
CMD ["node", "build"]
