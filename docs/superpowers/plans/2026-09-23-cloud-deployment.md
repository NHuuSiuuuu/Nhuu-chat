# Nhuu-chat Vercel and Railway Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Nhuu-chat for a production deployment with the Vite frontend on Vercel, API and Redis on Railway, and MongoDB Atlas unchanged.

**Architecture:** Vercel builds the web workspace from `apps/web`, with the monorepo shared package available. Railway builds the API from repository root via `apps/api/Dockerfile` and provides a private Redis service. Custom frontend and API subdomains under one domain preserve same-site cookie behavior while frontend/API remain cross-origin.

**Tech Stack:** Vercel, Railway, Docker, Node.js 22, pnpm 12.3.4, MongoDB Atlas, Railway Redis.

**Spec:** `docs/superpowers/specs/2026-09-23-cloud-deployment-design.md`

## Global Constraints

- MongoDB Atlas remains the production database; do not add a MongoDB container or migrate data.
- Vercel project root is `apps/web`; enable access to source files outside the root for shared workspace packages.
- Railway API service uses repository root as service root and `apps/api/Dockerfile` as its Dockerfile path.
- Keep Redis private in the same Railway project/environment as the API.
- Set `VITE_API_URL` to the API HTTPS URL at Vercel build time; set exact `WEB_APP_URL` and `WEB_ALLOWED_ORIGINS` on Railway.
- Use `AUTH_COOKIE_SAME_SITE=lax` with frontend/API custom subdomains under the same registrable domain.
- Deploy only committed code from `feature/nhuu-chat-mvp`; do not stage or deploy pre-existing user worktree changes.
- Never commit or print production secrets.

---

### Task 1: Add the Railway API Docker image

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: repository root build context, pnpm 12.3.4 workspace and lockfile, API runtime variables injected by Railway.
- Produces: API container running `pnpm --filter api start` on Railway's injected `PORT`, with Railway Redis host configured in `REDIS_URL`.

- [ ] **Step 1: Confirm API image definition is absent**

Run: `test ! -f apps/api/Dockerfile`
Expected: exit 0 because no API Dockerfile exists yet.

- [ ] **Step 2: Add a root-context workspace Dockerfile**

Use `node:22-bookworm-slim`, enable Corepack and activate `pnpm@12.3.4`, set `/app` as working directory, copy repository source and workspace manifests, run `pnpm install --frozen-lockfile`, and use `CMD ["pnpm", "--filter", "api", "start"]`. Do not hard-code `PORT`; `apps/api/src/server.ts` already reads the validated `PORT` environment value. Run as the non-root `node` account.

- [ ] **Step 3: Exclude secrets and local artifacts from Docker context**

Add `.dockerignore` entries for `.git`, `.env`, `.env.*`, local `node_modules`, nested `node_modules`, `dist`, `coverage`, `.worktrees`, and `.superpowers`. Do not exempt a production env file. Production variables are injected by Railway.

- [ ] **Step 4: Build from committed source and run a safe startup check**

Commit only `.dockerignore` and `apps/api/Dockerfile` first, then run `git archive HEAD | sudo docker build -f apps/api/Dockerfile -t nhuu-chat-api:local -`. Expected: build exits 0 and image config has no service credentials. Start a local test container only with placeholder test values and a test Redis container; confirm the API binds the supplied `PORT` and `/health` responds. Do not connect to production Atlas.

- [ ] **Step 5: Commit the API image definition**

Run: `git add .dockerignore apps/api/Dockerfile && git commit -m "build(api): add Railway Docker image"`.

### Task 2: Configure the Vercel SPA project

**Files:**
- Create: `apps/web/vercel.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: existing `pnpm --filter web build`, Vercel build-time `VITE_API_URL`, and workspace package `@nhuu-chat/contracts`.
- Produces: Vercel build settings for root `apps/web`, `dist` output, SPA fallback, and same-origin Socket.IO/REST API base from configured Vercel env.

- [ ] **Step 1: Confirm Vercel SPA configuration is absent**

Run: `test ! -f apps/web/vercel.json`
Expected: exit 0 because no Vercel project config exists yet.

- [ ] **Step 2: Add Vercel SPA routing config**

Create `apps/web/vercel.json` with framework `vite`, build command `pnpm build`, output directory `dist`, and a catch-all rewrite to `/index.html` for React Router paths. Do not define `VITE_API_URL` in this file; it is a sensitive deployment-specific URL and belongs in Vercel project environment settings.

- [ ] **Step 3: Validate the web build and config JSON**

Run: `pnpm --filter web build` and `node -e 'JSON.parse(require("node:fs").readFileSync("apps/web/vercel.json", "utf8"))'`.
Expected: web build exits 0 and JSON parsing exits 0. Inspect the resulting bundle and confirm no API secret or production environment file is included.

- [ ] **Step 4: Commit Vercel configuration**

Run: `git add apps/web/vercel.json README.md && git commit -m "build(web): configure Vercel SPA deployment"`.

### Task 3: Document provider settings and environment values

**Files:**
- Create: `docs/deployment/vercel-railway.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-23-cloud-deployment-design.md`

**Interfaces:**
- Consumes: API env schema, cookie/CORS behavior, `VITE_API_URL`, and service references between Railway API and Redis.
- Produces: exact dashboard configuration for Vercel project root/build/output settings, Railway Dockerfile path and Redis service, custom DNS domains, environment variables, and smoke tests.

- [ ] **Step 1: Record the platform variable map**

Document Vercel `VITE_API_URL=https://api.<owned-domain>` for Production and Preview as appropriate. Document Railway `NODE_ENV=production`, `MONGODB_URI`, referenced `REDIS_URL`, `JWT_SECRET` (at least 32 characters), `ENCRYPTION_KEY` (at least 32 characters), required `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (at least 16 characters), `WEB_APP_URL=https://app.<owned-domain>`, `WEB_ALLOWED_ORIGINS=https://app.<owned-domain>`, `AUTH_COOKIE_SAME_SITE=lax`, and optional integrations copied by name from `.env.example`.

