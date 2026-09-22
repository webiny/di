# Session Handoff — 2026-09-11 — Singleton bleed spec revision and pinned tests

## What was done

- Reviewed the branch (docs, `bugs/`, PR file, failing tests) against the current
  `src/Container.ts`. Found the original design spec had drifted after `resolveImplementation`
  (#17) and `fix: decorators resolution` landed on main.
- Rewrote `docs/2026-05-26-per-container-singleton-scoping-design.md` as revision 2. Five
  findings against revision 1, each with a decision: F1 double-applied decorators (use
  `resolveFrom.applyDecorators` once), F2 transient decorator contradiction (decorators follow the
  requester on every non-global path), F3 order-dependent global scope (cache in the owner), F4
  falsy cache check (defensive only, unreachable), F5 stale references.
- Added 28 tests in three files that pin the revision 2 contract:
  `__tests__/singletonBleed.test.ts`, `__tests__/childContainer/singletonCrossResolution.test.ts`,
  `__tests__/singletonDecoratorChain.test.ts`. 20 fail until the fix lands.
- Ran two cold subagent reviews (spec, tests). Both confirmed the "After" code produces the claimed
  behavior in every traced case. Their gaps are recorded in the spec under "Open items from cold
  review".
- Shortened `pr/bruno-refactor-child-parent-singleton-bleed.md` to issues, fixes, open decisions,
  and synced it to GitHub PR #14.
- Added `.claude/skills/handoff/SKILL.md`, adapted from webiny-js.
- 6 commits this session (one, `chore: format fix` on `src/types.ts`, by the user).

## Key decisions

- **No `src/` changes without agreement.** A `LifetimeScope.Global` + `inGlobalScope()` stub was
  added so global tests could type-check, the user objected, it was reverted and the commit
  amended. `src/` is unchanged this session apart from the user's whitespace fix.
- **Global scope caches in the owning container**, not the requester with walk-up (spec F3).
- **Decorators follow the requesting container for every non-global path** (spec F2). This is a
  behavior change for transients, instances and factories resolved through a child that registered
  a decorator. No pre-existing test covers that case in either direction; all ten
  `registerDecorator` calls in the old suite are on the root. The three "non-singleton paths"
  tests in `singletonDecoratorChain.test.ts` are the first to pin it. Still marked as the user's
  call in the PR body.
- **Global scope tests are deferred** until the API exists, because `pnpm test` runs with
  typecheck. The eight scenarios are listed in the spec.
- Tests may fail on this branch only when they pin designed-but-unimplemented behavior.

## Current state

- Branch: `bruno/refactor/child-parent-singleton-bleed`, 2 commits ahead of origin (not pushed)
- PR: https://github.com/webiny/di/pull/14 (body synced to the committed PR file before the last
  two commits)
- Lint: passing
- Build: passing
- Tests: 83 passed, 22 failing by design (`registry.test.ts` 2, `singletonBleed` 8,
  `singletonCrossResolution` 4, `singletonDecoratorChain` 8), 0 regressions
- `src/` changed: no (whitespace only, by the user)
- No changeset yet; the fix will be a major

## What might come next

1. Decide the open items in the spec: F2 direction, global-depends-on-singleton identity, global
   shadowing, lifecycle wording, composite table row.
2. Regenerate `docs/superpowers/plans/2026-05-26-per-container-singleton-scoping.md` from
   revision 2 (spec F5). Its line numbers and commit hashes are stale.
3. Implement `resolveRegistration` per the spec's "After" code plus the F2 receiver change in
   `tryResolveFromCurrentContainer` and `resolveMultiple`. Add `LifetimeScope.Global` and
   `inGlobalScope()`, then add `__tests__/globalScope.test.ts`.
4. Rewrite the 8 existing cross-container identity tests (6 in `singletons.test.ts`, 1 in
   `registry.test.ts`, 1 in `container.test.ts`).
5. Test hygiene from the review: one decorator-chain test passes today by accident, duplicated
   `ServiceA`/`ServiceB` fixtures, unread `id` fields, "all deps" leaves `TemplateEngine`
   unoverridden.
6. Branch hygiene: `engines.node >=24` vs CI on Node 22.x; `bugs/` and
   `docs/SINGLETON_CACHE_KEY_COLLISION_TESTS.md` describe a bug fixed in #12; add a changeset.
