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
COPY apps/server/package.json apps/server/package.json
COPY apps/widget/package.json apps/widget/package.json
COPY packages/typescript-config packages/typescript-config
COPY patches patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter server... --filter quickvoice-widget...

FROM deps AS build
COPY apps/server/tsconfig.json apps/server/prisma.config.ts apps/server/
COPY apps/server/src apps/server/src
COPY apps/server/data apps/server/data
COPY apps/server/prisma apps/server/prisma
COPY apps/widget apps/widget
WORKDIR /app
RUN pnpm --filter quickvoice-widget build
WORKDIR /app/apps/server
ENV DATABASE_URL="postgresql://quickvoice:quickvoice@localhost:5432/quickvoice"
RUN pnpm exec prisma generate
RUN pnpm run build

FROM base AS runtime
ENV NODE_ENV=production

RUN apt-get update -y \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app server

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/server/package.json apps/server/package.json
COPY packages/typescript-config packages/typescript-config
COPY patches patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter server...
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
RUN chown -R server:nodejs /app/node_modules

WORKDIR /app/apps/server
COPY --from=build --chown=server:nodejs /app/apps/server/dist ./dist
COPY --from=build --chown=server:nodejs /app/apps/server/prisma ./prisma
COPY --from=build --chown=server:nodejs /app/apps/server/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=server:nodejs /app/apps/widget/dist /app/apps/widget/dist
RUN test -x /app/node_modules/.bin/prisma
RUN test -f /app/apps/server/dist/src/index.js
RUN test -f /app/apps/widget/dist/quickvoice-widget.js

USER server
EXPOSE 8000
CMD ["sh", "-c", "../../node_modules/.bin/prisma migrate deploy && node dist/src/index.js"]
