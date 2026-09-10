# Final fix report — API layered structure

## Status and scope

Both requested final-review fixes are addressed. Work started from clean HEAD `8217f9f881ed9e5cbb1fcc183b9338b9f4870784` on `refactor/api-layered-structure`, in `/home/codexproxy/Nhuu-chat/.worktrees/api-layered-structure`. This report is included in the fix commit following that HEAD.

The review findings supplied in the request and the ledger's final-review ruling were checked against the pre-refactor handlers and Telegram service at `1e05c33`, current controllers/schemas/services, and the unchanged common error handler. The receiving-code-review and TDD workflows guided the baseline comparison and regression-first implementation; verification-before-completion guided the final checks. No subagents were dispatched.

## Finding 1: Preserve baseline validation contracts

The original design's blanket instruction to convert Zod failures into AppError contradicted the higher-priority requirement to preserve API contracts. The prior Task 4 ruling is superseded by the final-review ruling; its history remains in the ledger. The design and implementation plan now explicitly preserve existing endpoint error conventions.

| Endpoint/input | Baseline at `1e05c33` | Final behavior |
| --- | --- | --- |
| Auth register: invalid name/email/password | Explicit `400 INVALID_REQUEST`, original registration message | Preserved using the extracted schema |
| Auth login: invalid email/password | Explicit `400 INVALID_REQUEST`, `Email and password are required` | Preserved |
| Auth refresh: invalid token field | Explicit `400 INVALID_REQUEST`, `Refresh token is required` | Preserved |
| Auth handlers: no parsed body | Destructuring fails before manual validation; generic `500 INTERNAL_ERROR` | Restored by extracting fields before schema validation |
| Telegram bot registration: malformed token/URL | Service schema `.parse()` throws ZodError; generic `500 INTERNAL_ERROR` | HTTP schema `.parse()` forwards ZodError unchanged |
| Telegram webhook: malformed update with valid secret | Service schema `.parse()` throws ZodError; generic `500 INTERNAL_ERROR` | HTTP schema `.parse()` forwards ZodError unchanged |
| Telegram webhook: invalid secret | `401 INVALID_WEBHOOK_SECRET` before ingestion | Existing behavior retained and tested |
| Personal QR status: missing/empty id | `Error("QR login id is missing")`; generic `500 INTERNAL_ERROR` | Restored |
| Personal QR password: missing id or invalid password | `400 INVALID_REQUEST`, `Telegram 2FA password is required` | Restored, including the exact missing-id message |
| Personal QR handlers: array-valued id | Use the first element | Restored through schema preprocessing |
| Personal QR password: valid padded password | Pass the original string to the owned QR login | Preserved and tested |

Generic failures retain the original public body: `{ "error": { "code": "INTERNAL_ERROR", "message": "An unexpected error occurred" } }`. The common error handler was not modified.

Production changes are confined to `auth.controller.ts`, `telegram.controller.ts`, `telegram-personal.controller.ts`, and `telegram-personal.schemas.ts`. The new schemas remain in use; existing authentication, role checks, webhook secret checks, and provider/session operations retain their implementation.

The old Telegram controller/route tests expected the refactor's newly introduced 400 response, so those expectations were incorrect relative to the baseline. They now assert forwarded ZodError and the actual 500 HTTP body. The old QR controller test used an artificial numeric route parameter; it was replaced with baseline missing/empty-id and array-normalization cases. Non-string rejection remains covered by the existing QR schema test; actual Express URL parameters are strings. Password handling is tested independently because its original error mapping differs from QR-status handling.

New auth controller tests cover all three explicit 400 messages, malformed credential fields, missing parsed bodies, and registration's 201 user/token response. No JWT, hashing, authorization, or auth-service logic changed.

## Finding 2: Customer and knowledge behavior without Mongo

Added 13 focused tests using existing dependency seams:

