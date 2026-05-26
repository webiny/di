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

### Code Changes

All changes are in `resolveRegistration` (`src/Container.ts`). TypeScript `private` allows same-class instance access — `this` can read/write `resolveFrom.instances` and call `resolveFrom.applyDecorators` since both are `Container`.

#### Change 1: Singleton cache lookup and write

- **Cache lookup**: `resolveFrom.instances.get(registration)` instead of `this.instances.get(registration)`
- **Cache write**: `resolveFrom.instances.set(registration, decoratedInstance)` instead of `this.instances.set(registration, decoratedInstance)`

#### Change 2: Apply child decorator chain

After the owning container applies its decorators (`this.applyDecorators`), walk from `resolveFrom` up to `this` collecting intermediate containers, then apply each container's decorators in parent-to-child order. This ensures child-registered decorators are applied to parent-owned singletons.

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

  const decoratedInstance = this.applyDecorators(  // <-- only owning container's decorators
    abstraction, instance, resolutionStack, resolveFrom
  );

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

  // Apply owning container's decorators first
  let decoratedInstance = this.applyDecorators(
    abstraction, instance, resolutionStack, resolveFrom
  );

  // Apply child decorator chain (parent-to-child order)
  if (resolveFrom !== this) {
    const chain: Container[] = [];
    let current: Container | undefined = resolveFrom;
    while (current && current !== this) {
      chain.push(current);
      current = current.parent;
    }
    chain.reverse();
    for (const container of chain) {
      decoratedInstance = container.applyDecorators(
        abstraction, decoratedInstance, resolutionStack, resolveFrom
      );
    }
  }

  if (registration.scope === LifetimeScope.Singleton) {
    resolveFrom.instances.set(registration, decoratedInstance);  // <-- requesting container
  }

  // ...
}
```

### Decorator chain ordering

Decorators are applied in layers from the owning container outward to the requesting container:

```
Parent: ServiceA (singleton), DecoratorX for ServiceA
Child:  DecoratorY for ServiceA

child.resolve(ServiceA)  -> DecoratorY(DecoratorX(ServiceA))
parent.resolve(ServiceA) -> DecoratorX(ServiceA)  // child's DecoratorY not applied
```

Inner decorators (closer to the registration owner) wrap first. Outer decorators (closer to the requester) wrap last.

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

### `__tests__/registry/registry.test.ts`

This test file has cross-container singleton assertions that will also break:

- "child container resolves the same singleton registry as the parent" — `toBe` identity across parent/child no longer holds
- "plugins inside registry are same singleton instances as individually resolved" — if plugins are singletons and resolved from different containers, they get per-container instances

Same treatment as `singletons.test.ts` — update to assert behavioral equivalence within the same container.

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

### Decorator chain tests

14. **Child decorator applied to parent singleton**: Child registers a decorator for a parent-owned singleton — child's singleton gets both parent and child decorators
15. **Grandchild decorator chain**: Parent, child, and grandchild each register decorators — grandchild's singleton gets all three layers in parent-to-child order
16. **Parent singleton unaffected by child decorators**: After child resolves with its decorator, parent resolves its own singleton — only parent decorators applied

### Resolution ordering tests

17. **Both siblings resolve before parent**: child1 resolves (caches in child1), child2 resolves (caches in child2), then parent resolves — parent must see only parent registrations, not child1 or child2
18. **Parent resolves before child**: Parent caches its singleton, then child resolves — child gets its own instance (not the parent's cached one), parent's cache untouched
19. **Singleton dependency chain per-container**: Singleton B depends on singleton A — child resolves B, both A and B get per-container instances. Child's B.a is the same object as child's resolve(A).

## Concrete Example: ProductRegistry with Parent, Child, and Grandchild

This example illustrates the full scope of the problem and the fix using a realistic product registry scenario.

### Setup

```
Abstractions:
  - Product         (interface for a product)
  - ProductRegistry (singleton, depends on [Product, { multiple: true }])

