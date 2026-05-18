# Bug: Singleton cache key collision with minified class names

## Summary

When multiple implementations of the same abstraction are registered as singletons, and a bundler (rspack, webpack, esbuild) minifies class names, all implementations resolve to the first one registered. The singleton cache returns stale instances because the cache key is identical for all of them.

## Root Cause

`src/Container.ts` line 228 builds the singleton cache key as:

```typescript
const instanceKey = `${abstraction.token.toString()}::${registration.implementation.name}`;
```

- `abstraction.token.toString()` is the same for all implementations of the same abstraction (e.g., `"Symbol(Plugin)"`).
- `registration.implementation.name` is the class name, which bundlers minify to the same short identifier (e.g., `"a"`).

Result: all implementations get the same cache key (e.g., `"Symbol(Plugin)::a"`), and the first cached instance is returned for all subsequent resolves.

## Reproduction

Register three different classes with the same `class.name` as singletons against the same abstraction. Resolve all — only the first implementation is ever instantiated.

```typescript
function makeImpl(marker: string) {
  class a {
    id() {
      return marker;
    }
  }
  return a;
}

const ImplA = makeImpl("a"); // ImplA.name === "a"
const ImplB = makeImpl("b"); // ImplB.name === "a"
const ImplC = makeImpl("c"); // ImplC.name === "a"

container
  .register(createImplementation({ abstraction, implementation: ImplA, dependencies: [] }))
  .inSingletonScope();
container
  .register(createImplementation({ abstraction, implementation: ImplB, dependencies: [] }))
  .inSingletonScope();
container
  .register(createImplementation({ abstraction, implementation: ImplC, dependencies: [] }))
  .inSingletonScope();

container.resolveAll(abstraction);
// Expected: [{ id: "a" }, { id: "b" }, { id: "c" }]
// Actual:   [{ id: "a" }, { id: "a" }, { id: "a" }]
```

## Failing Test

`__tests__/registry/registry.test.ts` — test case: "singleton implementations with identical class names resolve to distinct instances"

## Impact

Any project using `@webiny/di` with a bundler that minifies class names will see this bug when registering multiple singleton implementations of the same abstraction. Single-implementation abstractions are unaffected.

## Environment

Works in development (class names preserved). Breaks in production builds with minification enabled.

## Possible Fixes

The cache key must be unique per registration, not per class name. Options:

1. **Registration index** — include the registration's position in the array (e.g., `Symbol(Plugin)::0`, `Symbol(Plugin)::1`). Simple, but breaks if registrations are reordered.
2. **Unique ID per registration** — assign a unique symbol or counter to each `Registration` object at creation time. Stable regardless of class name or order.
3. **Use the registration object itself as key** — switch `instances` from `Map<string, any>` to `WeakMap<Registration, any>` or `Map<Registration, any>`. No string key needed.
