# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20.19.0
ARG PNPM_VERSION=9.0.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/typescript-config packages/typescript-config
COPY patches patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter quickvoice-mcp-server...

FROM deps AS build
COPY apps/mcp-server apps/mcp-server
WORKDIR /app/apps/mcp-server
RUN pnpm run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=8787

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app mcp

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/typescript-config packages/typescript-config
COPY patches patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter quickvoice-mcp-server...
RUN rm -rf \
    /pnpm \
    /root/.cache/node \
    /usr/local/bin/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/pnpm \
    /usr/local/bin/pnpx \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /usr/local/lib/node_modules/corepack \
    /usr/local/lib/node_modules/npm

WORKDIR /app/apps/mcp-server
COPY --from=build --chown=mcp:nodejs /app/apps/mcp-server/dist ./dist
RUN test -f /app/apps/mcp-server/dist/src/index.js

USER mcp
EXPOSE 8787
CMD ["node", "dist/src/index.js"]