- `controllers/customers.controller.test.ts` runs the real schema, controller, customer service, and common error handler with only the model persistence boundary replaced. It verifies trimming/deduplication before persistence, the exact update id/tags/options, the 200 `{ id, tags }` response, clearing all tags, the service-generated `404 CUSTOMER_NOT_FOUND`, unchanged forwarding of a persistence failure to a generic 500, and rejecting blank tags without a write.
- `controllers/knowledge.controller.test.ts` replaces the existing service exports and exercises real HTTP responses. It verifies unchanged valid input whitespace and injected embedding/store dependencies, create 201 with the returned document, delete 204 with an empty body, unchanged create/delete service-error forwarding, and preservation of an injected AppError's status/code/message.
- `services/knowledge.service.test.ts` runs the real service, deterministic embedding provider, and in-memory vector store, replacing only Mongo model operations. It verifies default text ingestion, saved ready state, inserted/retrievable embedded chunks, document/chunk deletion, removing only the target document's vectors, and propagation of chunk-deletion failures before later deletion steps.

These tests assert observable response bodies, statuses, normalized persistence arguments, error identity, and vector-store state. The customer and knowledge production code already satisfied the requested behavior, so it was not changed.

## TDD and verification evidence

1. Before production edits, the validation regression command ran four files / 35 tests: **15 failed, 20 passed**. Failures specifically exposed the bot AppError-vs-ZodError/500 mismatch, personal QR generic-error/message/array differences, and auth missing-body 400-vs-500 mismatch.
2. After the minimal production fix, the same regression areas plus schemas passed: **7 files / 52 tests**.
3. The new customer/knowledge tests characterized existing behavior and passed on first execution: **3 files / 13 tests**. They required no production implementation, so no artificial red state was introduced.
4. The final focused run, including additional auth characterization, passed: **14 files / 109 tests**, exit 0.

Final focused command:

```bash
pnpm --filter api exec vitest run src/controllers src/services/knowledge.service.test.ts src/schemas src/channels/telegram/telegram.routes.integration.test.ts src/architecture/layer-boundaries.test.ts src/app.test.ts src/server.lifecycle.test.ts
```

Full API command:

```bash
ENCRYPTION_KEY=test-encryption-key-that-is-at-least-32-characters pnpm --filter api test
```

Result: **38 files passed, 165 tests passed; 4 suites failed during Mongo setup, 17 tests skipped**, exit 1. The four setup failures are:

- `src/auth/auth.integration.test.ts` — 7 skipped tests.
- `src/models/indexes.test.ts` — 4 skipped tests.
- `src/models/provider-secret.integration.test.ts` — 2 skipped tests.
- `src/channels/telegram/telegram.webhook.integration.test.ts` — 4 skipped tests.

All four report missing `libcrypto.so.1.1` for MongoDB 4.4.29, matching the existing baseline ledger. The encryption-sensitive Telegram personal test passes with the process-only test fixture; no environment file was edited.

TypeScript command, run against all API source and test files:

```bash
pnpm exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck $(rg --files apps/api/src -g '*.ts')
```

Result: exit 0, no diagnostics. `git diff --check` also passed. No repository lint/formatter configuration or script was present; existing formatting conventions were followed.

## Documentation and final scope review

- Corrected `docs/superpowers/specs/2026-09-10-api-layered-structure-design.md` and the corresponding plan's blanket-400 instruction.
- Added accurate `[Unreleased]` changelog entries for restored baseline conventions and the new customer/knowledge coverage.
- Appended the final fix wave to `progress.md` and wrote this detailed report. Only these two explicitly requested report-area files are included from the otherwise ignored `.superpowers` directory; review dumps and other reports remain untouched.
- Reviewed the production diff against the baseline handlers and unchanged error handler. No service implementations, route paths, event names, Telegram provider/session behavior, UI, dependencies, environment files, secrets, database models, schemas, or indexes changed. The only schema change is HTTP QR-id normalization, not a database schema.
- Initial tracked worktree was clean; no unrelated user edits were present. No merge, push, or deployment was performed.

## Remaining concerns

Verification is local. Mongo-backed integration coverage remains blocked by the host's existing OpenSSL/Mongo runtime limitation, so the full suite cannot be reported as green. The ledger's deferred minors—mixed Express-import guard coverage, the source-text message ordering test, and limited route-prefix registration coverage—remain outside this fix wave. Neither requested Important finding remains open.
