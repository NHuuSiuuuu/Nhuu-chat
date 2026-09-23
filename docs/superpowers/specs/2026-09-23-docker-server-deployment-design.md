# Nhuu-chat Docker Server Deployment Design

## Goal

Run the committed Nhuu-chat application on one Linux server with Docker Compose, HTTPS, and the existing MongoDB Atlas database.

## Scope

- Build the web app as a static production bundle and serve it from a small web container.
- Run the API as a separate container.
- Run Redis as an internal Compose service for shared API coordination.
- Use Caddy as the public entry point. It serves the frontend, obtains HTTPS certificates for the configured domain, and proxies `/api/*` and `/socket.io/*` to the API.
- Continue using MongoDB Atlas; do not introduce a MongoDB container or migrate data.
- Keep secrets in a server-side environment file that is excluded from Git.
- Publish only the web entry point. API and Redis ports stay inside the Compose network.
- Start from the current committed source (`73c11f8`) unless a later deployment source is explicitly selected. Uncommitted worktree edits are not part of the deployment.

## Runtime Configuration

The API receives production values through environment variables, including `NODE_ENV`, `PORT`, `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, and the configured integration credentials. `WEB_APP_URL` and `WEB_ALLOWED_ORIGINS` use the deployed HTTPS origin. The browser uses the same origin for API calls and Socket.IO, so `VITE_API_URL` remains unset/empty.

Caddy routes `/api/*`, `/socket.io/*`, and `/health` to the API service and serves all other paths from the frontend container, including SPA fallback behavior. Socket.IO websocket upgrades must pass through the proxy.

## Operations

- Compose has persistent storage for Caddy certificates and Redis state.
- A deployment is built from the selected commit and started with Docker Compose.
- Health verification checks the public HTTPS site and `/health`, then confirms API logs show a successful database connection.
- Server provisioning, DNS changes, provider firewall changes, and live deployment require the user's server hostname/IP, SSH account/access, and domain.

## Out of Scope

- Moving MongoDB from Atlas to the server.
- CI/CD automation, managed container registries, Kubernetes, backups for Atlas, or production feature work.
- Deploying any uncommitted changes or pushing commits to a remote repository.

## Acceptance Criteria

1. Docker images for API and web build from the selected repository commit.
2. Compose starts API, web, Redis, and Caddy; only Caddy publishes ports 80/443.
3. Frontend, API health route, and Socket.IO share one HTTPS origin.
4. No secrets are stored in tracked files or baked into the frontend image.
5. `docker compose config` validates the production Compose configuration with documented sample values.
6. The deployment guide lists required DNS/firewall/environment setup and smoke-check commands.
