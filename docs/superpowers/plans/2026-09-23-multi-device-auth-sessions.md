# Phiên đăng nhập nhiều thiết bị Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép một user duy trì nhiều phiên đăng nhập độc lập; refresh/logout/reset password và Socket.IO chỉ ảnh hưởng đúng các phiên liên quan.

**Architecture:** Thêm MongoDB collection `AuthSession`, lưu hash refresh token theo từng `sessionId`. Access/refresh JWT mới cùng mang claim phiên; HTTP middleware và Socket.IO kiểm tra session còn hiệu lực. Refresh token legacy được chuyển thành session trong transaction khi refresh lần đầu; logout thu hồi một session, password reset thu hồi tất cả.

**Tech Stack:** Node.js, TypeScript, Express 5, Mongoose 9, MongoDB transactions, `jose`, Socket.IO 4, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-23-multi-device-auth-sessions-design.md`

## Global Constraints

- Một bản ghi `AuthSession` cho mỗi lần đăng nhập; không đặt giới hạn số thiết bị trong MVP.
- Access token giữ hạn 15 phút; refresh token giữ hạn rolling 7 ngày.
- Không đổi route, method, body, response JSON, tên/thuộc tính cookie hoặc giao diện.
- Refresh lưu SHA-256 digest; không lưu/log JWT hoặc cookie thô.
- Logout thu hồi một session; đặt lại mật khẩu thu hồi mọi session và hash legacy.
- Refresh legacy được nâng cấp khi dùng lần đầu; access JWT legacy không gắn session ID chỉ có thể tự hết hạn trong tối đa 15 phút.
- Session lookup phải kiểm tra `expiresAt > now`; TTL index chỉ dọn dữ liệu.
- Mọi code comment mới phải viết bằng tiếng Việt. Chỉ sửa file thuộc backend auth/realtime và tài liệu feature.

---

### Task 1: Tạo model phiên xác thực

**Files:**
- Create: `apps/api/src/models/auth-session.model.ts`
- Create: `apps/api/src/models/auth-session.model.test.ts`

**Interfaces:**
- Produces `AuthSessionModel` với `sessionId`, `userId`, `refreshTokenHash`, `createdAt`, `lastUsedAt`, `expiresAt`.
- `sessionId` unique; `userId` indexed; `refreshTokenHash` mặc định ẩn; `expiresAt` có TTL index.

- [ ] **Step 1: Viết test schema/index thất bại trước khi có model**

Trong `auth-session.model.test.ts`, import `AuthSessionModel` và kiểm tra:

```ts
it("indexes session identity, owner lookup, and expiry cleanup", () => {
  const indexes = AuthSessionModel.schema.indexes();
  expect(indexes).toContainEqual([{ sessionId: 1 }, { unique: true }]);
  expect(indexes.some(([keys]) => keys.userId === 1)).toBe(true);
  expect(indexes).toContainEqual([{ expiresAt: 1 }, { expireAfterSeconds: 0 }]);
});

it("does not select refresh hashes by default", () => {
  expect(AuthSessionModel.schema.path("refreshTokenHash").options.select).toBe(false);
});
```

- [ ] **Step 2: Chạy test để xác nhận lỗi vì model chưa tồn tại**

Run: `pnpm --filter api exec vitest run src/models/auth-session.model.test.ts`
Expected: FAIL vì module `auth-session.model.js` chưa tồn tại.

- [ ] **Step 3: Tạo schema tối thiểu**

Tạo schema có cấu trúc:

```ts
const authSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  refreshTokenHash: { type: String, required: true, select: false },
  lastUsedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
authSessionSchema.index({ userId: 1 });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

Export `AuthSessionModel` theo cùng pattern với `PasswordResetTokenModel`.

- [ ] **Step 4: Chạy test model**

