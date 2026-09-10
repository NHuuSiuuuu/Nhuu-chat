# API Layered Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor every HTTP-facing API module into discoverable global `routes`, `controllers`, `services`, and `schemas` directories without changing API behavior.

**Architecture:** Routes register paths, middleware, and controller handlers. Controllers own the Express boundary and call services; Zod schemas validate request input; services own business operations and persistence. Platform adapters, models, realtime, AI, jobs, and common infrastructure remain in their existing directories.

**Tech Stack:** Node.js, Express 5, TypeScript, Zod, Mongoose, Vitest, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-10-api-layered-structure-design.md`

## Global Constraints

- Preserve URL paths, HTTP methods, status codes, response payloads, and error codes.
- Preserve authentication, role checks, access filters, security middleware, database schemas, indexes, realtime events, and Telegram behavior.
- Do not add dependencies, edit environment files, change secrets, or modify unrelated dirty files.
- `routes/` must not import Mongoose models, provider clients, or application service implementations directly.
- Services must not import Express `Request` or `Response`.
- Run focused tests after each task and `pnpm --filter api test`, TypeScript compilation, and `git diff --check` before handoff.

### Task 1: Add architecture guard and API layer directories

**Files:**
- Create: `apps/api/src/architecture/layer-boundaries.test.ts`
- Create: `apps/api/src/routes/.gitkeep` only if required by the implementation tooling; remove it once real route files exist.
- Create: `apps/api/src/controllers/`
- Create: `apps/api/src/services/`
- Create: `apps/api/src/schemas/`

**Interfaces:**
- Produces a structural test that later tasks must satisfy.

- [ ] **Step 1: Write the failing architecture test**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = join(process.cwd(), "src");
const filesUnder = (directory: string): string[] =>
  readdirSync(join(apiRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });

describe("API layer boundaries", () => {
  it("keeps HTTP routes in the global routes directory", () => {
    const routeFiles = filesUnder("routes").filter((file) => file.endsWith(".ts"));
    expect(routeFiles.length).toBeGreaterThan(0);
    for (const feature of ["auth", "conversations", "messages", "customers", "knowledge", "channels/telegram", "channels/telegram-personal"]) {
      expect(filesUnder(feature).some((file) => file.endsWith(".routes.ts"))).toBe(false);
    }
  });

  it("does not let route modules import models or services", () => {
    for (const file of filesUnder("routes").filter((path) => path.endsWith(".ts"))) {
      const source = readFileSync(join(apiRoot, file), "utf8");
      expect(source).not.toMatch(/from ["'][^"']*models\//);
      expect(source).not.toMatch(/from ["'][^"']*\.service\.js["']/);
    }
  });
});
```

- [ ] **Step 2: Run the guard and verify it fails for the current layout**

Run: `pnpm --filter api exec vitest run src/architecture/layer-boundaries.test.ts`

Expected: FAIL because the global `routes/` directory and the required layer boundaries do not yet exist.

- [ ] **Step 3: Create the three global directories and keep the test unchanged**

Create `apps/api/src/routes`, `apps/api/src/controllers`, and `apps/api/src/services`. Do not add compatibility wrapper files in the old feature directories.

- [ ] **Step 4: Run the focused test again**

Run: `pnpm --filter api exec vitest run src/architecture/layer-boundaries.test.ts`

Expected: It still fails on old route locations; this confirms the guard is detecting the intended migration gap rather than passing vacuously.

- [ ] **Step 5: Commit the guard**

```bash
git add apps/api/src/architecture/layer-boundaries.test.ts
git commit -m "test: guard api layer boundaries"
```

### Task 2: Migrate auth, customers, knowledge, and provider-secret layers

**Files:**
- Create: `apps/api/src/routes/auth.routes.ts`
- Create: `apps/api/src/routes/customers.routes.ts`
- Create: `apps/api/src/routes/knowledge.routes.ts`
- Create: `apps/api/src/controllers/auth.controller.ts`
- Create: `apps/api/src/controllers/customers.controller.ts`
- Create: `apps/api/src/controllers/knowledge.controller.ts`
- Create: `apps/api/src/schemas/auth.schemas.ts`
- Create: `apps/api/src/schemas/customers.schemas.ts`
- Create: `apps/api/src/schemas/knowledge.schemas.ts`
- Move: `apps/api/src/auth/auth.service.ts` → `apps/api/src/services/auth.service.ts`
- Move: `apps/api/src/models/provider-secret.service.ts` → `apps/api/src/services/provider-secret.service.ts`
- Move: `apps/api/src/knowledge/knowledge.service.ts` → `apps/api/src/services/knowledge.service.ts`
- Create: `apps/api/src/services/customer.service.ts`
- Modify: `apps/api/src/auth/auth.middleware.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/architecture/layer-boundaries.test.ts`

