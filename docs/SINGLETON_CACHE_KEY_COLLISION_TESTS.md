# Test Plan: Singleton Cache Key Collision

Tests to harden the fix for the singleton cache key collision bug where bundler minification causes all implementations of the same abstraction to share a cache key.

## Shared Helpers

`__tests__/singletonCacheKeyCollision/helpers.ts`

A `makeImpl(marker)` factory that creates classes with identical `.name` (simulating minification). Each class returns its marker from an `id()` method. Also exports a shared `ServiceAbstraction`.

```typescript
export const ServiceAbstraction = new Abstraction<IService>("Service");

export function makeImpl(marker: string) {
  class a implements IService {
    id(): string {
      return marker;
    }
  }
  return a;
}
```

## Test Files

### 1. `simulated.test.ts` (existing)

Basic reproduction — three minified singletons, `resolveAll` returns distinct instances.

### 2. `rspackMinified.test.ts` (existing)

Real rspack production bundle. Bundles a fixture with minification, executes it, asserts the output.

### 3. `withDecorators.test.ts`

Register three minified singleton implementations. Add a decorator for the same abstraction that wraps the `id()` return value (e.g., `"decorated:<original>"`). Resolve all.

**Assertions:**

- All 3 resolved instances are decorator instances
- Each decorated instance returns a distinct id: `"decorated:a"`, `"decorated:b"`, `"decorated:c"`
- Resolving twice returns the same decorated singleton instances (cache integrity)

### 4. `withChildContainer.test.ts`

Parent registers three minified singletons (a, b, c). Child overrides one (registers a new implementation with marker "b-override" for the same abstraction).

**Assertions:**

- Parent `resolveAll` returns 3 instances: a, b, c
- Child `resolveAll` returns 4 instances: a, b, c (from parent) + b-override (from child)
- Child `resolve` (single) returns b-override (last registered in child wins)
- Parent singletons are the same object references when accessed from either container
- Child's override is a different instance from the parent's b

### 5. `withMixedScopes.test.ts`

Register three minified implementations — first as singleton, second as transient, third as singleton.

**Assertions:**

- `resolveAll` twice: singleton instances (first, third) are the same references across both calls
- Transient instance (second) is a different reference on each `resolveAll` call
- All three return distinct markers on every call (no cross-contamination)

### 6. `withComposite.test.ts`

Register three minified singletons. Register a composite that takes `[ServiceAbstraction, { multiple: true }]`. Resolve the composite as a single instance.

**Assertions:**

- Resolved composite contains all 3 implementations
- Each implementation inside the composite has a distinct id
- Implementations inside the composite are the same singleton instances as individually resolved
- Resolving the composite twice returns the same composite instance (if registered as singleton)

### 7. `withResolveWithDependencies.test.ts`

Register three minified singletons. Use `container.resolveWithDependencies()` to instantiate an unregistered `Consumer` class that takes `IService[]` as a constructor parameter.

**Assertions:**

- Consumer receives all 3 distinct implementations
- Each implementation has a distinct id: a, b, c
- The implementations injected into the consumer are the same singleton instances as individually resolved

### 8. `withDeepHierarchy.test.ts`

Register three minified singletons in the root container. Create a chain: root → child → grandchild → greatGrandchild.

**Assertions:**

- `resolveAll` from every level returns the same 3 singleton instances (same object references)
- `resolve` (single, last-registered wins) from every level returns the same instance
- Adding a new minified singleton at the grandchild level: greatGrandchild sees 4 implementations, child sees 3, root sees 3
- The grandchild-level singleton is a distinct instance from the root-level ones

## File Structure

```
__tests__/singletonCacheKeyCollision/
  helpers.ts
  fixture.ts
  rspackMinified.test.ts
  simulated.test.ts
  withDecorators.test.ts
  withChildContainer.test.ts
  withMixedScopes.test.ts
  withComposite.test.ts
  withResolveWithDependencies.test.ts
  withDeepHierarchy.test.ts
```
