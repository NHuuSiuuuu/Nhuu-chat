# API Layered Structure Design

## Context

`apps/api/src` currently groups files by feature, but several route modules contain HTTP parsing, authorization checks, database access, business logic, and realtime side effects in the same handler. Service files are also mixed into feature and model directories. This makes the HTTP entry points difficult to scan and makes responsibilities unclear.

## Goal

Organize the API into explicit `routes`, `controllers`, `services`, and `schemas` layers while preserving existing HTTP paths, response shapes, authentication behavior, database models, realtime events, and channel behavior.

## Target structure

```text
apps/api/src/
├── routes/
│   ├── auth.routes.ts
│   ├── conversations.routes.ts
│   ├── messages.routes.ts
│   ├── customers.routes.ts
│   ├── knowledge.routes.ts
│   └── channels/
├── controllers/
│   ├── auth.controller.ts
│   ├── conversations.controller.ts
│   ├── messages.controller.ts
│   ├── customers.controller.ts
│   ├── knowledge.controller.ts
│   └── telegram.controller.ts
├── services/
│   ├── auth.service.ts
│   ├── conversation.service.ts
│   ├── message.service.ts
│   ├── customer.service.ts
│   ├── knowledge.service.ts
│   ├── provider-secret.service.ts
│   └── telegram.service.ts
├── schemas/
│   ├── auth.schemas.ts
│   ├── conversation.schemas.ts
│   ├── customer.schemas.ts
│   ├── knowledge.schemas.ts
│   ├── message.schemas.ts
│   └── telegram.schemas.ts
├── models/
├── middleware/
├── channels/
├── realtime/
├── ai/
├── jobs/
├── orchestration/
├── common/
├── db/
├── app.ts
└── server.ts
```

The exact list of files may be smaller when a domain has no meaningful schema or controller. Empty abstraction files must not be created.

## Responsibilities and dependency direction

### Routes

Routes create routers, attach existing middleware, and delegate to controller functions. They must not query Mongoose models, construct provider clients, emit socket events, or contain business branching.

### Schemas

Schemas contain Zod request schemas and small parsing helpers for HTTP input. They validate request body, query, and route parameters. They must not access Express response objects, models, or services.

### Controllers

Controllers own the HTTP boundary: read validated request input and authenticated user context, call services, emit response status/body, and pass errors to Express error handling. Controllers may coordinate a response-specific realtime notification, but business operations remain in services.

### Services

Services own business operations and data persistence orchestration. They must not import Express types or `Request`/`Response`. Existing service APIs and pure serializers remain behavior-compatible unless a narrower API is required by the new controller boundary.

### Models and infrastructure

`models/` contains Mongoose models only. `provider-secret.service.ts` moves to `services/` because it is an application service, while `provider-secret.model.ts` remains in `models/`. Telegram clients, normalizers, auth helpers, and platform-specific session state remain under `channels/`.

## Migration scope

Move and split the HTTP-facing modules for auth, conversations, messages, customers, knowledge, Telegram bot, and Telegram personal. Update `app.ts`, `server.ts`, internal imports, and tests affected by moved modules. Keep AI, jobs, realtime, common, database, and orchestration structure unchanged unless an import must be updated.

The migration must not change:

- URL paths, HTTP methods, status codes, response payloads, or error codes.
- Authentication, role checks, conversation access rules, or security middleware.
- MongoDB schemas, indexes, migrations, environment variables, or dependencies.
- Telegram synchronization, outbound delivery, Socket.IO event names, or event payloads.
- Existing unrelated dirty files in the worktree.

## Error handling

Controllers pass caught errors to the existing `errorHandler`. Zod validation errors must be converted to the existing `AppError`/error response convention at the HTTP boundary. Services continue to throw domain errors and do not format HTTP responses.

## Testing and acceptance criteria

- Every moved controller has focused tests for its success path and at least one validation or service-error path where practical.
- Existing service and integration tests continue to pass after import moves.
- Static checks prove routes do not import Mongoose models or service implementations directly.
- TypeScript compilation passes.
- API test suite passes, excluding only tests blocked by documented external environment requirements.
- `git diff --check` passes.
- A final diff confirms only the approved API structure and its tests/docs changed.
