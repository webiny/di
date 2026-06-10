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

  // resolutionStack.set/delete and dep resolution unchanged — see Before

  // Apply owning container's decorators first
  let decoratedInstance = this.applyDecorators(
    abstraction, instance, resolutionStack, resolveFrom
  );

  // Apply child decorator chain (parent-to-child order).
  // Invariant: resolveFrom is always a descendant of this (or this itself).
  // This is guaranteed by resolveInternal's walk-up — the only path to
  // resolveRegistration is via the ancestor chain from resolveFrom.
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

Decorator constructor dependencies at every level of the chain are resolved from `resolveFrom` (the outermost requesting container), not from the intermediate container that registered the decorator. This means child overrides propagate into intermediate decorator deps as well as the outermost decorator.

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
- "should share child-level singleton with its own nested children" — grandchild will get a per-container instance different from child's
- "should inject same singleton instance into multiple consumers" — cross-container `toBe` identity on injected deps will fail
- "should handle singleton with decorators applied at parent level" — `i1 === i2 === i3` across root and children will fail

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

1. **No upward bleed**: Parent singleton is not polluted when child resolves first with additional `{ multiple: true }` registrations. Assert both: parent's resolved list contains only parent products, and child's cache entry is a different object from parent's cache entry
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
17. **Intermediate decorator deps resolved from requesting container**: Child registers a decorator with its own dependency. Grandchild overrides that dependency. Grandchild resolves the singleton — the child's decorator receives the grandchild's override for its constructor dependency, not the child's own registration

### Resolution ordering tests