Parent container registers:
  - ProductRegistry  (singleton)
  - CoffeeProduct    (implements Product)
  - ComputerProduct  (implements Product)
  - DecoratorA       (decorator for ProductRegistry — adds logging)

Child container registers:
  - CarProduct       (implements Product)
  - MobilePhoneProduct (implements Product)
  - DecoratorB       (decorator for ProductRegistry — adds caching)

Grandchild container registers:
  - LaptopProduct    (implements Product)
  - BallProduct      (implements Product)
```

### Before the fix (current broken behavior)

```
grandchild.resolve(ProductRegistry)
  → resolveFrom = grandchild
  → walks to parent (owns the singleton registration)
  → resolves [Product, { multiple: true }] from grandchild's perspective
  → collects: Coffee, Computer (parent) + Car, MobilePhone (child) + Laptop, Ball (grandchild)
  → applies ONLY parent's DecoratorA (child's DecoratorB and grandchild decorators are ignored)
  → caches in parent.instances ← BUG: 6 products cached in parent

parent.resolve(ProductRegistry)
  → finds cached instance in parent.instances
  → returns registry with 6 products ← WRONG: Car, MobilePhone, Laptop, Ball leaked from children

child.resolve(ProductRegistry)
  → finds cached instance in parent.instances (same polluted one)
  → returns registry with 6 products ← WRONG: Laptop, Ball leaked from grandchild
```

Every container sees the same polluted singleton. The first resolver's context "wins" and contaminates the cache for everyone.

### After the fix (per-container singleton scoping + decorator chain)

```
parent.resolve(ProductRegistry)
  → resolveFrom = parent (same as this)
  → resolves [Product, { multiple: true }] from parent's perspective
  → collects: Coffee, Computer
  → applies DecoratorA
  → caches in parent.instances
  → result: DecoratorA(ProductRegistry([Coffee, Computer]))

child.resolve(ProductRegistry)
  → resolveFrom = child
  → walks to parent (owns the singleton registration)
  → checks child.instances → miss
  → resolves [Product, { multiple: true }] from child's perspective
  → collects: Coffee, Computer (parent) + Car, MobilePhone (child)
  → applies DecoratorA (parent), then DecoratorB (child)
  → caches in child.instances
  → result: DecoratorB(DecoratorA(ProductRegistry([Coffee, Computer, Car, MobilePhone])))

grandchild.resolve(ProductRegistry)
  → resolveFrom = grandchild
  → walks to parent (owns the singleton registration)
  → checks grandchild.instances → miss
  → resolves [Product, { multiple: true }] from grandchild's perspective
  → collects: Coffee, Computer (parent) + Car, MobilePhone (child) + Laptop, Ball (grandchild)
  → applies DecoratorA (parent), then DecoratorB (child), then grandchild's decorators (none)
  → caches in grandchild.instances
  → result: DecoratorA(ProductRegistry([Coffee, Computer, Car, MobilePhone, Laptop, Ball]))

parent.resolve(ProductRegistry)
  → finds cached instance in parent.instances
  → returns: DecoratorA(ProductRegistry([Coffee, Computer])) ← CORRECT, unpolluted

child.resolve(ProductRegistry)
  → finds cached instance in child.instances
  → returns: DecoratorB(DecoratorA(ProductRegistry([Coffee, Computer, Car, MobilePhone]))) ← CORRECT
```

Each container sees exactly the registrations from its own level and above — never from below. Decorators accumulate in parent-to-child order. Repeated resolution from the same container returns the cached singleton instance.

## Breaking Change

This is a **breaking semantic change** to `@webiny/di`. The singleton contract changes from "one shared instance across the hierarchy" to "one instance per container that resolves it."

Impact:

- Code that relies on `child.resolve(X) === parent.resolve(X)` (reference identity across containers) will break
- Singletons without `{ multiple: true }` deps will now create per-container instances instead of sharing — this is redundant but not incorrect
- The change must be released as a **semver major or minor with explicit changelog entry**, not a patch

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
