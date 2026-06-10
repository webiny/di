## Summary

Fixes singleton bleed-through in parent/child container hierarchies. When a singleton registered in a parent container depends on `{ multiple: true }` abstractions, child container registrations currently leak into the parent's cached singleton instance — and from there into every other container in the hierarchy.

**Root cause:** `resolveRegistration` caches singletons in `this.instances` (the owning container) but resolves dependencies via `resolveFrom` (the requesting container). A child resolving a parent-owned singleton collects child-scoped registrations, then writes the result into the parent's cache — polluting it for all subsequent resolvers.

**Fix:** Per-container singleton scoping — cache singletons in `resolveFrom.instances` instead of `this.instances`, and apply decorator chains in parent-to-child order so each container gets its own singleton instance reflecting its own dependency graph.

## What changes

### Core (`src/Container.ts`)

1. **Singleton cache lookup/write** — `resolveFrom.instances` instead of `this.instances`
2. **Decorator chain** — after the owning container applies its decorators, walk from `resolveFrom` up to `this` and apply each intermediate container's decorators in parent-to-child order
3. **Falsy singleton fix** — change `if (existing)` to `if (existing !== undefined)` so singletons resolving to `0`, `false`, `""`, or `null` are correctly cached

### New singleton semantics

| Aspect           | Before                               | After                                               |
| ---------------- | ------------------------------------ | --------------------------------------------------- |
| Cache location   | Owning container                     | Requesting container                                |
| Instance sharing | One instance shared across hierarchy | One instance per container that resolves it         |
| Child view       | Shared with parent (may be polluted) | Own instance with parent deps + own deps            |
| Parent isolation | Not guaranteed                       | Guaranteed — parent cache is never written by child |

```
Parent: ProductRegistry (singleton), CoffeeProduct, ComputerProduct
Child:  CarProduct

# Before (broken)
child.resolve(ProductRegistry)   → [Coffee, Computer, Car] — cached in parent
parent.resolve(ProductRegistry)  → [Coffee, Computer, Car] — WRONG, Car leaked

# After (fixed)
child.resolve(ProductRegistry)   → [Coffee, Computer, Car] — cached in child
parent.resolve(ProductRegistry)  → [Coffee, Computer]      — cached in parent, unpolluted
```

### Tests

- **Update existing** — `singletons.test.ts`, `registry.test.ts`: cross-container `toBe` identity assertions updated to assert behavioral equivalence (same deps, same values) within the same container
- **New: `singletonBleed.test.ts`** — bleed-through prevention, child inheritance, sibling isolation, deep hierarchy, same-container identity
- **New: `singletonCrossResolution.test.ts`** — singleton variants of all `childContainer.test.ts` scenarios (override some/all/no deps, grandchild chain, great-grandchild 4-level hierarchy)
- **New: `singletonDecoratorChain.test.ts`** — child/grandchild decorator application, parent isolation from child decorators
- **Resolution ordering tests** — both-siblings-before-parent, parent-before-child, singleton dependency chains

### Docs

- `AGENTS.md` lifetime scopes section updated to reflect per-container singleton semantics

## Breaking change

This is a **breaking semantic change**. The singleton contract changes from "one shared instance across the hierarchy" to "one instance per container that resolves it."

Code that relies on `child.resolve(X) === parent.resolve(X)` (reference identity across containers) will break. Within the same container, reference identity is preserved.

## Design docs (on this branch)

- `docs/2026-05-26-per-container-singleton-scoping-design.md` — full design spec with before/after code, decorator ordering, alternatives considered
- `docs/superpowers/plans/2026-05-26-per-container-singleton-scoping.md` — task-by-task implementation plan
- `docs/2026-05-26-container-hardening-design.md` — cold review findings (falsy cache bug, circular dep check bypass, perf issues)

## Test plan

- [ ] All existing tests pass (with updated identity assertions)
- [ ] New bleed-through tests pass — child registrations never appear in parent singleton
- [ ] Sibling isolation — two children with different registrations get independent singletons
- [ ] Deep hierarchy — grandchild sees parent + child + own registrations, parent is untouched
- [ ] Decorator chain — child decorators applied in parent-to-child order, parent unaffected
- [ ] Resolution ordering — parent-before-child and child-before-parent both produce correct isolated instances
- [ ] Same-container identity — resolving twice from the same container returns `toBe`-identical instance
- [ ] Falsy singleton values (`0`, `false`, `""`, `null`) are cached correctly
