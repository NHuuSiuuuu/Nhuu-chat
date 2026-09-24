### Task 5: Workspace channel directory, realtime access, and activity history

**Files:**
- Modify `apps/api/src/services/workspace-member.service.ts` and tests to include active Instagram accounts in `listOwned`.
- Modify workspace route/service tests only if serialization requires changes.
- Modify `apps/api/src/realtime/access.ts`, Socket/event tests if Instagram requires a new case beyond existing platform-generic filtering.
- Reuse existing generic `CONNECT_CHANNEL` / `DISCONNECT_CHANNEL` event and history metadata.

**Requirements:**
- Directory entry is `{ platform: "instagram", channelId: instagramUserId, name, avatarUrl? }` for each connected account.
- Owner/Admin see all connected Instagram channels; Staff visibility remains restricted by the existing `allowedChannels` filter.
- Disconnect removes access/directory visibility without changing other Instagram accounts or channels.
- OAuth callback retries and duplicate disconnect requests cannot create duplicate history entries.

- [x] Add failing tests for listing multiple Instagram accounts, owner/staff channel filtering, disconnect visibility, and exactly-once safe history metadata.
- [x] Run focused Workspace directory/access/realtime tests and confirm expected failures.
- [x] Implement directory source and history integration, preserving the existing Facebook and personal-channel behavior.
- [x] Run focused Workspace, history, REST access, and Socket tests.
