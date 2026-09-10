# SDD ledger — plan: docs/superpowers/plans/2026-09-10-api-layered-structure.md

## Pre-flight plan scan

| Scope | Produces / consumes | Finding and ruling |
|---|---|---|
| Task 1 ↔ Task 2 | Boundary guard / new global layers | Task 1 intentionally fails until Task 2 starts moving HTTP files. Ruling: keep the guard red between tasks; do not weaken it. |
| Task 2 ↔ Task 3 | `services/auth.service.ts`, `app.ts`, cross-domain imports | Task 2 produces the auth service path and app wiring that Task 3 consumes. Ruling: preserve exported auth symbols and update imports only. |
| Task 2 ↔ Task 4 | `services/provider-secret.service.ts`, Telegram imports | Task 2 moves provider-secret service; Task 4 consumes it through Telegram service. Ruling: provider-secret model stays in `models/`, service moves once. |
| Task 3 ↔ Task 4 | conversation/message serializers and Telegram producers | Task 3 produces stable serializer paths used by Telegram services. Ruling: move serializers with their services before Telegram import updates. |
| Task 4 ↔ Task 5 | `app.ts`, `server.ts`, route/service exports | Task 4 produces final Telegram paths; Task 5 performs final registration and cleanup. Ruling: no compatibility wrappers in old locations. |
| Task 5 ↔ Task 6 | final tree, changelog, verification commands | Task 5 produces the final structure; Task 6 verifies it. Ruling: do not claim completion until Task 6 evidence exists. |
| Task 1 | test and directories | Test is self-consistent; initial missing `routes/` is the intended red state. Ruling: create directories before running the second red check. |
| Task 2 | auth/customer/knowledge files | Scope agrees with spec; schemas are HTTP-only and provider-secret model remains model-only. Ruling: no database/API changes. |
| Task 3 | conversations/messages files | Scope agrees with spec; socket emission remains controller orchestration. Ruling: preserve event names/payloads. |
| Task 4 | Telegram files | Scope agrees with spec; platform adapters remain under `channels/`. Ruling: only HTTP route/service files move. |
| Task 5 | app/server/changelog | Scope agrees with spec; route registration test is independent of MongoDB. Ruling: use the new `app.test.ts` command exactly. |
| Task 6 | verification | TypeScript command uses explicit compiler flags because the repo has no API-specific tsconfig. Ruling: report environment failures separately. |

## Decisions

- Ruling: work in `.worktrees/api-layered-structure` on branch `refactor/api-layered-structure` — the main feature worktree contains unrelated UI changes.
- Ruling: no schema/database migration — this task changes source organization only and the approved spec forbids database changes.

## Baseline

- `pnpm install --frozen-lockfile` passed.
- `pnpm --filter api test` ran 28 files: 23 passed, 5 failed. Four integration suites are blocked by missing `libcrypto.so.1.1`; one Telegram personal unit test needs a process `ENCRYPTION_KEY`. These are pre-existing environment failures and are not changed by this plan.

## Task 1 review

- Reviewer requested changes: the guard did not check provider-client imports, did not scan services for Express imports, and used a limited legacy-route allowlist.
- Ruling: fix the guard before proceeding — these are explicit binding constraints and the cost if wrong is allowing the later migration to silently violate the architecture.
- Task 1: minor (deferred): Express import guard does not catch mixed default-plus-named imports such as `import express, { Request } from "express"`; current services have no such import and the final review will triage it.
- Task 1: fix round 1/5 (3 addressed, 0 open; commits 0667fff..7717200)
- Task 1: complete (commits 1e05c33..7717200, review clean)

## Task 2 review

- Reviewer verdict: PASS WITH CONCERNS; no Critical/High implementation defect.
- Ruling: the red architecture guard is expected between migration tasks because Task 3 and Task 4 still own legacy route moves; carry the requirement to Task 5 rather than weaken the guard or block Task 2.
- Task 2: minor (deferred): endpoint behavior coverage for customer/knowledge/auth schemas is thinner than ideal; existing integration tests and final review will triage without expanding unrelated scope.
- Task 2: complete (commits 7717200..887eeac, 1 deferred minor)

## Task 3 review

