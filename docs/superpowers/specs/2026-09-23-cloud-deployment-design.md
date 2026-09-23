# Nhuu-chat Cloud Deployment Design

## Goal

Deploy Nhuu-chat to public cloud services using Vercel for the Vite frontend and Railway for the Express API and Redis, while keeping MongoDB on Atlas.

## Architecture

- Vercel builds and serves the static Vite app from `apps/web` in this pnpm monorepo.
- Railway builds and runs the API from the repository root using `apps/api/Dockerfile`; Railway Redis is a separate private service in the same Railway project/environment.
- MongoDB Atlas remains the database; no database migration or MongoDB container is part of deployment.
- `VITE_API_URL` points the browser to the Railway API's public HTTPS origin. The API allows the exact Vercel/custom frontend origin in `WEB_ALLOWED_ORIGINS` and uses it as `WEB_APP_URL`.
- For production browser authentication, use custom subdomains under the same registrable domain, such as `app.example.com` and `api.example.com`, so the API's Secure auth cookies are not treated as third-party cookies. Configure `AUTH_COOKIE_SAME_SITE=lax` for these same-site, cross-origin subdomains.
- The app is a pnpm workspace. Vercel's project root is `apps/web`, with source outside the root enabled so the shared `packages/contracts` workspace is available during build. Railway's service root is the repository root and its Dockerfile path is `apps/api/Dockerfile`.

## Runtime Configuration

Railway API variables include `NODE_ENV=production`, Railway `PORT`, `MONGODB_URI`, `REDIS_URL` referenced from the Railway Redis service, `JWT_SECRET`, `ENCRYPTION_KEY`, required Telegram token/secret variables, `WEB_APP_URL`, `WEB_ALLOWED_ORIGINS`, and optional integrations from `.env.example`. Vercel receives `VITE_API_URL` as a build-time environment variable set to the API's public HTTPS URL.

The API returns credentialed CORS responses only for configured origins and applies origin protection to mutations. Socket.IO uses the same `VITE_API_URL` as REST requests. Production verification must exercise login/session refresh, API requests, Socket.IO, OAuth callback URLs that are enabled, and `/health`.

## Source and Release Safety

- Deploy only an explicitly selected committed revision from `feature/nhuu-chat-mvp`; never include the current uncommitted worktree changes by accident.
- Vercel and Railway Git integration require the selected revision to be present on the connected remote branch. Pushing to that branch may trigger deployment according to each service's branch settings.
- Do not send secrets in chat or commit them. Set all secrets in the providers' environment variable settings.

## Acceptance Criteria

1. `apps/web` builds on Vercel from the pnpm monorepo and static routes fall back to the SPA entry point.
2. Railway builds the API Docker image from repository-root context and the API listens on Railway's injected `PORT`.
3. Railway Redis is private to the project and the API receives its `REDIS_URL` by service reference.
4. Vercel browser traffic reaches the Railway API and Socket.IO over HTTPS with credentialed CORS and working secure cookie login on the configured custom subdomains.
5. MongoDB remains Atlas; no actual database URI or provider secret is written to repository files.
6. The public health endpoint returns `{ "status": "ok", "service": "nhuu-chat" }` and a production login/session smoke check succeeds.
