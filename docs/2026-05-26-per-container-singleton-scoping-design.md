# Per-Container Singleton Scoping

## Problem

When a singleton registered in a parent container has a `{ multiple: true }` dependency, child container registrations bleed into the parent's cached singleton instance.

### Root Cause

In `Container.ts`, `resolveRegistration` caches singletons in `this.instances` — the container that **owns** the registration. But dependencies are resolved via `resolveFrom` — the container that **requested** the resolution.

When a child first resolves a parent's singleton:

1. Child calls `resolve(ProductRegistry)` — walks up to parent
2. Parent's `resolveRegistration` resolves dependencies using `resolveFrom = child`
3. `resolveMultiple` for `[Product, { multiple: true }]` collects from parent (CoffeeProduct, ComputerProduct) **and** child (CarProduct)
4. The instance (containing all three products) is cached in `this.instances` — the **parent**
5. Parent later resolves `ProductRegistry` — gets the cached instance containing CarProduct

The child's CarProduct has bled into the parent's singleton.

### Example

```
Parent registers: ProductRegistry (singleton), CoffeeProduct, ComputerProduct
Child registers:  CarProduct

child.resolve(ProductRegistry)   // resolveFrom=child, collects 3 products, caches in parent
parent.resolve(ProductRegistry)  // returns cached instance with 3 products — WRONG
```

## Solution

Cache singletons per-resolving-container instead of per-owning-container.

### Code Change

Two changes in `resolveRegistration` (`src/Container.ts`):

1. **Cache lookup**: `resolveFrom.instances.get(registration)` instead of `this.instances.get(registration)`
2. **Cache write**: `resolveFrom.instances.set(registration, decoratedInstance)` instead of `this.instances.set(registration, decoratedInstance)`

This works because TypeScript `private` allows same-class instance access — `this` can read/write `resolveFrom.instances` since both are `Container`.

### Before

```typescript
private resolveRegistration<T>(
  abstraction: Abstraction<T>,
  registration: Registration<T>,
  resolutionStack: Map<symbol, boolean>,
  resolveFrom: Container
): T {
  if (registration.scope === LifetimeScope.Singleton) {
    const existing = this.instances.get(registration);  // <-- owning container
    if (existing) {
      return existing;
    }
  }

  // ... resolve deps using resolveFrom ...

  if (registration.scope === LifetimeScope.Singleton) {
    this.instances.set(registration, decoratedInstance);  // <-- owning container
  }

  // ...
}
```

### After

```typescript
private resolveRegistration<T>(
  abstraction: Abstraction<T>,
  registration: Registration<T>,
  resolutionStack: Map<symbol, boolean>,
  resolveFrom: Container
): T {
  if (registration.scope === LifetimeScope.Singleton) {
    const existing = resolveFrom.instances.get(registration);  // <-- requesting container
    if (existing) {
      return existing;
    }
  }

  // ... resolve deps using resolveFrom (unchanged) ...

  if (registration.scope === LifetimeScope.Singleton) {
    resolveFrom.instances.set(registration, decoratedInstance);  // <-- requesting container
  }

  // ...
}
```

## New Singleton Semantics

| Aspect           | Before                               | After                                               |
| ---------------- | ------------------------------------ | --------------------------------------------------- |
| Cache location   | Owning container                     | Requesting container                                |
| Instance sharing | One instance shared across hierarchy | One instance per container that resolves it         |
| Child view       | Shared with parent (may be polluted) | Own instance with parent deps + own deps            |
| Parent isolation | Not guaranteed                       | Guaranteed — parent cache is never written by child |

### Behavior

```
Parent: ProductRegistry (singleton), CoffeeProduct, ComputerProduct
Child:  CarProduct

parent.resolve(ProductRegistry)  -> [CoffeeProduct, ComputerProduct]       (cached in parent)
child.resolve(ProductRegistry)   -> [CoffeeProduct, ComputerProduct, Car]  (cached in child)
parent.resolve(ProductRegistry)  -> [CoffeeProduct, ComputerProduct]       (from parent cache, unpolluted)
```