Run: `pnpm --filter api exec vitest run src/models/auth-session.model.test.ts`
Expected: PASS cho unique/index/TTL/hash projection.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/api/src/models/auth-session.model.ts apps/api/src/models/auth-session.model.test.ts
git commit -m "feat: thêm model phiên xác thực"
```

### Task 2: Tạo phiên mới khi đăng ký và đăng nhập

**Files:**
- Modify: `apps/api/src/services/auth.service.ts`
- Modify: `apps/api/src/auth/auth.integration.test.ts`

**Interfaces:**
- Giữ `register(name, email, password)` và `login(email, password)` trả `{ user, tokens }` để controller/API không đổi.
- Thêm helper nội bộ tạo `sessionId`, ký cặp token mới với claim `sessionId`, lưu hash refresh token và trả token pair chỉ sau khi ghi session thành công.
- Giữ `issueTokens(user)` phát token không có claim session cho test/compatibility bearer legacy; route register/login không gọi đường token legacy này.

- [ ] **Step 1: Viết regression test login trên hai thiết bị**

Trong `auth.integration.test.ts`, đồng bộ index của `AuthSessionModel` trong `beforeAll`; trong `beforeEach`, xóa cả `UserModel` và `AuthSessionModel`. Sau đó tạo admin bằng `hashPassword`, gọi `/login` hai lần với cùng credentials, lấy cookie `nhuu_access_token` và `nhuu_refresh_token` của mỗi response, giải mã payload bằng `decodeJwt` từ `jose`. Assert hai cặp cookie khác nhau, cả hai JWT mỗi cặp có cùng `sessionId`, hai lần login có `sessionId` khác nhau, `AuthSessionModel.countDocuments({ userId })` bằng `2`, và các digest lưu trong Mongo khác token thô.

- [ ] **Step 2: Chạy test mới để xác nhận hành vi hiện tại chưa đạt**

Run: `pnpm --filter api exec vitest run src/auth/auth.integration.test.ts -t "creates independent sessions for two logins"`
Expected: FAIL vì login hiện ghi một `refreshTokenHash` duy nhất vào `User` và chưa tạo hai session.

- [ ] **Step 3: Thêm session-aware token signing và tạo phiên**

Cho `signToken` nhận `sessionId` tùy chọn và chỉ thêm claim khi được truyền. Tạo helper với luồng:

```ts
const sessionId = randomUUID();
const tokens = await issueTokens(user, sessionId);
const now = new Date();
await AuthSessionModel.create({
  sessionId,
  userId: user.id,
  refreshTokenHash: refreshDigest(tokens.refreshToken),
  lastUsedAt: now,
  expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS)
});
return { tokens, sessionId };
```

Giữ nguyên TTL hiện tại khi định nghĩa `REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000` và không trả `sessionId` qua controller.

- [ ] **Step 4: Dùng helper mới trong register và login**

Thay các đoạn update `User.refreshTokenHash` trong hai flow bằng tạo `AuthSession`. Nếu ghi session lỗi thì service reject; controller không phát cookie vì chưa nhận kết quả thành công.

- [ ] **Step 5: Chạy test login/register và regression test hiện có**

Run: `pnpm --filter api exec vitest run src/auth/auth.integration.test.ts src/controllers/auth.controller.test.ts`
Expected: PASS; API response và cookie contract hiện có giữ nguyên.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/api/src/services/auth.service.ts apps/api/src/auth/auth.integration.test.ts
git commit -m "feat: tạo phiên riêng khi đăng nhập"
```

### Task 3: Xoay refresh token riêng theo session và nâng cấp token legacy

**Files:**
- Modify: `apps/api/src/services/auth.service.ts`
- Modify: `apps/api/src/auth/auth.integration.test.ts`

**Interfaces:**
- `rotateRefreshToken(refreshToken)` tiếp tục trả `{ user, tokens }`.
- `verifyToken` nội bộ trả thêm `sessionId?: string`; `jwtVerify` hiện có kiểm tra chữ ký và thời hạn `exp`.
- Thêm `AuthSessionModel` làm nguồn xác thực cho refresh token mới; giữ fallback legacy theo hash `User.refreshTokenHash`.

