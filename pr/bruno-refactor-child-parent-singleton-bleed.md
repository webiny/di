## Summary

Fixes singleton bleed-through in parent/child container hierarchies and introduces a new `GlobalScope` lifetime for shared resources.

When a singleton registered in a parent container depends on `{ multiple: true }` abstractions, child container registrations currently leak into the parent's cached singleton instance — and from there into every other container in the hierarchy.

**Root cause:** `resolveRegistration` caches singletons in `this.instances` (the owning container) but resolves dependencies via `resolveFrom` (the requesting container). A child resolving a parent-owned singleton collects child-scoped registrations, then writes the result into the parent's cache — polluting it for all subsequent resolvers.

**Fix:** Two new lifetime scopes replace the broken singleton behavior:

- **Singleton scope** (per-container) — cache singletons in `resolveFrom.instances` instead of `this.instances`, apply decorator chains in parent-to-child order. Each container gets its own instance reflecting its own dependency graph.
- **Global scope** (shared downward) — resolve deps and decorators exclusively from the owning container. Cache in the resolving container with walk-up lookup so children reuse an ancestor's cached instance.

## What changes

### Core (`src/Container.ts`, `src/types.ts`)

1. **`LifetimeScope.Global`** — new enum value in `src/types.ts`
2. **`RegistrationBuilder.inGlobalScope()`** — new builder method
3. **Singleton cache lookup/write** — `resolveFrom.instances` instead of `this.instances`
4. **Singleton decorator chain** — after the owning container applies its decorators, walk from `resolveFrom` up to `this` and apply each intermediate container's decorators in parent-to-child order. Decorator constructor deps at every level are resolved from `resolveFrom`.
5. **Global cache lookup** — walk up from `resolveFrom` through ancestors, stop at owning container. Return first cached instance found.
6. **Global dep/decorator resolution** — use `this` (owning container) for both dep resolution and `applyDecorators`, passing `this` as `resolveFrom` so decorator constructor deps also come from the owner.
7. **Falsy singleton fix** — change `if (existing)` to `if (existing !== undefined)` so singletons resolving to `0`, `false`, `""`, or `null` are correctly cached

### Three lifetime scopes

| Scope         | Instance per                     | Deps resolved from  | Decorators                                          | Cache lookup             | Sharing                                              |
| ------------- | -------------------------------- | ------------------- | --------------------------------------------------- | ------------------------ | ---------------------------------------------------- |
| **Transient** | Every call                       | Resolving container | Owning container classes, resolver deps             | None                     | None                                                 |
| **Singleton** | Container                        | Resolving container | Full chain classes (owner->resolver), resolver deps | Resolving container only | Never — each container gets its own                  |
| **Global**    | First resolver + shared downward | Owning container    | Owning container classes, owning container deps     | Walk up from resolver    | Downward — children reuse ancestor's cached instance |

### Usage

```typescript
// Per-container: each container gets its own instance with its own deps
container.register(ProductRegistryImpl).inSingletonScope();

// Shared: one instance, resolved from owning container, shared downward
container.register(SqlConnectionImpl).inGlobalScope();
```

### Singleton scope behavior

```
Parent: ProductRegistry (singleton), CoffeeProduct, ComputerProduct
Child:  CarProduct

# Before (broken)
child.resolve(ProductRegistry)   -> [Coffee, Computer, Car] — cached in parent
parent.resolve(ProductRegistry)  -> [Coffee, Computer, Car] — WRONG, Car leaked

# After (fixed)
child.resolve(ProductRegistry)   -> [Coffee, Computer, Car] — cached in child
parent.resolve(ProductRegistry)  -> [Coffee, Computer]      — cached in parent, unpolluted
```

### Global scope behavior

```
# Case A: parent resolves first — children share instance
parent.resolve(SqlConnection)  -> constructs, caches in parent
child1.resolve(SqlConnection)  -> walks up, finds in parent -> same instance
child2.resolve(SqlConnection)  -> walks up, finds in parent -> same instance

# Case B: child resolves first — independent construction, shared downward
child1.resolve(SqlConnection)  -> walks up, no cache, constructs, caches in child1
parent.resolve(SqlConnection)  -> no cache in parent, constructs, caches in parent
grandchild.resolve(SqlConnection) -> walks up, finds in child1 -> child1's instance
```