18. **Both siblings resolve before parent**: child1 resolves (caches in child1), child2 resolves (caches in child2), then parent resolves — parent must see only parent registrations, not child1 or child2
19. **Parent resolves before child**: Parent caches its singleton, then child resolves — child gets its own instance (not the parent's cached one), parent's cache untouched
20. **Singleton dependency chain per-container**: Singleton B depends on singleton A — child resolves B, both A and B get per-container instances. Child's B.a is the same object as child's resolve(A).
21. **Singleton dependency chain — parent pre-cached**: Parent resolves singleton A first (cached in parent). Then child resolves singleton B (which depends on A). Child's B resolves its own instance of A (cached in child) because the singleton cache lookup checks `resolveFrom.instances` (child), not `this.instances` (parent). Assert both: `B.a !== parent.resolve(A)` (child constructed its own A, different from parent's) and `B.a === child.resolve(A)` (child cached A during B's resolution; subsequent child.resolve(A) returns the same object). Document this as expected per-container singleton behavior.

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
  → result: DecoratorB(DecoratorA(ProductRegistry([Coffee, Computer, Car, MobilePhone, Laptop, Ball])))

parent.resolve(ProductRegistry)
  → finds cached instance in parent.instances
  → returns: DecoratorA(ProductRegistry([Coffee, Computer])) ← CORRECT, unpolluted

child.resolve(ProductRegistry)
  → finds cached instance in child.instances
  → returns: DecoratorB(DecoratorA(ProductRegistry([Coffee, Computer, Car, MobilePhone]))) ← CORRECT
```

Each container sees exactly the registrations from its own level and above — never from below. Decorators accumulate in parent-to-child order. Repeated resolution from the same container returns the cached singleton instance.

## Global Scope

### Problem

Per-container singleton scoping solves the bleed bug, but creates a gap for shared resources. A SQL connection, HTTP client, or logger should be constructed from a stable context (the owning container) and shared downward to children — not rebuilt per container with potentially different deps. Developers need a way to opt into "owner-context resolution, shared downward on cache hit" semantics where child registrations and decorators have zero influence.

Note: Global scope does **not** guarantee a single instance across the entire hierarchy. If a child resolves before its parent, both construct independently (from the same owning-container context, producing behaviorally equivalent instances). The guarantee is: once an instance is cached in a container, all descendants reuse it via walk-up lookup. To ensure a true single instance, resolve from the root container first.

### Solution

Add `LifetimeScope.Global` to the enum and `.inGlobalScope()` to `RegistrationBuilder`.

```typescript
container.register(SqlConnectionImpl).inGlobalScope();
```

The three lifetime scopes form a clear hierarchy:

| Scope         | Instance per                     | Deps resolved from  | Decorators from                                    | Cache lookup             | Sharing                                              |
| ------------- | -------------------------------- | ------------------- | -------------------------------------------------- | ------------------------ | ---------------------------------------------------- |
| **Transient** | Every call                       | Resolving container | Owning container classes, resolver deps            | None                     | None                                                 |
| **Singleton** | Container                        | Resolving container | Full chain classes (owner→resolver), resolver deps | Resolving container only | Never — each container gets its own                  |
| **Global**    | First resolver + shared downward | Owning container    | Owning container classes, owning container deps    | Walk up from resolver    | Downward — children reuse ancestor's cached instance |

### Code Changes

Changes are in `src/Container.ts` (`resolveRegistration` third branch, `RegistrationBuilder.inGlobalScope()`) and `src/types.ts` (`LifetimeScope.Global` enum value).

#### Cache lookup — walk up ancestors

Instead of checking only `resolveFrom.instances` (singleton behavior), walk from `resolveFrom` up through its parent chain. If any ancestor has a cached instance for this registration, return it immediately.

```typescript
if (registration.scope === LifetimeScope.Global) {
  let current: Container | undefined = resolveFrom;
  while (current) {
    const existing = current.instances.get(registration);
    if (existing !== undefined) {
      return existing;
    }
    if (current === this) break; // don't walk above the owning container
    current = current.parent;
  }
}
```

The walk stops at `this` (the owning container). No container above the owner ever caches entries for this registration, so walking further is logically incoherent.

#### Dep resolution — owning container only

Use `this` instead of `resolveFrom` for dependency resolution. Child registrations have zero influence on the global singleton's dependencies.

#### Decorators — owning container only

Apply only `this.applyDecorators(abstraction, instance, resolutionStack, this)` — passing `this` as both the receiver and `resolveFrom`. This ensures decorator _classes_ come from the owning container and decorator _constructor dependencies_ are also resolved from the owning container. No child decorator chain walk. Child-registered decorators are invisible to global singletons.

#### Cache write — resolving container

Store the constructed instance in `resolveFrom.instances` (same as singleton scope). This means the container that triggered construction owns the cache entry, and its children find it via the walk-up.

### Behavior

#### Case A: Parent resolves first

```
Parent: SqlConnection (global scope)
Child1, Child2 = parent.createChildContainer()

parent.resolve(SqlConnection)  → no cache anywhere, constructs from parent context, caches in parent
child1.resolve(SqlConnection)  → walks up, finds in parent → same instance ✓
child2.resolve(SqlConnection)  → walks up, finds in parent → same instance ✓

parent.resolve(SqlConnection) === child1.resolve(SqlConnection)  // true
parent.resolve(SqlConnection) === child2.resolve(SqlConnection)  // true
```

#### Case B: Child resolves first

```
Parent: SqlConnection (global scope)
Child1, Child2 = parent.createChildContainer()
Grandchild = child1.createChildContainer()

child1.resolve(SqlConnection)  → walks up to parent, no cache, constructs from parent context, caches in child1
parent.resolve(SqlConnection)  → no cache in parent, constructs from parent context, caches in parent
child2.resolve(SqlConnection)  → walks up, finds in parent → parent's instance

grandchild.resolve(SqlConnection) → walks up, finds in child1 → child1's instance

child1.resolve(SqlConnection) === parent.resolve(SqlConnection)   // false (different instances)
child2.resolve(SqlConnection) === parent.resolve(SqlConnection)   // true  (child2 found parent's cache)
grandchild.resolve(SqlConnection) === child1.resolve(SqlConnection) // true (grandchild found child1's cache)
```

All instances are behaviorally equivalent (same deps, same decorators from owning container), but they are distinct objects when constructed independently.

#### Case C: Child decorators and registrations have no effect

```
Parent: SqlConnection (global scope), LoggingDecorator for SqlConnection
Child:  MetricsDecorator for SqlConnection, ExtraService

child.resolve(SqlConnection)
  → walks up, no cache
  → constructs from parent context (MetricsDecorator is invisible)
  → applies only parent's LoggingDecorator (child's MetricsDecorator is ignored)
  → caches in child
  → result: LoggingDecorator(SqlConnection)
