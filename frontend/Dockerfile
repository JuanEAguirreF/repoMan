# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile --filter catalog-frontend...

COPY frontend frontend

ARG VITE_API_BASE_URL=http://localhost:4000/api
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_PUBLISHABLE_KEY=
ARG VITE_LOGIN_IMAGE_URL=
ARG VITE_HEADER_IMAGE_URL=

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_LOGIN_IMAGE_URL=$VITE_LOGIN_IMAGE_URL
ENV VITE_HEADER_IMAGE_URL=$VITE_HEADER_IMAGE_URL

RUN pnpm --filter catalog-frontend build

FROM nginx:1.27-alpine AS runtime

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
