FROM node:22-bookworm-slim AS workspace

WORKDIR /app

RUN npm install --global pnpm@12.3.4

COPY --chown=node:node . .

RUN chown node:node /app

USER node

RUN pnpm --filter api... install --prod --frozen-lockfile
RUN pnpm --filter api --prod deploy /app/deploy

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

COPY --from=workspace --chown=node:node /app/deploy/ ./

ENV NODE_ENV=production

USER node

EXPOSE 3000

CMD ["./node_modules/.bin/tsx", "src/server.ts"]