- [ ] **Step 1: Viết test refresh độc lập hai phiên và từ chối replay**

Đăng nhập hai lần để lấy cookie A/B. Refresh A, rồi refresh B bằng token cũ của từng thiết bị. Assert cả hai trả 200, token mới khác token cũ, `sessionId` từng phiên không đổi, replay token A cũ trả 401, token B mới vẫn refresh được.

- [ ] **Step 2: Xác nhận test thất bại trên implementation hiện tại**

Run: `pnpm --filter api exec vitest run src/auth/auth.integration.test.ts -t "rotates refresh tokens independently per session"`
Expected: FAIL vì backend hiện chỉ tìm digest ở `User.refreshTokenHash`.

- [ ] **Step 3: Implement rotation cho session mới bằng compare-and-swap**

Đọc session theo `sessionId`, `userId` và `expiresAt: { $gt: now }`, chọn `+refreshTokenHash`, so khớp digest. Tạo cặp token mới cùng `sessionId`; cập nhật bằng CAS:

```ts
const result = await AuthSessionModel.updateOne(
  { sessionId, userId: tokenUser.id, refreshTokenHash: currentDigest, expiresAt: { $gt: now } },
  { $set: { refreshTokenHash: refreshDigest(tokens.refreshToken), lastUsedAt: now, expiresAt: nextExpiry } }
);
if (result.modifiedCount !== 1) throw invalidRefreshToken();
```

Nếu `modifiedCount !== 1`, trả `INVALID_REFRESH_TOKEN`.

- [ ] **Step 4: Viết test nâng cấp legacy token đúng một lần**

Tạo user, gọi `issueTokens(user)` để lấy refresh token không có `sessionId`, lưu digest vào `User.refreshTokenHash`; gọi `/refresh`, rồi assert 200, token mới có `sessionId`, một AuthSession được tạo và hash legacy đã bị xóa. Gọi lại bằng token cũ, assert 401 và số AuthSession không đổi.

- [ ] **Step 5: Implement legacy upgrade trong transaction**

Trước transaction, gọi `ensureAuthSessionsCollection()`. Hàm gọi `AuthSessionModel.createCollection()`, bỏ qua riêng lỗi MongoDB code `48` (`NamespaceExists`) và ném lại lỗi khác để an toàn khi request đầu tiên đồng thời nâng cấp nhiều phiên legacy. Bắt đầu Mongoose session/transaction; đọc user theo `_id` và hash, tạo UUID/token pair, xóa hash legacy bằng update có điều kiện và tạo session trong cùng transaction:

```ts
await ensureAuthSessionsCollection();
await mongoSession.withTransaction(async () => {
  const legacyUser = await UserModel.findOne({ _id: tokenUser.id, refreshTokenHash: currentDigest })
    .select("+refreshTokenHash").session(mongoSession);
  if (!legacyUser) throw invalidRefreshToken();
  const updated = await UserModel.updateOne(
    { _id: legacyUser._id, refreshTokenHash: currentDigest },
    { $set: { refreshTokenHash: null } },
    { session: mongoSession }
  );
  if (updated.modifiedCount !== 1) throw invalidRefreshToken();
  await AuthSessionModel.create([sessionRecord], { session: mongoSession });
});
```

Tạo `sessionRecord` bằng `sessionId`, refresh digest, `lastUsedAt = now` và expiry `now + 7 ngày`. Nếu transaction lỗi thì không trả token.

- [ ] **Step 6: Kiểm tra cạnh tranh refresh cùng token**

Thêm integration test chạy `Promise.allSettled([rotateRefreshToken(token), rotateRefreshToken(token)])`; assert đúng một promise fulfilled, session lưu hash token mới duy nhất và token cũ bị từ chối.

- [ ] **Step 7: Chạy auth integration suite**

