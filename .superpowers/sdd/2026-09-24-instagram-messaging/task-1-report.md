# Task 1 report: Instagram contracts, connection model, and conversation indexes

## Implemented

- Added shared Instagram connection and OAuth/list/disconnect response interfaces.
- Added `InstagramAccountConnection` with required Workspace owner, globally unique Instagram account ID, public profile fields, encrypted token excluded from default queries, expiry, status, subscription/error metadata, and timestamps.
- Split conversation uniqueness into Facebook and Instagram customer-scoped indexes plus an owner-scoped index for Zalo, Telegram, and their personal variants.
- Added a standalone, explicitly invoked index migration script. It validates existing index definitions, reports duplicate Instagram tuple IDs before any index change, creates replacements before removing the known old index, and reruns safely. No records are rewritten. No production migration was run.
- Marked only Task 1 implementation-plan checkboxes complete.

## TDD evidence

- RED: `pnpm exec vitest run apps/api/src/models/instagram-account-connection.model.test.ts apps/api/src/models/indexes.test.ts` exited 1. The Instagram multi-customer test failed with Mongo `E11000` on `platform_1_channelId_1_ownerId_1_non_facebook`; the new connection model import was absent.
- RED: `pnpm exec vitest run apps/api/src/db/migrate-instagram-conversation-customer-index.test.ts` exited 1 because the new migration module was absent.
- RED after initial migration implementation: the unexpected owner-scoped unique index test failed because migration incorrectly resolved successfully; added preflight rejection for that index.
- GREEN: focused model/index/migration command passed 3 files, 22 tests. Mongo fixtures covered Facebook, Telegram, multiple Instagram DMs, duplicate Instagram tuples, empty collection, rerun, and incompatible indexes.

## Broader verification and limits

- `pnpm --filter api test`: 149 files / 1,018 tests passed; one pre-existing unrelated failure in `src/schemas/workspace.schemas.test.ts`, which expects `zalo_personal` to be rejected despite the current schema accepting it.
- `pnpm exec tsc --noEmit --project tsconfig.base.json --pretty false` exits 2 with 84 lines of diagnostics in unchanged files; no diagnostics mention Task 1 model, migration, index test, or contracts files.
- `git diff --check` passed. No lint/formatter script or configuration is present in the workspace.

## Operational concern

Run the standalone migration against a backed-up target database as a separate operational step before deploying the new conversation schema. The migration intentionally returns duplicate IDs without removing records; those records require manual resolution before rerun.