**Interfaces:**
- Controllers export Express handlers: `register`, `login`, `refresh`, `updateCustomerTags`, `createKnowledge`, and `removeKnowledge`.
- Schemas export Zod schemas for auth body, customer tags/id, knowledge body, and knowledge id.
- Services preserve existing exports: `hashPassword`, `verifyPassword`, `issueTokens`, `verifyAccessToken`, `register`, `login`, `rotateRefreshToken`, `ingestKnowledge`, `deleteKnowledge`, and provider-secret functions.

- [ ] **Step 1: Add failing schema boundary tests**

Create `apps/api/src/schemas/http.schemas.test.ts` with concrete validation cases before implementing the schemas:

```ts
import { describe, expect, it } from "vitest";
import { registerSchema } from "./auth.schemas.js";
import { customerTagsSchema } from "./customers.schemas.js";
import { knowledgeInputSchema } from "./knowledge.schemas.js";

describe("HTTP schemas", () => {
  it("rejects a registration password shorter than eight characters", () => {
    expect(registerSchema.safeParse({ name: "A", email: "a@example.com", password: "short" }).success).toBe(false);
  });

  it("rejects customer tags that are not strings", () => {
    expect(customerTagsSchema.safeParse({ tags: ["vip", 3] }).success).toBe(false);
  });

  it("requires title and content for knowledge ingestion", () => {
    expect(knowledgeInputSchema.safeParse({ title: "", content: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the new imports fail**

Run: `pnpm --filter api exec vitest run src/auth src/customers src/knowledge`

Expected: FAIL because the global controllers, schemas, and service paths do not exist.

- [ ] **Step 3: Move service implementations and create schemas**

Move implementations without changing exported function signatures. Extract the current inline checks into Zod schemas. `auth.service.ts` remains responsible for JWT/password/database work; `customer.service.ts` owns the `CustomerModel.findByIdAndUpdate` operation; `knowledge.service.ts` continues to accept `EmbeddingProvider` and `VectorStore` as arguments.

- [ ] **Step 4: Implement controllers and routes**

Routes should only compose `Router`, `requireRole`, schema/controller middleware, and controller handlers. Controllers should call `safeParse`/`parse`, convert validation failures to `AppError(400, "INVALID_REQUEST", ...)`, call services, and send the same status and JSON body as the existing handlers.

- [ ] **Step 5: Update auth middleware and application wiring**

Change `auth.middleware.ts`, `realtime/socket.ts`, Telegram imports, tests, and `app.ts` to import `services/auth.service.ts` and the new route modules. Remove the old route files after all imports are migrated.

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm --filter api exec vitest run src/auth src/customers src/knowledge src/architecture/layer-boundaries.test.ts`

Expected: PASS with no old auth/customer/knowledge route files remaining.

```bash
git add apps/api/src
git commit -m "refactor: layer auth customer and knowledge api"
```

### Task 3: Migrate conversations and messages

**Files:**
- Create: `apps/api/src/routes/conversations.routes.ts`
- Create: `apps/api/src/routes/messages.routes.ts`
- Create: `apps/api/src/controllers/conversations.controller.ts`
- Create: `apps/api/src/controllers/messages.controller.ts`
- Create: `apps/api/src/schemas/conversation.schemas.ts`
- Create: `apps/api/src/schemas/message.schemas.ts`
- Move: `apps/api/src/conversations/conversation.service.ts` → `apps/api/src/services/conversation.service.ts`
- Move: `apps/api/src/messages/message.service.ts` → `apps/api/src/services/message.service.ts`
- Modify: `apps/api/src/channels/telegram/telegram.service.ts`
- Modify: `apps/api/src/channels/telegram-personal/telegram-personal.service.ts`
- Modify: `apps/api/src/app.ts`
- Test: existing conversation/message tests plus controller tests

