# RepoMan

Controlled file catalog platform focused on **metadata-first public access**.
Visitors can see cover images and file information, but never access the real files directly.

Repository: [github.com/JuanEAguirreF/repoMan](https://github.com/JuanEAguirreF/repoMan)

## Project Overview

RepoMan is designed for cataloging manga/lost-media archives with strict access control:

- Public users can browse published metadata and covers.
- Uploaders can publish new entries and request deletion of their own files.
- Super admins review deletion requests and manage the full catalog.
- Real files are stored on server disk and remain private.

## Core Stack

- Frontend: React + Vite
- Backend: Fastify (TypeScript)
- Auth + DB: Supabase (Auth + Postgres)
- Public covers: Cloudinary (optimized AVIF)
- Deployment: Docker + Portainer (webhook CI/CD)

## Security Model

- No public file download endpoint.
- No public preview endpoint for original files.
- Files are stored outside public static paths.
- Authorization is enforced in backend (never trusted from frontend).
- Role-based access:
  - `super_admin`
  - `uploader`
  - public visitor (no login)

## Monorepo Structure

```txt
repoMan/
  backend/                  # Fastify API
  frontend/                 # React catalog UI
  supabase/                 # SQL schema and migrations
  deploy/                   # Portainer stack example
  .github/workflows/        # CI/CD workflows
```

## Local Development

### Clone

```bash
git clone https://github.com/JuanEAguirreF/repoMan.git
cd repoMan
```

### 1. Requirements

- Node.js 22+
- pnpm
- Supabase project
- Cloudinary account

### 2. Install

```bash
pnpm install
```

### 3. Configure environment

Backend:

```bash
cp backend/.env.example backend/.env
```

Frontend:

```bash
cp frontend/.env.example frontend/.env
```

### 4. Run migrations

```bash
pnpm run migrate
```

### 5. Run apps

Terminal 1:

```bash
pnpm run dev:be
```

Terminal 2:

```bash
pnpm run dev:fe
```

## Production Deployment (Portainer)

This repository includes:

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `deploy/portainer-stack.yml`
- `.github/workflows/deploy-portainer.yml`

### CI/CD flow

1. Push to `main`
2. GitHub Actions builds and pushes images to GHCR:
   - `ghcr.io/<owner>/repoman-backend:latest`
   - `ghcr.io/<owner>/repoman-frontend:latest`
3. Workflow triggers Portainer stack webhook
4. Portainer redeploys updated stack

### Required GitHub Secrets

- `PORTAINER_STACK_WEBHOOK_URL`
- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_LOGIN_IMAGE_URL` (optional)
- `VITE_HEADER_IMAGE_URL` (optional)

### Portainer Runtime Variables

- Configure backend runtime vars directly in Portainer (`SUPABASE_*`, `CLOUDINARY_*`, limits, etc.).
- Set `PROXY_NETWORK` to your reverse proxy Docker network name (default in stack: `coolify`).
- Set routing variables:
  - `APP_DOMAIN=repoman.comunidaddelmanga.com`
  - `API_DOMAIN=api.repoman.comunidaddelmanga.com`
  - `TRAEFIK_CERTRESOLVER=letsencrypt` (or your resolver name in Coolify)
- This stack does not expose host ports for RepoMan services; traffic must come through your existing reverse proxy on 80/443.

## Notes on Copyright & Access

- RepoMan is built as a catalog/indexing platform.
- Public interface is metadata-only.
- File access remains restricted by backend policy.

## Author

- **juaneaguirref**
- Website: [juan.webmasterpersonal.com](https://juan.webmasterpersonal.com)

## License

This project is licensed under **CC BY-NC 4.0** (Attribution-NonCommercial).

- You can use, share, and modify the code.
- You must provide attribution to the original author.
- Commercial use is not allowed.

See [LICENSE](/D:/Proyectos/repoMan/LICENSE) for details.
