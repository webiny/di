# Session Handoff — 2026-09-21 — Scoping prior art and naming decision

## What was done

- Surveyed how other DI containers scope shared instances and wrote it up in
  `docs/2026-09-14-scoping-prior-art.md`: tsyringe, InversifyJS, NestJS, Microsoft DI, Autofac,
  Spring, Guice, Symfony, Laravel, shaku. Framed around one question: whose view builds a shared
  instance, and where is it cached. Ends with "What this means for our design" and an "Open
  decision: scope naming" section with options A (as specified) and B (additive).
- Added open items 8 (scope naming) and 9 (unguarded captive dependency) to the design spec
  `docs/2026-05-26-per-container-singleton-scoping-design.md`, plus a pointer under "Alternatives
  considered".
- Rewrote `pr/bruno-refactor-child-parent-singleton-bleed.md` down to issue, two naming options
  and doc links. Synced to PR #14 on GitHub.
- `AGENTS.md` Known Issues entry now links the prior-art doc and names the open decision.
- `docs/superpowers/plans/2026-05-26-per-container-singleton-scoping.md` carries a stale banner:
  revision 1 architecture superseded by F1/F3, regenerate after the naming decision; tasks 1, 4, 5
  done, 2, 3, 6 open.
- User bumped `@rspack/core`, `@types/node`, `vite` (patch/minor) and ignored `.DS_Store`.
- 3 commits (2 docs, 1 chore). No tests added or changed. No `src/` changes.

## Key decisions

- **No `src/` changes without agreement** still holds. Nothing in `src/` touched this session.
- **Scope naming is now the blocking decision.** Every surveyed container keeps `Singleton`
  meaning the shared, owner-cached instance and names the per-container behavior separately
  (`ContainerScoped`, `InstancePerLifetimeScope`, `Scoped`). The spec redefines `Singleton` and
  adds `Global`, which is what makes the release a major. Option B keeps `Singleton` shared but
  built from the owner's view (removes the bleed alone, no identity change) and adds
  `inContainerScope()`. Same `resolveRegistration` rewrite either way. Owner: user.
- **Captive dependency guard** (global depending on singleton) recorded as unguarded; other
  containers reject or proxy it. No decision yet on whether to add a check.
- Earlier decisions unchanged: F1 single `applyDecorators` call, F2 decorators follow the requester
  on non-global paths (still the user's call), F3 global cached in the owner, F4 `!== undefined`.

## Current state

- Branch: `bruno/refactor/child-parent-singleton-bleed`, in sync with origin (pushed by the user)
- PR: https://github.com/webiny/di/pull/14, body synced with `pr/` file
- Lint: passing
- Build: passing (`dist/index.js` 13.5 kB)
- Tests: 87 passed, 22 failing by design (`registry/registry.test.ts` 2, `singletonBleed.test.ts`
  8, `childContainer/singletonCrossResolution.test.ts` 4, `singletonDecoratorChain.test.ts` 8),
  0 regressions, 0 type errors
- `src/` changed: no
- `engines.node >=24` vs CI `node-version: 22.x` still unresolved

## What might come next

1. Decide scope naming (A or B). Everything below depends on it.
2. Decide F2 direction and the captive dependency guard.
3. Regenerate the implementation plan from spec revision 2 with the chosen names.
4. Implement `resolveRegistration` context switch, `LifetimeScope` addition, builder method,
   receiver change in `tryResolveFromCurrentContainer` and `resolveMultiple`. Then the deferred
   global/shared scope test file (8 scenarios in the spec) and rewrite of the 8 identity tests.
5. Test hygiene (spec open item 7). Changeset once `src/` changes (major for A, patch + minor
   for B). Align Node version between `package.json` and workflows. Remove stale `bugs/` and
   `docs/SINGLETON_CACHE_KEY_COLLISION_TESTS.md`.
