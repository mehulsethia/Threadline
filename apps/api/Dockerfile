# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/api/Dockerfile .
FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g bun@1.3.12 turbo@2.10.8 && npm cache clean --force
WORKDIR /repo

# Only api and the workspace packages it depends on.
FROM base AS prune
COPY . .
RUN turbo prune api --docker

FROM base AS build
# prisma.config.ts resolves DATABASE_URL at build time; nothing connects.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY --from=prune /repo/out/json/ .
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ .
# The API runs TypeScript directly on Bun; only the Prisma client is generated.
RUN cd packages/db && bunx prisma generate

FROM base AS runtime
ENV NODE_ENV=production PORT=8080
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 8080
WORKDIR /repo/apps/api
CMD ["bun", "src/main.ts"]
