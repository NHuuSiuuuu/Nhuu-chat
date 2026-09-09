# AGENTS.md

Repository instructions for coding agents working on the Nhuu-chat project.

## Scope

These instructions apply to the entire `Nhuu-chat` project.

## Project Context

- This is a multichannel customer support management system with an AI RAG assistant.
- The MVP prioritizes Telegram, a realtime inbox, MongoDB, Redis, and Socket.IO.
- The backend uses Node.js, Express, and TypeScript.
- The frontend uses React, TypeScript, and the Socket.IO client.
- The main modules include auth, channel connectors, customers, conversations, messages, realtime communication, knowledge, AI, and jobs.
- Future phases may add Facebook, Instagram, and Zalo; do not implement work outside the approved scope without authorization.

## Required Workflow

- Read the relevant code and documentation before changing behavior.
- Keep changes within the scope of the user's request.
- Follow the project's existing structure, naming, and conventions.
- Do not integrate Nhuu-chat into the shoe store repository.
- Do not merge into `main` unless the user explicitly requests it.
- Do not revert user changes or unrelated dirty files.
- Use non-destructive git commands.
- Read `DEVELOPMENT_PROMPT.md` only when the user explicitly requests it.

## File Modification Rules

- Modify only the files required to fulfill the request.
- Do not modify unrelated files.
- Do not delete existing files unless explicitly requested.
- Do not rename or move files unless necessary.
- Do not modify database schemas or migrations unless the task requires it.
- Do not modify authentication, authorization, or security logic unless the task requires it.
- Do not change API contracts unless explicitly requested.
- Do not add or change dependencies or package versions unless necessary and clearly explained.
- Do not modify environment files or secrets.
- Do not modify tests merely to make them pass; change a test only when it is incorrect and explain why.
- Do not refactor or rewrite unrelated code.
- Do not change UI/UX outside the requested scope.

## Changelog Rule

- Every meaningful code, UI, database, configuration, or documentation change must update `CHANGELOG.md`.
- Keep the file name as `CHANGELOG.md`.
- Keep `CHANGELOG.md` in the project root.
- Add current work under `## [Unreleased]`.
- Move unreleased entries to a dated section only when the user requests a release or finalization.

## Documentation Rule

- Every new system or feature must update `README.md` with setup instructions, usage, current status, and known limitations.
- Every new system or feature must update the Wiki based on the README content.
- Maintain the local Wiki source under `docs/wiki/` before synchronizing it with the repository Wiki.
- Documentation must clearly record what is complete, what is in progress, and what is planned next.

## Documentation Layout

- Use `docs/requirements/` for PRDs, SRS documents, and business requirements.
- Use `docs/superpowers/specs/` for product specifications and architectural decisions.
- Use `docs/superpowers/plans/` for implementation plans.
- Do not use `docs/superpowers/` as the project's primary changelog.
- Do not automatically read, modify, or overwrite `DEVELOPMENT_PROMPT.md`.

## Security and Reliability

- Do not commit Telegram tokens, API keys, JWT secrets, encryption keys, or confidential data.
- Tokens and secrets must be encrypted at rest according to the approved design.
- Webhooks must validate their secret or signature and handle idempotency.
- APIs must provide appropriate authentication, authorization, validation, and rate limiting.
- RAG must not invent information when the knowledge base lacks supporting data.
- Outbound messages must have bounded retries and traceable failure states.

## Verification

- Run focused tests for the changed area when practical.
- Run broader tests or a build when changes affect routing, auth, databases, API contracts, or user flows.
- Run `git diff --check` before reporting completion.
- Clearly explain any verification step that cannot be run.
- Do not call work complete when it has only been checked locally without stating the environment limitations.

## Communication

- Report the files changed, verification results, and remaining risks.
- Mention unrelated dirty files that were intentionally left untouched.
- Prefer concise status updates in Vietnamese.