Inheritance flows downward (parent -> child) but never upward. Each container gets its own singleton instance reflecting its own dependency graph.

## Impact on Existing Tests

### `__tests__/singletons.test.ts`

Tests that assert reference identity across containers will break:

- "should share singleton instance across all child containers" — `instanceFromRoot === instanceFromChild` is no longer true
- "should create singleton only once even with multiple resolves" — cross-container identity no longer holds
- "should share singleton through nested child containers" — same

These tests need updating to assert **behavioral equivalence** (same dependencies resolved to same values) rather than **reference identity** (`toBe`). Within the **same** container, `toBe` identity still holds — resolving twice from the same container returns the cached instance.

### `__tests__/childContainer/childContainer.test.ts`

These tests use **transient** registrations (no `.inSingletonScope()`), so they are unaffected by this change. However, singleton variants of every scenario must be added to guarantee the same cross-resolution behavior holds under singleton scoping. The existing transient tests remain as-is.

## New Tests

### Singleton bleed-through tests (ProductRegistry pattern)

1. **No upward bleed**: Parent singleton is not polluted when child resolves first with additional `{ multiple: true }` registrations
2. **Child inherits + extends**: Child's singleton includes parent registrations + own registrations
3. **Sibling isolation**: Sibling children each get their own singleton instance with their own registrations
4. **Deep hierarchy**: Grandchild sees parent + child + own registrations in its singleton
5. **Same-container identity**: Resolving a singleton twice from the same container returns the same instance
6. **Simple singletons**: Singletons without `{ multiple: true }` deps produce per-container instances with equivalent behavior

### Singleton variants of child container cross-resolution tests

Mirror the existing `childContainer.test.ts` scenarios but with `.inSingletonScope()` on the `NotificationService` registration. These verify that the `resolveFrom` passthrough still correctly resolves overridden dependencies when singletons are involved:

7. **Parent resolves all null implementations (singleton)**: Parent singleton NotificationService resolves all parent deps
8. **Child overrides some deps (singleton)**: Child resolves parent's singleton NotificationService — overridden deps (Logger, EmailClient) come from child, rest from parent. Parent's singleton is unaffected.
9. **Child overrides all deps (singleton)**: Same as above but all deps overridden in child
10. **Child overrides no deps (singleton)**: Child resolves parent's singleton with no overrides — gets equivalent instance with all parent deps
11. **Grandchild inherits overrides through the chain (singleton)**: Grandchild resolves singleton with overrides spread across child and grandchild levels
12. **Child override does not affect parent resolution (singleton)**: After child resolves singleton with overrides, parent resolves its own singleton — must see only parent deps
13. **Great-grandchild resolves overrides spread across 4 levels (singleton)**: Singleton resolved from a great-grandchild picks up overrides from every level in the hierarchy

## Documentation Updates

`AGENTS.md` Lifetime Scopes section needs updating:

- **Before**: "Singleton - One instance per container where registered. Cached after first resolution (including decorators). Shared with all child containers that don't shadow the registration."
- **After**: "Singleton - One instance per container that resolves it. Cached after first resolution (including decorators). Each container in the hierarchy gets its own instance reflecting its own dependency graph. Inheritance flows downward — child sees parent registrations plus its own — but never upward."

## Approach Alternatives Considered

### B: Smart caching (only when deps differ)

Reuse the parent's cached instance when the child has no additional registrations affecting the singleton's dependencies. Only create a per-container instance when the resolution context actually differs.

**Rejected because:** Complex to implement correctly — requires tracking which abstractions each singleton depends on and comparing registrations across containers. Risk of subtle bugs if the "same deps" detection is wrong.

### C: Fix only `{ multiple: true }` resolution

In `resolveRegistration`, use `this` instead of `resolveFrom` only for `{ multiple: true }` dependencies.

**Rejected because:** Prevents bleed but the child doesn't get its own aggregated view — CarProduct wouldn't appear in the child's ProductRegistry. Does not meet the requirement that child sees parent + own registrations.
