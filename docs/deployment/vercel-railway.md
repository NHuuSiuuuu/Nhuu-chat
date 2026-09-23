# Deploy Nhuu-chat to Vercel and Railway

## Service layout

| Component | Provider | Public address |
| --- | --- | --- |
| React/Vite frontend | Vercel | `https://app.example.com` |
| Express API and Socket.IO | Railway | `https://api.example.com` |
| Redis coordination | Railway private service | No public address |
| MongoDB | Existing MongoDB Atlas cluster | Atlas connection string |

Use custom `app` and `api` subdomains under the same domain for production authentication. The frontend and API are cross-origin, so CORS must allow the exact frontend origin; being under one registrable domain keeps browser auth cookies same-site. Railway/Vercel generated domains can be used for an initial smoke test, but the browser may treat auth cookies between those unrelated domains as third-party cookies.

## Vercel frontend

1. Import the Nhuu-chat GitHub repository into Vercel.
2. Set **Root Directory** to `apps/web` and enable **Include source files outside of the Root Directory** so the build can read `packages/contracts` and root workspace files.
3. Use the settings in `apps/web/vercel.json`: install with pnpm, run `pnpm --filter web build`, publish `dist`, and route client-side paths to `index.html`.
4. Add the Vercel domain `app.example.com` and configure the DNS record Vercel displays.
5. Set `VITE_API_URL=https://api.example.com` in the Vercel Production environment. This is a public API origin, not a secret. Redeploy after changing it because Vite embeds it at build time.
6. Add Preview values separately if preview deployments need to call a staging API; do not point unreviewed Preview builds at production data by default.

## Railway API and Redis

1. Create a Railway project and add a private Redis database service.
2. Add the Nhuu-chat GitHub repository as an API service. Keep its **Root Directory** at the repository root and set Dockerfile path to `apps/api/Dockerfile` (`RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile` if configuring by variable).
3. Set the health check path to `/health`; generate the API public domain, then attach `api.example.com` and configure the DNS record Railway displays.
4. Set these API service variables in Railway (never in Git):

   ```dotenv
   NODE_ENV=production
   MONGODB_URI=<MongoDB Atlas URI>
   REDIS_URL=${{Redis.REDIS_URL}}
   JWT_SECRET=<random value, at least 32 characters>
   ENCRYPTION_KEY=<random value, at least 32 characters>
   TELEGRAM_BOT_TOKEN=<Telegram bot token>
   TELEGRAM_WEBHOOK_SECRET=<random value, at least 16 characters>
   WEB_APP_URL=https://app.example.com
   WEB_ALLOWED_ORIGINS=https://app.example.com
   AUTH_COOKIE_SAME_SITE=lax
   ```

   Change `Redis` in the reference expression to the exact Railway Redis service name. Railway supplies `PORT`; do not hard-code it. The API schema currently requires Telegram token and webhook-secret values at startup even if Telegram Bot is not enabled.

5. Copy optional backend integrations from `.env.example` into Railway only when those features are used. Never put their secrets in Vercel variables or frontend code.
6. In MongoDB Atlas Network Access, allow connections from the Railway service's outbound IP range. Verify the applicable Railway egress IP for the selected plan/region before restricting or opening Atlas access.

## OAuth setup

If Facebook Login is enabled, set Railway `META_OAUTH_REDIRECT_URI` to:

```text
https://api.example.com/api/v1/facebook-page/oauth/callback
```

Register the same callback URL in the Meta app settings and set Vercel `VITE_API_URL`, Railway `WEB_APP_URL`, and `WEB_ALLOWED_ORIGINS` consistently with the two domains above.

## Smoke verification

1. Confirm Vercel and Railway report successful deployments from the intended commit.
2. Run `curl -fsS https://api.example.com/health` and confirm JSON `{ "status": "ok", "service": "nhuu-chat" }`.
3. Open `https://app.example.com`, refresh a nested route, register/login, refresh the session, and log out.
4. In browser devtools, confirm auth cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`, and API CORS returns the exact `https://app.example.com` origin with credentials enabled.
5. Open Inbox and confirm Socket.IO connects to `https://api.example.com`; verify a request to `/api/v1/auth/session` succeeds with cookies.
6. Check Railway logs for successful MongoDB and Redis connections. Do not print environment variables or full connection strings in logs or support messages.

## Source safety

Deploy only a committed revision from `feature/nhuu-chat-mvp`. Current unrelated uncommitted worktree edits are not part of this deployment. Pushing a commit to the branch linked to either provider can trigger a deployment, so confirm each provider's production/preview branch setting before pushing.
