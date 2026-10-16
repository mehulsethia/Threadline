# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/agent/Dockerfile .
FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g bun@1.3.12 turbo@2.10.8 && npm cache clean --force
WORKDIR /repo

# Only agent and the workspace packages it depends on.
FROM base AS prune
COPY . .
RUN turbo prune agent --docker

FROM base AS build
# prisma.config.ts resolves DATABASE_URL at build time; nothing connects.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY --from=prune /repo/out/json/ .
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ .
RUN cd packages/db && bunx prisma generate

FROM base AS runtime
ENV NODE_ENV=production PORT=8080
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 8080
WORKDIR /repo/apps/agent
# The ADK worker serves the hero flows; see apps/agent/adk/worker.ts.
CMD ["bun", "adk/worker.ts"]