- Reviewer found three Important issues: outbound delivery/lookup/auth/persistence remained in `messages.controller.ts`; outbound tests bypassed Telegram and did not assert persistence/events; conversation controller had no negative/error-path tests. One Minor found: message ordering test asserted source text rather than behavior.
- Ruling: enter fix round 1 — the first three findings violate the approved controller/service boundary and acceptance tests. The ordering-test minor is deferred unless the implementer touches that test while adding behavior coverage.
- Task 3: fix round 1/5 (3 Important addressed, 0 open; commit bd5c6a1..e013a84)
- Task 3: minor (deferred): existing message ordering test still checks source text; it was outside the fix diff and does not block this architecture migration.
- Task 3: complete (commits 887eeac..e013a84, 1 deferred minor)

## Task 4 review

- Reviewer requested changes: missing route-level role/auth coverage; Telegram controller Zod failures reach generic 500 instead of `400 INVALID_REQUEST`; minor reverse dependency from Telegram service to HTTP schema type.
- Ruling: fix round 1 — role guard tests are required by the acceptance criteria, and the spec explicitly requires Zod errors to use the existing AppError convention. Move the shared Telegram input type to a non-HTTP module while fixing the tests.
- Task 4: fix round 1/5 (3 findings addressed, 0 open; commit 1cbf2ad..21b3acb)
- Task 4: complete (commits e013a84..21b3acb, review clean)
- Task 5: minor (deferred): route registration test covers health and conversations only; the brief prescribed this minimum and all seven mounts were independently reviewed.
- Task 5: complete (commits 21b3acb..8217f9f, 1 deferred minor)

## Task 6 verification

- Full API suite: 34 files passed, 130 tests passed, 17 skipped; 4 Mongo-backed suites failed before tests because the host lacks `libcrypto.so.1.1`.
- Encryption-sensitive Telegram personal test passed with a process-only 32-byte `ENCRYPTION_KEY`; no environment file was changed.
- TypeScript explicit all-source command exited 0.
- Architecture, app registration, and server lifecycle checks passed: 3 files, 8 tests.
- Route import scan and `git diff --check` passed; worktree is clean.

## Final review

- Final reviewer found no Critical issues.
- Important: validation status/error behavior diverged from the pre-refactor handlers for some malformed requests; customer/knowledge endpoint behavior tests were missing.
- Ruling: one final fix wave will preserve the pre-refactor HTTP behavior as the higher-priority user constraint, and add focused customer/knowledge controller tests. Any intentional validation normalization must not be silently introduced by this structural refactor.
- Deferred minors: mixed Express import guard, source-text message ordering test, and limited route-prefix registration coverage.

## Final fix wave — 2026-09-10

- Parent HEAD: `8217f9f881ed9e5cbb1fcc183b9338b9f4870784`; contract baseline: `1e05c33`.
- Addressed both Important findings from final review: restored baseline validation error conventions and added focused customer/knowledge controller/service coverage without Mongo.
- Supersedes Task 4's blanket-400 ruling: the higher-priority no-contract-change constraint preserves generic Zod/Error 500 responses as well as pre-existing AppError status/code/message mappings. Corrected both the design and implementation-plan wording.
- Auth's explicit checks remain `400 INVALID_REQUEST`; missing parsed bodies retain the baseline generic 500. Telegram bot schemas now forward Zod errors unchanged. Personal QR status retains a generic Error/500 for missing ids; password validation retains its original 400 and message. QR array ids again use the first element.
- TDD evidence: 15 regression assertions failed before production changes (20 passed); all passed after the fix. Customer/knowledge characterization coverage added 13 passing tests against existing production behavior; no customer/knowledge production changes were required.
- Final focused verification: 14 files / 109 tests passed. Full API run: 38 files / 165 tests passed; four Mongo-backed suites failed setup and 17 tests were skipped because `libcrypto.so.1.1` is missing, matching the documented baseline limitation.
- Explicit all-source TypeScript compilation exited 0; `git diff --check` passed. Full-suite encryption fixture was process-only; no environment file or secret was changed.
- Detailed findings, baseline matrix, commands, scope review, and remaining concerns: [final-fix-report.md](final-fix-report.md).
- Final fix wave: both requested findings addressed; deferred minors remain unchanged. Verification is local; no merge, push, deployment, or subagent dispatch was performed.
