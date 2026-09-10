# AGENTS.md

Repository instructions for coding agents working on the Nhuu-chat project.

## Scope

These instructions apply to the entire `Nhuu-chat` project.

## Project Context

- This is a multichannel customer support management system with an AI RAG assistant.
- The MVP prioritizes Telegram, a realtime inbox, MongoDB, Redis, and Socket.IO.
- The backend uses Node.js, Express, and TypeScript.
- The frontend uses React, TypeScript,CSS Tailwind and the Socket.IO client.
- The main modules include auth, channel connectors, customers, conversations, messages, realtime communication, knowledge, AI, and jobs.
- Future phases may add Facebook, Instagram, and Zalo; do not implement work outside the approved scope without authorization.
- The approved product/architecture design lives in `docs/requirements/` (PRD, SRS) and `docs/superpowers/specs/` (specs, architectural decisions). When a rule below refers to "the approved design," it means whatever is currently recorded there — check those folders before assuming a design decision.

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
- Do not modify database schemas or migrations without first explaining the proposed change and getting explicit confirmation — never treat "the task seems to need it" as sufficient justification on its own.
- Do not modify authentication, authorization, or security logic unless the task requires it.
- Do not change API contracts unless explicitly requested.
- Do not add or change dependencies or package versions unless necessary and clearly explained.
- Do not modify environment files or secrets.
- Do not modify tests merely to make them pass; change a test only when it is incorrect and explain why.
- Do not refactor or rewrite unrelated code.
- Do not change UI/UX outside the requested scope.

## Coding Style

- Follow the repository's existing ESLint/Prettier configuration; do not hand-format code in a way that would conflict with it.
- Run the linter/formatter on changed files before reporting completion; fix violations in files you touched, but do not reformat untouched files just to satisfy the linter.
- Match existing naming conventions (files, variables, types) within the module you're editing rather than introducing a new convention.
- Prefer explicit TypeScript types over `any`; if a type must be loosened, say why in a comment.

## Testing & QA

- Test framework: (fill in once chosen, e.g. Jest/Vitest for backend, React Testing Library for frontend) — until specified, ask rather than assume.
- New business logic (channel connectors, RAG pipeline steps, message send/receive flows) must include at least a basic unit or integration test covering the main success path and one failure path.
- Do not delete or skip existing tests to make a build pass; if a test seems wrong, flag it and explain why instead of silently removing it.
- Run the relevant test suite for the changed module before reporting completion; run the full suite when changes touch auth, database models, API contracts, or realtime messaging.
- Report which tests were run, which passed/failed, and any tests that could not be run in this environment (and why).

## Changelog Rule

- Meaningful user-facing or architectural changes must update `CHANGELOG.md`.
- Minor internal fixes that do not affect behavior do not require a changelog entry.
- New features or systems must update `README.md`.
- Keep the file name as `CHANGELOG.md`.
- Keep `CHANGELOG.md` in the project root.
- Add current work under `## [Unreleased]`.
- Move unreleased entries to a dated section only when the user requests a release or finalization.

## Documentation Rule

- Every new system or feature must update `README.md` with setup instructions, usage, current status, and known limitations.
- Every new system or feature must update the Wiki based on the README content.
- Maintain the local Wiki source under `docs/wiki/` before synchronizing it with the repository Wiki.
- Documentation must clearly record what is complete, what is in progress, and what is planned next.
- Do not create documentation for trivial implementation details.
- Documentation should describe behavior, setup, architecture, usage, limitations, and operational requirements.

## Documentation Layout

- Use `docs/requirements/` for PRDs, SRS documents, and business requirements.
- Use `docs/superpowers/specs/` for product specifications and architectural decisions.
- Use `docs/superpowers/plans/` for implementation plans.
- Do not use `docs/superpowers/` as the project's primary changelog.
- Do not automatically read, modify, or overwrite `DEVELOPMENT_PROMPT.md`.

## Code Comments

- Add a concise comment above functions that contain meaningful business logic or non-obvious behavior.
- The comment should explain the purpose and responsibility of the function, not repeat the function name.
- Prefer comments that answer "Why/What does this function do?" rather than describing obvious implementation details.
- Do not add comments to trivial getters, setters, simple CRUD wrappers, or self-explanatory code unless the behavior is non-obvious.
- Keep comments short and update them when the function behavior changes.
- Do not use comments to compensate for unclear naming or unnecessarily complex code.

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