Run: `pnpm --filter api exec vitest run src/auth/auth.integration.test.ts`
Expected: PASS toàn bộ đăng ký, role, refresh rotation, legacy upgrade và replay.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/api/src/services/auth.service.ts apps/api/src/auth/auth.integration.test.ts
git commit -m "feat: xoay refresh token theo phiên"
```

### Task 4: Xác thực session-bound access token và cô lập Socket.IO

**Files:**
- Modify: `apps/api/src/services/auth.service.ts`
- Modify: `apps/api/src/auth/auth.middleware.ts`
- Modify: `apps/api/src/controllers/auth.controller.ts`
- Modify: `apps/api/src/controllers/auth.controller.test.ts`
- Modify: `apps/api/src/realtime/socket.ts`
- Modify: `apps/api/src/realtime/socket.test.ts`
- Modify: `apps/api/src/auth/auth.integration.test.ts`

**Interfaces:**
- `verifyAccessToken(token)` trả principal `{ id, email, role, sessionId? }`; `sessionId` chỉ là dữ liệu nội bộ và không được đưa vào response `/auth/session`.
- Thêm `isAuthSessionActive(userId, sessionId): Promise<boolean>` để Socket.IO kiểm tra lại sau khi join room.
- Thêm `disconnectAuthSession(sessionId): void` và `disconnectAuthUser(userId): void` trong `realtime/socket.ts`.
- Socket mỗi kết nối tham gia `auth-session:<sessionId>` nếu token session-bound và luôn tham gia `auth-user:<userId>`.

- [ ] **Step 1: Viết regression test HTTP từ chối access của session đã thu hồi**

Login, gọi endpoint được bảo vệ bằng cookie access, xóa `AuthSession` tương ứng, gọi lại endpoint bằng access token cũ và assert 401. Tạo thêm access token legacy bằng `issueTokens(user)` và xác nhận nhánh legacy stateless vẫn xác thực token có chữ ký hợp lệ; `jwtVerify` giới hạn tuổi token ở 15 phút.

- [ ] **Step 2: Chạy test để xác nhận middleware chưa kiểm tra session**

Run: `pnpm --filter api exec vitest run src/auth/auth.integration.test.ts -t "rejects access tokens from revoked sessions"`
Expected: FAIL vì `verifyAccessToken` hiện chỉ xác minh chữ ký/claims.

- [ ] **Step 3: Kiểm tra session trong `verifyAccessToken`**

Nếu claim `sessionId` có mặt, bắt buộc giá trị là chuỗi không rỗng; giá trị sai kiểu làm token bị từ chối thay vì rơi vào legacy. Nếu claim hợp lệ, yêu cầu `AuthSession` khớp session ID/user ID và chưa hết hạn; nếu claim không có, giữ đường xác thực legacy hiện tại. Trả `sessionId` nội bộ cho principal session-bound.

- [ ] **Step 4: Giữ response session không lộ session ID**

Trong `auth.controller.ts`, chỉ serialize `{ id, email, role }` từ authenticated principal. Thêm assertion vào `auth.controller.test.ts` rằng response không có `sessionId`.

- [ ] **Step 5: Viết test socket room và disconnect có mục tiêu**

Mở rộng `socket.test.ts` mocks cho `Server.in(room).disconnectSockets(true)`. Kiểm tra handshake session-bound được verify; callback connection tham gia inbox, `auth-session:<sid>` và `auth-user:<uid>`. Kiểm tra `disconnectAuthSession("sid-a")` chỉ gọi room `auth-session:sid-a`, `disconnectAuthUser("uid")` chỉ gọi `auth-user:uid`. Mô phỏng session bị thu hồi sau khi handshake middleware chạy nhưng trước callback connection; assert socket disconnect sau lần kiểm tra lại.

- [ ] **Step 6: Implement principal và socket room/disconnect helpers**

Trong handshake, giữ cookie ưu tiên và fallback `handshake.auth.token`. Sau khi verify, lưu principal vào `socket.data.auth`; callback connection join room inbox và `auth-user:<userId>`, đồng thời join `auth-session:<sessionId>` nếu có. Sau khi join xong, gọi `isAuthSessionActive` lần nữa; disconnect socket nếu phiên đã bị thu hồi trong khoảng handshake tới lúc join room. Helper gọi `activeServer?.in(room).disconnectSockets(true)` và no-op khi realtime server chưa chạy.

- [ ] **Step 7: Chạy focused auth/socket tests**

Run: `pnpm --filter api exec vitest run src/auth/auth.integration.test.ts src/controllers/auth.controller.test.ts src/realtime/socket.test.ts`
Expected: PASS; token legacy còn hạn và contract realtime hiện tại vẫn được giữ.

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/api/src/services/auth.service.ts apps/api/src/auth/auth.middleware.ts apps/api/src/controllers/auth.controller.ts apps/api/src/controllers/auth.controller.test.ts apps/api/src/realtime/socket.ts apps/api/src/realtime/socket.test.ts apps/api/src/auth/auth.integration.test.ts
git commit -m "feat: xác thực realtime theo phiên"
```

