# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=development

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY backend/package.json backend/package.json

RUN pnpm install --frozen-lockfile --prod=false --filter catalog-backend...

COPY backend backend

RUN pnpm --filter catalog-backend build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY backend/package.json backend/package.json

RUN pnpm install --frozen-lockfile --prod --filter catalog-backend...

COPY --from=build /app/backend/dist /app/backend/dist

WORKDIR /app/backend
RUN mkdir -p uploads/protected uploads/covers

EXPOSE 4000
CMD ["node", "dist/index.js"]
