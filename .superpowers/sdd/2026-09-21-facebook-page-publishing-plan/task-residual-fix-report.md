# Facebook Page publishing residual-fix report

Date: 2026-09-21

## Findings remediated

### Scheduler recovery starvation

`FacebookPostScheduler.runOnce()` now atomically recovers one expired `publishing` lease before attempting any due `scheduled` claim. When recovery succeeds, the run returns immediately, so a continuous scheduled backlog cannot starve lease recovery. The regression test supplies both an expired lease and a due scheduled candidate and verifies the expired record is terminally failed first while no scheduled claim is attempted.

### Cancellation race safety

`FacebookPostService.cancelPost()` now uses a single user-scoped `findOneAndDelete` with `status: { $in: ["draft", "scheduled"] }`. The returned deleted snapshot is the only source used for media cleanup. A concurrent state transition or media replacement therefore cannot cause cleanup of media from a post that was not atomically deleted.

The existing model has no cancellation-pending status and the delete is intentionally authoritative. If provider media cleanup fails after the delete, the service returns `FACEBOOK_POST_MEDIA_CLEANUP_FAILED` (502); the orphaned provider asset is left for the provider-side compensating cleanup process. This behavior is documented in the service and covered by a regression test. A failed post is no longer eligible for cancellation because the approved cancellation state set is draft/scheduled only.

## Verification

- Backend Facebook scheduler/service/controller/routes/model/media tests: **52 passed** across 6 files.
- Facebook frontend API/page contract tests: **19 passed** across 2 files.
- Web build (`pnpm --filter web build`): **passed**.
- `git diff --check`: **passed**.
- Broad `pnpm exec vitest run apps/web/src`: **not clean** because Vitest also collected unrelated `.worktrees/*` tests and reported 6 pre-existing failures in unrelated dashboard/settings/composer files; the scoped Facebook frontend tests passed.

## Scope and residual concerns

Only the Facebook scheduler/service source and tests plus this report are intended for the commit. Existing unrelated dirty files in the repository were preserved. The cleanup-failure policy intentionally favors state correctness (the post is deleted) and reports the provider cleanup failure for compensating handling.