### Task 5: Thu hồi phiên khi logout và đặt lại mật khẩu

**Files:**
- Modify: `apps/api/src/services/auth.service.ts`
- Modify: `apps/api/src/controllers/auth.controller.ts`
- Modify: `apps/api/src/controllers/auth.controller.test.ts`
- Modify: `apps/api/src/services/password-reset.service.ts`
- Modify: `apps/api/src/services/password-reset.service.test.ts`
- Modify: `apps/api/src/auth/auth.integration.test.ts`

**Interfaces:**
- `revokeRefreshToken(token): Promise<string | undefined>` trả `sessionId` chỉ khi thu hồi một session mới thành công; legacy token thu hồi hash legacy và trả `undefined`.
- `resetPassword(token, password): Promise<string>` tiếp tục xử lý password reset và trả `userId` sau khi transaction commit.
- Controller gọi `disconnectAuthSession(sessionId)` cho logout session-bound; sau reset gọi `disconnectAuthUser(userId)`.

- [ ] **Step 1: Viết test logout A không ảnh hưởng session B**

Tạo hai phiên qua login A/B. Gọi logout bằng refresh cookie A; assert 204, session A không còn, endpoint protected từ access A trả 401, session B còn và access/refresh B vẫn hoạt động.

- [ ] **Step 2: Xác nhận test logout thất bại trước khi sửa**

Run: `pnpm --filter api exec vitest run src/auth/auth.integration.test.ts -t "logs out one session without revoking another"`
Expected: FAIL vì `revokeRefreshToken` chỉ cập nhật một trường ở User và không thu hồi session.

- [ ] **Step 3: Implement revoke session có điều kiện**

Với refresh JWT có session ID, xác minh `sessionId`, `userId`, thời hạn và digest rồi `deleteOne` với đầy đủ điều kiện; chỉ trả session ID khi `deletedCount === 1`. Với token legacy, xóa có điều kiện `User.refreshTokenHash` đúng digest và không xóa session mới.

- [ ] **Step 4: Nối logout controller với disconnect session**

Nếu service trả session ID, gọi `disconnectAuthSession` sau khi revoke hoàn tất; luôn clear hai cookie như hiện tại kể cả cookie refresh thiếu/sai/hết hạn. Với legacy token, không disconnect room user để tránh đá các phiên mới trên thiết bị khác.

- [ ] **Step 5: Viết test password reset xóa mọi session**

Trong integration suite, tạo hai AuthSession và một hash legacy, hoàn tất reset bằng reset token hợp lệ, assert `AuthSession` của user bị xóa, `refreshTokenHash` legacy null và access session-bound bị 401. Trong service test, assert `deleteMany({ userId }, { session })` chạy trong cùng transaction với consume reset token và update password.

- [ ] **Step 6: Implement password reset revoke-all trong transaction**