**Interfaces:**
- `conversation.service.ts` continues to export `listConversations`, `updateAssignment`, `updateStatus`, `markConversationRead`, and `toConversation`.
- `message.service.ts` continues to export `listMessages`, `toMessage`, and `createOutboundMessage`.
- Controllers expose handlers for list conversations, list messages, mark read, assignment, status, and outbound send.

- [ ] **Step 1: Add failing schema tests for controller inputs**

Create `apps/api/src/schemas/conversation-message.schemas.test.ts` and assert that pagination accepts omitted values, rejects `page=0`, status accepts only `open|pending|closed`, and outbound input requires a string `conversationId` and `type: "text"`. These are real input behaviors, not assertions on mocks. Keep access checks equivalent to the current handlers.

- [ ] **Step 2: Run tests to verify the expected red state**

Run: `pnpm --filter api exec vitest run src/conversations src/messages`

Expected: FAIL for the new controller/schema imports before implementation.

- [ ] **Step 3: Move the two services and update cross-domain imports**

Move the files with `git mv`. Update Telegram inbound code and personal Telegram code to import serializers from `services/conversation.service.ts` and `services/message.service.ts`; update the auth type import to `services/auth.service.ts`.

- [ ] **Step 4: Extract schemas and controllers**

Put query parsing, route id normalization, body validation, and allowed status values in schemas. Keep conversation access filtering and persistence in the service/controller boundary exactly as it works today. Keep Socket.IO emission in the controller as response orchestration, using the same event names and recipients.

- [ ] **Step 5: Replace the old routes and run focused tests**

Run: `pnpm --filter api exec vitest run src/conversations src/messages src/architecture/layer-boundaries.test.ts`

Expected: PASS; no `conversations/conversation.routes.ts` or `messages/message.routes.ts` remains.

- [ ] **Step 6: Commit the migration**

```bash
git add apps/api/src
git commit -m "refactor: layer conversation and message api"
```

### Task 4: Migrate Telegram bot and Telegram personal HTTP modules

**Files:**
- Create: `apps/api/src/routes/channels/telegram.routes.ts`
- Create: `apps/api/src/routes/channels/telegram-personal.routes.ts`
- Create: `apps/api/src/controllers/telegram.controller.ts`
- Create: `apps/api/src/controllers/telegram-personal.controller.ts`
- Create: `apps/api/src/schemas/telegram.schemas.ts`
- Create: `apps/api/src/schemas/telegram-personal.schemas.ts`
- Move: `apps/api/src/channels/telegram/telegram.routes.ts` → `apps/api/src/routes/channels/telegram.routes.ts`
- Move: `apps/api/src/channels/telegram-personal/telegram-personal.routes.ts` → `apps/api/src/routes/channels/telegram-personal.routes.ts`; place its four handlers in `apps/api/src/controllers/telegram-personal.controller.ts`
- Move: `apps/api/src/channels/telegram/telegram.service.ts` → `apps/api/src/services/telegram.service.ts`
- Move: `apps/api/src/channels/telegram-personal/telegram-personal.service.ts` → `apps/api/src/services/telegram-personal.service.ts`
- Keep: `apps/api/src/channels/telegram/telegram.client.ts`, `telegram.normalizer.ts`, and schemas that describe Telegram provider payloads when they are not HTTP request schemas
- Keep: `apps/api/src/channels/telegram-personal/telegram-personal.auth.ts` and `telegram-personal.model.ts`
- Modify: `apps/api/src/server.ts`, `apps/api/src/app.ts`, and affected Telegram tests

**Interfaces:**
- Preserve `ingestTelegramUpdate`, `registerTelegramChannel`, `orchestrateTelegramReply`, `startPersonalQrLogin`, `getPersonalQrLoginStatus`, `submitPersonalQrPassword`, `getPersonalSessionStatus`, `getActivePersonalClient`, and `restoreActivePersonalClients` exports after their move.
- Route paths remain `/api/v1/channels/telegram` and `/api/v1/channels/telegram-personal`.

- [ ] **Step 1: Add failing schema tests for webhook and QR inputs**

