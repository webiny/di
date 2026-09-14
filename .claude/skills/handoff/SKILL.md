---
name: handoff
description: End-of-session handoff for @webiny/di — updates AGENTS.md, design specs, plan checklists and the PR description file, runs the CI checks, commits, writes a handoff file, and generates a copy/paste prompt for the next agent. Use when user says "handoff", "wrap up", "end session", "clear context", or wants to prepare context for the next conversation.
---

# Session Handoff

Run all steps in order. Do not skip any.

## Step 1 — Discover what changed

Run these commands and study the output:

```
git branch --show-current
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
git status --short
```

If the branch was already ahead of `origin/main` when the session started, use the starting commit
from the conversation context instead of `origin/main`.

Summarize:

- Branch name and how many commits are unpushed (`git status -sb`)
- Which areas changed: `src/`, `__tests__/`, `docs/`, `pr/`, `bugs/`, `.changeset/`, `AGENTS.md`
- Key fixes, behavior changes, design decisions, tests added

## Step 2 — Update project docs

For each doc below, check if this session's changes require an update. Only touch docs that are
actually stale — don't rewrite for the sake of it.

| Doc                                            | Update if...                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                    | Resolution order, lifetime scopes, child container semantics, test structure, conventions or known issues changed |
| `docs/<date>-<topic>-design.md`                | A design decision was made, revised or rejected; the spec drifted from `src/Container.ts`              |
| `docs/superpowers/plans/<date>-<topic>.md`     | Plan tasks were completed (tick the checkboxes) or the plan no longer matches the spec                  |
| `pr/<branch-name>.md`                          | Branch state, issues, fixes, open decisions, test counts or hygiene items changed                       |
| `bugs/*.md`                                    | A documented bug was fixed (say so at the top) or a new bug was reproduced                              |
| `__tests__/childContainer/CHILD_CONTAINER_BUG.md` | `resolveFrom` semantics changed                                                                        |
| `.changeset/*.md`                              | `src/` changed in a way consumers will notice — run `pnpm changeset`; breaking changes are `major`      |

Rules from `AGENTS.md` still apply: no comments unless explaining a non-obvious "why", oxfmt not
prettier, `.js` import extensions.

State which docs you updated and which you skipped (with reason).

## Step 3 — Run checks

```
pnpm lint && pnpm build && pnpm test
```

This is exactly what CI runs. Fix any lint or build issue. Format with `pnpm format:fix`, lint
autofix with `pnpm lint:fix`.

Tests are allowed to fail **only** when they pin a designed-but-unimplemented behavior and the
design spec or PR file says so. In that case record the exact failing count and confirm no
previously passing test regressed:

```
pnpm vitest run 2>&1 | grep -E "^\s+×|Test Files|Tests "
```

## Step 4 — Commit all changes

Commit everything that's uncommitted with a conventional prefix (`fix:`, `test:`, `docs:`,
`chore:`). Do not push and do not edit the GitHub PR unless the user asks.

If `pr/<branch-name>.md` changed and a PR is open (`gh pr view --json number,url`), tell the user
the body can be synced with:

```
gh pr edit <number> --body-file pr/<branch-name>.md
```

## Step 5 — Write handoff file

Write `docs/handoff/YYYY-MM-DD-<slug>.md` where `<slug>` is a 2-3 word kebab-case summary of the
session's main work.

Template:

```markdown
# Session Handoff — YYYY-MM-DD — <Title>

## What was done

- Bullet list of significant changes, grouped by theme (not every commit)
- Commit count, tests added, tests changed

## Key decisions

- Design decisions made, revised or rejected (link the spec section)
- Conventions introduced
- Anything the user explicitly decided or declined

## Current state

- Branch: <name>, N commits ahead of origin (pushed / not pushed)
- PR: <url or "none">
- Lint: passing/failing
- Build: passing/failing
- Tests: N passed, N failing by design (which files), N regressions
- `src/` changed: yes/no

## What might come next

- Obvious follow-up work
- Open decisions waiting on the user
- Known issues or loose ends
```

## Step 6 — Generate handoff prompt

Output a fenced block the user can copy/paste into the next conversation. Format:

````
```
## Context — Session YYYY-MM-DD handoff

<2-3 sentence summary of what was accomplished>

Read first: AGENTS.md, pr/<branch-name>.md, docs/<current design spec>.md

### Key changes
- <grouped bullet list of what changed, with file references>

### Decisions
- <design decisions taken, with enough detail to act on>
- <decisions still open and who owns them>

### Current state
- Branch: <name>, N commits ahead of origin (pushed / not pushed)
- PR: <url or "none">
- Checks: lint, build <green/red>; tests N passed, N failing by design
- `src/` changed this session: yes/no

### What might come next
- <prioritized list of follow-up work>
- <known issues>
```
````

Tell the user: "Copy the block above and paste it as your first message in the next conversation."