Trong transaction hiện có, giữ cập nhật password và clear hash legacy, thêm `AuthSessionModel.deleteMany({ userId }, { session })`. Trả user ID sau commit. Trong controller, clear cookie và gọi `disconnectAuthUser(userId)` chỉ sau khi service thành công.

- [ ] **Step 7: Test logout legacy compatibility**

Gọi logout với refresh token legacy hợp lệ; assert hash legacy được xóa, cookies clear, helper `disconnectAuthSession` không gọi, và các AuthSession mới cùng user vẫn hoạt động.

- [ ] **Step 8: Chạy auth/password reset suite**

Run: `pnpm --filter api exec vitest run src/auth/auth.integration.test.ts src/auth/password-reset.integration.test.ts src/services/password-reset.service.test.ts src/controllers/auth.controller.test.ts`
Expected: PASS; reset token vẫn một lần và generic response hiện tại không đổi.

- [ ] **Step 9: Commit Task 5**

```bash
git add apps/api/src/services/auth.service.ts apps/api/src/controllers/auth.controller.ts apps/api/src/controllers/auth.controller.test.ts apps/api/src/services/password-reset.service.ts apps/api/src/services/password-reset.service.test.ts apps/api/src/auth/auth.integration.test.ts
git commit -m "fix: thu hồi đúng phiên đăng nhập"
```

### Task 6: Cập nhật tài liệu và chạy verification toàn backend

**Files:**
- Modify: `README.md`
- Modify: `docs/wiki/README.md`
- Modify: `CHANGELOG.md`
- Modify nếu cần: các test auth/realtime của Task 1–5.

- [ ] **Step 1: Cập nhật README và Wiki**

Trong phần xác thực hiện có, mô tả session riêng mỗi lần login, cookie/API không đổi, refresh rolling 7 ngày, logout theo session, password reset revoke-all, lazy migration legacy và giới hạn 15 phút của legacy access JWT. Không ghi thông tin nhạy cảm hoặc tạo hướng dẫn vận hành không có trong spec.

- [ ] **Step 2: Cập nhật CHANGELOG Unreleased**

Thêm đúng một gạch đầu dòng tiếng Việt mô tả đăng nhập nhiều thiết bị, refresh/logout theo phiên và thu hồi Socket.IO tương ứng; giữ nguyên các dòng dirty ngoài task.

- [ ] **Step 3: Chạy focused suite cuối**

Run: `pnpm --filter api exec vitest run src/models/auth-session.model.test.ts src/auth/auth.integration.test.ts src/auth/password-reset.integration.test.ts src/services/password-reset.service.test.ts src/controllers/auth.controller.test.ts src/realtime/socket.test.ts`
Expected: PASS toàn bộ test auth/session/password reset/socket.

- [ ] **Step 4: Chạy full backend suite**

Run: `pnpm --filter api test`
Expected: toàn bộ test pass; ghi rõ mọi fail/skip nền hiện hữu, không bỏ test để làm suite xanh.

- [ ] **Step 5: Kiểm tra TypeScript và repository formatting**

Không có script lint/typecheck hoặc tsconfig riêng trong `apps/api`. Chạy `pnpm --filter api exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck src/server.ts`; kiểm tra các file thay đổi theo style hiện hữu.

- [ ] **Step 6: Rà diff, bảo đảm chỉ stage file trong task và kiểm tra whitespace**

Run: `git diff --check` và `git status --short`; xác nhận thay đổi Messenger đã tồn tại từ trước không bị stage/commit chung. Rà diff auth, reset, socket, README/Wiki và changelog với tiêu chí trong spec.

- [ ] **Step 7: Commit docs/verification Task 6**

```bash
git add README.md docs/wiki/README.md CHANGELOG.md
git commit -m "docs: ghi nhận phiên đăng nhập nhiều thiết bị"
```

- [ ] **Step 8: Push feature branch theo quy tắc repo sau khi toàn bộ verification đạt**

Chạy `git push` trên branch feature hiện tại sau khi xác nhận upstream, commit diff và working tree. Không merge vào `main`.