```

If child-specific behavior is needed, the developer creates a separate abstraction and implementation that wraps or depends on the global singleton.

### API Changes

#### `LifetimeScope` enum (in `src/types.ts`, after change)

```typescript
export enum LifetimeScope {
  Transient,
  Singleton,
  Global
}
```

#### `RegistrationBuilder` (in `src/Container.ts`, after change)

```typescript
class RegistrationBuilder<T> {
  constructor(private registration: Registration<T>) {}

  inSingletonScope(): void {
    this.registration.scope = LifetimeScope.Singleton;
  }

  inGlobalScope(): void {
    this.registration.scope = LifetimeScope.Global;
  }
}
```

No changes to `Registration` interface — it already has `scope: LifetimeScope`. `RegistrationBuilder` is an internal (unexported) class — consumers use it inline: `container.register(X).inGlobalScope()`.

### New Tests

#### Global scope isolation tests

1. **Parent resolves first — children share instance**: Parent resolves global singleton, both children get the same instance via `toBe` identity
2. **Child resolves first — parent gets its own**: Child1 resolves before parent, parent resolves its own, child2 gets parent's, grandchild of child1 gets child1's
3. **Child decorators ignored**: Child registers a decorator for a global singleton — child's resolution does not include that decorator
4. **Child `{ multiple: true }` registrations ignored**: Global singleton depends on `[Product, { multiple: true }]` — child's Product registrations are invisible to it. Assert exact list contents (not just length): resolved products match only the parent's registered product names, and child's product name is absent
5. **Same-container identity**: Resolving a global singleton twice from the same container returns the same instance
6. **Walk-up returns nearest ancestor's cache**: Child1 resolves before parent. Grandchild (child of child1) resolves — gets child1's instance (nearest ancestor hit), not parent's. Verifies the walk-up stops at the first cache hit, not at the owning container
7. **Deep hierarchy sharing**: Root resolves global singleton, grandchild and great-grandchild all get the same instance via walk-up

### Approach Alternatives Considered

#### B: Separate registration method (`registerGlobal`)

```typescript
container.registerGlobal(SqlConnectionImpl);
```

**Rejected because:** Duplicates registration logic. Inconsistent with how singleton scope works (builder pattern). Every new scope means a new method.

#### C: Scope as a strategy object

Replace the enum with a scope strategy object that controls cache lookup, dep resolution, and decorator application.

**Rejected because:** Over-engineered for three scopes. Breaks the existing API. Adds abstraction nobody asked for.

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
- **New**: "Global - One instance shared downward through the hierarchy. Cached on first resolution. Dependencies and decorators resolved exclusively from the owning container — child registrations and decorators have no effect. Children reuse an ancestor's cached instance if one exists (walk-up lookup)."

## Approach Alternatives Considered

### B: Smart caching (only when deps differ)

Reuse the parent's cached instance when the child has no additional registrations affecting the singleton's dependencies. Only create a per-container instance when the resolution context actually differs.

**Rejected because:** Complex to implement correctly — requires tracking which abstractions each singleton depends on and comparing registrations across containers. Risk of subtle bugs if the "same deps" detection is wrong.

### C: Fix only `{ multiple: true }` resolution

In `resolveRegistration`, use `this` instead of `resolveFrom` only for `{ multiple: true }` dependencies.

**Rejected because:** Prevents bleed but the child doesn't get its own aggregated view — CarProduct wouldn't appear in the child's ProductRegistry. Does not meet the requirement that child sees parent + own registrations.