### Tests

#### Committed (failing — prove the bug before the fix)

- **`__tests__/registry/registry.test.ts`** — two regression tests using the existing PluginRegistry infrastructure:
  1. `"child-only plugin registration must not pollute the parent singleton registry"` — child adds `MetricsPlugin`, resolves parent's singleton registry. Child sees 4 plugins, parent must see 3. **Fails today**: parent sees 4.
  2. `"parent registration after child resolution must not bleed into child's cached singleton"` — after child caches with 4 and parent caches with 3, a new `ValidationPlugin` registered in parent must not change child's cached singleton (stays at 4). **Fails today**: parent returns 4 instead of 3.
- **`__tests__/registry/implementations.ts`** — added `MetricsPlugin`/`MetricsPluginImpl` and `ValidationPlugin`/`ValidationPluginImpl`

#### Planned (will pass after the fix)

- **Update existing** — `singletons.test.ts`, `registry.test.ts`: cross-container `toBe` identity assertions updated to assert behavioral equivalence within the same container
- **New: `singletonBleed.test.ts`** — bleed-through prevention, child inheritance, sibling isolation, deep hierarchy, same-container identity
- **New: `singletonCrossResolution.test.ts`** — singleton variants of all `childContainer.test.ts` scenarios (override some/all/no deps, grandchild chain, great-grandchild 4-level hierarchy)
- **New: `singletonDecoratorChain.test.ts`** — child/grandchild decorator application, intermediate decorator deps from requesting container, parent isolation from child decorators
- **Resolution ordering tests** — both-siblings-before-parent, parent-before-child, singleton dependency chains, pre-cached dependency ordering
- **New: global scope tests** — parent-first sharing, child-first independent construction, walk-up nearest-ancestor cache hit, child decorators ignored, child `{ multiple: true }` registrations ignored, deep hierarchy sharing

### Docs

- `AGENTS.md` lifetime scopes section updated to reflect all three scopes

## Breaking change

This is a **breaking semantic change**. The singleton contract changes from "one shared instance across the hierarchy" to "one instance per container that resolves it."

- Code that relies on `child.resolve(X) === parent.resolve(X)` (reference identity across containers) will break
- Within the same container, reference identity is preserved
- Code that needs the old shared behavior should migrate to `.inGlobalScope()`

## Design docs (on this branch)

- `docs/2026-05-26-per-container-singleton-scoping-design.md` — full design spec covering both singleton and global scope, with before/after code, decorator ordering, concrete examples, and alternatives considered (reviewed through 4 passes, 20 issues found and fixed)
- `docs/superpowers/plans/2026-05-26-per-container-singleton-scoping.md` — task-by-task implementation plan
- `docs/2026-05-26-container-hardening-design.md` — cold review findings (falsy cache bug, circular dep check bypass, perf issues)

## Current status

- Design spec and implementation plan: committed
- Failing regression tests: committed (2 tests in `registry.test.ts` prove the bug)
- Implementation: not started

## Test plan

- [x] Failing regression tests committed proving singleton bleed-through bug
- [ ] All existing tests pass (with updated identity assertions)
- [ ] New bleed-through tests pass — child registrations never appear in parent singleton
- [ ] Sibling isolation — two children with different registrations get independent singletons
- [ ] Deep hierarchy — grandchild sees parent + child + own registrations, parent is untouched
- [ ] Singleton decorator chain — child decorators applied in parent-to-child order, parent unaffected
- [ ] Intermediate decorator deps — resolved from requesting container, not intermediate container
- [ ] Resolution ordering — parent-before-child and child-before-parent both produce correct isolated instances
- [ ] Singleton dependency chain — pre-cached parent dep does not leak into child's singleton
- [ ] Same-container identity — resolving twice from the same container returns `toBe`-identical instance
- [ ] Falsy singleton values (`0`, `false`, `""`, `null`) are cached correctly
- [ ] Global scope: parent-first — all children share parent's instance
- [ ] Global scope: child-first — child gets its own, parent gets its own, grandchild shares child's via walk-up
- [ ] Global scope: child decorators and `{ multiple: true }` registrations have no effect
- [ ] Global scope: walk-up returns nearest ancestor's cache, not owning container's
