# Fix Spec: Singleton Cache Key Collision

## Problem

```typescript
// src/Container.ts line 228
const instanceKey = `${abstraction.token.toString()}::${registration.implementation.name}`;
```

When rspack minifies class names, `AuthPlugin`, `CachePlugin`, and `LoggingPlugin` all become `a`. The cache key for all three becomes `Symbol(Plugin)::a`, so the first cached instance is returned for every resolve.

## Proposed Fix

Add a unique ID to each `Registration` object at creation time. Use it as the singleton cache key instead of `class.name`.

### Changes

#### 1. Add a registration counter to `Container`

```typescript
// src/Container.ts

export class Container {
  private static registrationId = 0;
  // ...
}
```

#### 2. Add `id` to the `Registration` type

```typescript
// src/types.ts

export interface Registration<T = any> {
  id: number; // <-- new
  implementation: Constructor<T>;
  dependencies: Dependency[];
  scope: LifetimeScope;
}
```

#### 3. Assign ID when registering

```typescript
// src/Container.ts — register()

const registration: Registration<T> = {
  id: Container.registrationId++, // <-- new
  implementation,
  dependencies: dependencies || [],
  scope: LifetimeScope.Transient
};
```

Same for `registerComposite`:

```typescript
const registration: Registration<T> = {
  id: Container.registrationId++, // <-- new
  implementation,
  dependencies: dependencies || [],
  scope: LifetimeScope.Transient
};
```

#### 4. Use `registration.id` in the cache key

```typescript
// src/Container.ts — resolveRegistration()

// Before:
const instanceKey = `${abstraction.token.toString()}::${registration.implementation.name}`;

// After:
const instanceKey = `${abstraction.token.toString()}::${registration.id}`;
```

### What stays the same

- `resolveInternal` — unchanged, it delegates to `tryResolveFromCurrentContainer`
- `tryResolveFromCurrentContainer` — unchanged, it picks the last registration and calls `resolveRegistration`
- `resolveMultiple` — unchanged, it iterates all registrations and calls `resolveRegistration` for each
- `applyDecorators` — unchanged, decorators are applied after instance creation
- `registerInstance` — unchanged, instance registrations don't use the singleton cache
- `registerFactory` — unchanged, factory registrations don't use the singleton cache
- `registerDecorator` — unchanged, decorators are not cached as singletons

### Resolution flow (before vs after)

#### Before (broken)

```
register(AuthPluginImpl).inSingletonScope()   → Registration { impl: a, name: "a" }
register(CachePluginImpl).inSingletonScope()  → Registration { impl: a, name: "a" }
register(LoggingPluginImpl).inSingletonScope() → Registration { impl: a, name: "a" }

resolveAll(PluginAbstraction):
  registration[0] → key = "Symbol(Plugin)::a" → cache miss → create AuthPlugin → cache it
  registration[1] → key = "Symbol(Plugin)::a" → cache HIT  → return AuthPlugin ← WRONG
  registration[2] → key = "Symbol(Plugin)::a" → cache HIT  → return AuthPlugin ← WRONG

Result: [AuthPlugin, AuthPlugin, AuthPlugin]
```

#### After (fixed)

```
register(AuthPluginImpl).inSingletonScope()    → Registration { id: 0, impl: a }
register(CachePluginImpl).inSingletonScope()   → Registration { id: 1, impl: a }
register(LoggingPluginImpl).inSingletonScope() → Registration { id: 2, impl: a }

resolveAll(PluginAbstraction):
  registration[0] → key = "Symbol(Plugin)::0" → cache miss → create AuthPlugin    → cache it
  registration[1] → key = "Symbol(Plugin)::1" → cache miss → create CachePlugin   → cache it
  registration[2] → key = "Symbol(Plugin)::2" → cache miss → create LoggingPlugin  → cache it

Result: [AuthPlugin, CachePlugin, LoggingPlugin]
```

### Child container behavior

No change. Child containers walk up to the parent's `resolveRegistration`, which holds the parent's `Registration` objects with their own IDs. Singletons are cached in the container where the registration lives, keyed by that registration's unique ID.

```
Parent: register(AuthPluginImpl).inSingletonScope() → Registration { id: 0 }
Child:  resolve(PluginAbstraction)
  → child has no registration
  → walks to parent
  → parent.resolveRegistration(reg { id: 0 }) → key "Symbol(Plugin)::0"
  → cache miss → create → cache in parent
  → return instance

Parent: resolve(PluginAbstraction)
  → parent.resolveRegistration(reg { id: 0 }) → key "Symbol(Plugin)::0"
  → cache HIT → return same instance

Both get the same singleton. ✓
```

### Edge cases

**Same class registered twice under the same abstraction:**

```typescript
container.register(AuthPluginImpl).inSingletonScope();
container.register(AuthPluginImpl).inSingletonScope();
```

Before: both get key `Symbol(Plugin)::AuthPlugin` → same cached instance.
After: id 0 and id 1 → two separate singleton instances.

This is the correct behavior — two registrations should produce two instances. If the user wanted one instance, they should register once.

**Counter overflow:**

`Number.MAX_SAFE_INTEGER` is 9007199254740991. Not a practical concern.
