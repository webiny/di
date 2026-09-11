## Summary

Singletons registered in a parent container are polluted by child containers. The fix is designed and pinned by failing tests; the implementation in `src/Container.ts` is not started.

Design: `docs/2026-05-26-per-container-singleton-scoping-design.md` (revision 2).

## Issues

1. **Singleton bleed.** `resolveRegistration` caches in the owning container but resolves dependencies from the requesting container. The first child to resolve a parent singleton writes its own view (extra `{ multiple: true }` entries, overridden deps) into the parent's cache, and every other container gets it.
2. **Decorators stop at the owner.** A decorator registered in a child never applies to a parent-owned service the child resolves. Decorators are collected from the owner's chain, not the requester's.
3. **Falsy cache check.** `if (existing)` instead of `if (existing !== undefined)`. Unreachable today since `new` always yields an object, but wrong on its face.
4. **No opt-in for shared instances.** Once singletons are per-container, a SQL pool or HTTP client needs a way to stay one instance across the hierarchy.

## Possible fixes

Pick one context container per resolution and use it for cache, deps and decorators:

| Scope        | Context   | Result                                                                                         |
| ------------ | --------- | ---------------------------------------------------------------------------------------------- |
| Transient    | requester | as today, plus requester-chain decorators                                                      |
| Singleton    | requester | one instance per resolving container, cached in that container                                 |
| Global (new) | owner     | one instance per registration, cached in the owner, child registrations and decorators ignored |

- `resolveRegistration`: `const context = scope === Global ? this : resolveFrom`, then `context.instances`, `context.resolveInternal(..., context)`, `context.applyDecorators(..., context)`.
- `tryResolveFromCurrentContainer` and `resolveMultiple`: call `resolveFrom.applyDecorators` instead of `this.applyDecorators` for instance and factory registrations.
- `LifetimeScope.Global` and `RegistrationBuilder.inGlobalScope()`.

Alternatives rejected in the spec: smart caching by dependency diff, fixing only `{ multiple: true }`, walk-up cache for globals.

## Open decisions

- Child decorators applying to parent-owned transients, instances and factories is a behavior change. No existing test depends on the old behavior.
- Global depending on Singleton: the singleton is cached in the owner, so `child.resolve(G).s !== child.resolve(S)`. Spec needs to state this.
- Per-request child containers will rebuild every parent singleton per request unless migrated to `inGlobalScope()`. This is the main migration cost.

## Breaking change

`child.resolve(X) === parent.resolve(X)` no longer holds for singletons. Migrate shared resources to `.inGlobalScope()`. Major release, changeset still to add.

## Tests

- Failing, pinning the new contract (22): `registry/registry.test.ts` (2), `singletonBleed.test.ts`, `childContainer/singletonCrossResolution.test.ts`, `singletonDecoratorChain.test.ts`.
- Will break when the fix lands (8): six in `singletons.test.ts`, one in `registry/registry.test.ts`, one in `container.test.ts` ("should resolve instance from parent container if not found in child container"). All assert cross-container identity.
- Deferred until `inGlobalScope()` exists: `globalScope.test.ts` (8 scenarios listed in the spec).
- `containerToken.test.ts` documents a separate inheritance limitation; unaffected.

## Branch hygiene

- `engines.node` is `>=24` but CI runs Node 22.x.
- `bugs/` and `docs/SINGLETON_CACHE_KEY_COLLISION_TESTS.md` describe a bug already fixed in #12.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