Create `apps/api/src/schemas/telegram-personal.schemas.test.ts` with these cases: a blank 2FA password is rejected, a non-string QR id is rejected, and a valid password body is accepted. Keep webhook secret verification, role checks, and successful delegation covered by the existing integration tests plus the controller tests added during implementation.

- [ ] **Step 2: Run the focused tests and confirm red**

Run: `pnpm --filter api exec vitest run src/channels/telegram src/channels/telegram-personal`

Expected: New controller/schema imports fail before implementation.

- [ ] **Step 3: Extract request schemas and controller handlers**

Keep webhook secret verification and request validation at the HTTP boundary. Keep Telegram client/session restoration, inbound normalization, persistence, and outbound delivery in the service/adapter layers. The 2FA password must continue to be passed in memory only.

- [ ] **Step 4: Move route/service files and update imports**

Use `git mv` for complete moves, then update `app.ts`, `server.ts`, tests, and cross-domain imports. Do not move platform adapter files merely to make the tree look uniform.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm --filter api exec vitest run src/channels/telegram src/channels/telegram-personal src/architecture/layer-boundaries.test.ts`

Expected: PASS with no feature-local `*.routes.ts` files in the HTTP modules.

```bash
git add apps/api/src
git commit -m "refactor: layer telegram api modules"
```

### Task 5: Finish wiring, documentation, and structural cleanup

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: affected imports in `apps/api/src/realtime/socket.ts`, channel adapters, and tests
- Modify: `CHANGELOG.md` under `## [Chưa phát hành]` → `### Đã thay đổi`
- Test: `apps/api/src/architecture/layer-boundaries.test.ts`

**Interfaces:**
- `createApp()` mounts the same routers at the same prefixes.
- `startServer()` restores personal Telegram clients through `services/telegram-personal.service.ts`.

- [ ] **Step 1: Add a route registration test**

Create `apps/api/src/app.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("API route registration", () => {
  it("keeps the health endpoint available", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "nhuu-chat" });
  });

  it("keeps the conversations API prefix registered", async () => {
    const response = await request(createApp()).get("/api/v1/conversations");
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the route registration test before cleanup**

Run: `pnpm --filter api exec vitest run src/app.test.ts src/server.lifecycle.test.ts`

Expected: The existing route/application tests identify any stale import or registration path.

- [ ] **Step 3: Remove obsolete feature-local HTTP files and service under models**

Confirm with `rg --files apps/api/src | rg '(routes|service)\.ts$'` that only approved infrastructure services remain outside `routes/`, `controllers/`, and `services/`. Do not delete models or platform adapters.

- [ ] **Step 4: Update the changelog**

Add one concise entry describing the API source organization into global routes/controllers/services/schemas, with no claim that runtime behavior changed.

- [ ] **Step 5: Run the architecture guard and commit cleanup**

Run: `pnpm --filter api exec vitest run src/architecture/layer-boundaries.test.ts src/server.lifecycle.test.ts`

Expected: PASS.

```bash
git add apps/api/src CHANGELOG.md
git commit -m "refactor: organize api source layers"
```

### Task 6: Full verification and handoff

**Files:**
- Modify: none unless a verification failure requires a scoped correction.

- [ ] **Step 1: Run the complete API test suite**

Run: `pnpm --filter api test`

Expected: all runnable tests pass; report any MongoDB/crypto/environment failures separately with their exact error.

- [ ] **Step 2: Run TypeScript compilation**

Run: `pnpm exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck $(rg --files apps/api/src -g '*.ts')`

Expected: exit code 0.

- [ ] **Step 3: Check route and service boundaries**

Run: `pnpm --filter api exec vitest run src/architecture/layer-boundaries.test.ts && ! rg -n 'from ["\x27][^"\x27]*(models/|\\.service\\.js)["\x27]' apps/api/src/routes`

Expected: architecture test passes and the route import check returns no matches.

- [ ] **Step 4: Run diff hygiene checks**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; unrelated pre-existing dirty files remain untouched and are listed explicitly in the handoff.

- [ ] **Step 5: Review the final diff against the spec**

Check every spec requirement: all seven HTTP areas have global route/controller/service/schema ownership, models remain model-only, API contracts are unchanged, and no dependency or schema files changed. Report exact test counts and any environment limitations.
