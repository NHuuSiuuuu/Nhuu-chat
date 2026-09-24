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

## Facebook Messenger Inbox

The Messenger webhook is separate from Facebook Login OAuth. Configure the Meta app's **Webhooks > Page** callback as:

```text
https://api.example.com/api/v1/webhooks/facebook/messenger
```

Use HTTPS and configure the same public URL in Meta and Railway routing. Set `META_WEBHOOK_VERIFY_TOKEN` in Railway; generate a high-entropy value and enter the same value in Meta's webhook verification form. Subscribe to the Page fields `messages` and `message_echoes`. Keep `META_APP_SECRET` set to the app secret already used by Facebook Login: the API verifies `X-Hub-Signature-256` against the raw webhook body with this secret. Missing or mismatched values prevent Meta verification or event delivery.

The Dashboard OAuth flow requests `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_messaging`, and `pages_manage_metadata`. The first three preserve existing Page listing and publishing; the last two support Messenger messaging and webhook subscription. The connected Page and authorizing user must be eligible for messaging and hold the required Page task. The API registers the Page subscription when a Page connection is established; reconnect after enabling the Page webhook in the Meta app. Meta app mode, permission access level, and review requirements determine which accounts can authorize and use this integration.

Before deploying the Messenger release to an existing Atlas database, take a backup and run the applicable index migrations against production during a maintenance window. They do not run automatically at API startup:

```bash
pnpm --filter api exec tsx src/db/migrate-facebook-page-owner-index.ts
pnpm --filter api run migrate:zalo-personal-conversation-index
pnpm --filter api run migrate:facebook-conversation-customer-index
```

Run these from a maintenance shell where `MONGODB_URI` is securely injected from the Railway environment or a secret manager; do not paste the production URI into the command or shell history. The first migration detects Page IDs owned by multiple NhuuChat accounts and stops without changing ownership when conflicts need manual resolution. Resolve them through an audited operational decision, then rerun it. The second is the legacy owner-scoped conversation migration; run it only before the Facebook migration when upgrading a database that has not applied it yet. The final command installs Facebook per-customer uniqueness while preserving non-Facebook uniqueness and removes supported legacy indexes. Never run `migrate:zalo-personal-conversation-index` after `migrate:facebook-conversation-customer-index`, because it recreates a global owner-scoped index that blocks multiple Messenger customers on one Page. Verify applicable commands succeed before deploying/restarting the API.

Keep `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, Page access tokens, `MONGODB_URI`, and other credentials only in Railway backend secret variables. Never place them in Vercel/Vite variables, frontend code/storage, webhook URLs, logs, screenshots, or repository files. If exposed, rotate the verify token in both Meta and Railway; rotate the app secret in Meta and Railway together and verify delivery again. Page access tokens remain encrypted in MongoDB and are decrypted only server-side for Meta API calls.

## Smoke verification

1. Confirm Vercel and Railway report successful deployments from the intended commit.
2. Run `curl -fsS https://api.example.com/health` and confirm JSON `{ "status": "ok", "service": "nhuu-chat" }`.
3. Open `https://app.example.com`, refresh a nested route, register/login, refresh the session, and log out.
4. In browser devtools, confirm auth cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`, and API CORS returns the exact `https://app.example.com` origin with credentials enabled.
5. Open Inbox and confirm Socket.IO connects to `https://api.example.com`; verify a request to `/api/v1/auth/session` succeeds with cookies.
6. Check Railway logs for successful MongoDB and Redis connections. Do not print environment variables or full connection strings in logs or support messages.

## Source safety

Deploy only a committed revision from `feature/nhuu-chat-mvp`. Current unrelated uncommitted worktree edits are not part of this deployment. Pushing a commit to the branch linked to either provider can trigger a deployment, so confirm each provider's production/preview branch setting before pushing.