- [ ] **Step 2: Document exact provider configuration**

Document Vercel Root Directory `apps/web`, Include source files outside Root Directory enabled, Build Command `pnpm build`, Output Directory `dist`, and the `apps/web/vercel.json` SPA rewrite. Document Railway API service root directory `.`, Dockerfile path `apps/api/Dockerfile`, health path `/health`, private Railway Redis in the same project/environment, and Redis reference variable `${{Redis.REDIS_URL}}` adjusted to the actual service name.

- [ ] **Step 3: Document DNS, account, branch, and rollback requirements**

Document custom domains such as `app.example.com` for Vercel and `api.example.com` for Railway, required DNS records from each provider, MongoDB Atlas IP access, the selected GitHub branch, and that pushing it may trigger deployments. Explain rollback by redeploying the prior known-good commit through provider dashboards. Never include real credentials.

- [ ] **Step 4: Document production smoke checks**

Include `curl -fsS https://api.<owned-domain>/health`; verify the returned JSON; check the Vercel site loads and refreshes a nested route; test login, refresh, logout, cookie attributes, credentialed CORS, API requests, and Socket.IO; verify Caddy is not involved and check Railway logs for DB/Redis connections without printing secrets.

- [ ] **Step 5: Review and commit provider guide**

Run `git diff --check`, compare every required variable to `packages/config/src/env.ts`, then commit only the provider guide, README deployment link, and cloud spec with message `docs: specify Vercel and Railway deployment`.

### Task 4: Verify deployment artifacts and prepare production handoff

**Files:**
- No additional repository files.

**Interfaces:**
- Consumes: committed API Dockerfile, Vercel config, provider guide, and user-selected production branch/domains/accounts.
- Produces: a Docker-verified API image and exact provider setup checklist; live deployment is reported only after provider dashboards confirm deployed status and public smoke checks pass.

- [ ] **Step 1: Recheck the worktree boundary**

Run: `git status --short`, `git diff --check`, and `git log --oneline origin/feature/nhuu-chat-mvp..HEAD`. Confirm only task commits are prepared for deployment; leave all pre-existing modified/untracked user files unstaged.

- [ ] **Step 2: Verify API Docker build from Git commit**

Run `git archive HEAD | sudo docker build -f apps/api/Dockerfile -t nhuu-chat-api:verify -` and `sudo docker image inspect nhuu-chat-api:verify`. Expected: successful image build without leaked secrets.

- [ ] **Step 3: Verify Vercel build locally**

Run `pnpm --filter web build` and validate `apps/web/vercel.json` parses. Inspect output for SPA assets and confirm API calls use the runtime-configured public API base.

- [ ] **Step 4: Connect cloud services using user-owned accounts**

Connect the repository/branch in Vercel and Railway, create Railway Redis, configure variables and custom domains, allow the server's outbound IP in Atlas, and trigger deployment. If provider login or ownership approval is required, stop at the dashboard handoff and ask the user to complete that account authorization without requesting passwords or secret values in chat.

- [ ] **Step 5: Verify the public deployment**

Confirm both provider deployment records are successful; run HTTPS health, frontend deep-link, login/session, CORS, REST API, Socket.IO and relevant OAuth checks; record exact frontend/API URLs and deployed commit.

## Self-Review

- Spec coverage: API image, Vercel static app, Railway Redis, Atlas preservation, CORS/cookies/domains, source branch safety, and live smoke checks each have a task.
- Railway service root remains repository root so workspace packages resolve; Dockerfile path is explicit.
- Vercel shared workspace source is included from the monorepo root as the Vercel guide requires.
- Secrets are only configured in provider variable settings; all existing dirty user changes stay excluded from task staging.
- No VPS, Caddy, API data migration, feature changes, or speculative CI/CD are included.
