# Fix Spec: Singleton Cache Key Collision

## Problem

```typescript
// src/Container.ts line 228
const instanceKey = `${abstraction.token.toString()}::${registration.implementation.name}`;
```

When rspack minifies class names, `AuthPlugin`, `CachePlugin`, and `LoggingPlugin` all become `a`. The cache key for all three becomes `Symbol(Plugin)::a`, so the first cached instance is returned for every resolve.

## Proposed Fix

Use the `Registration` object reference itself as the singleton cache key instead of a string derived from `class.name`. This is the approach used by inversify and tsyringe — object identity is guaranteed unique even after bundler minification.

### Why object identity works

The `Registration` object is created once in `register()` (line 41), stored in the `registrations` Map array (line 48), and the same reference is read back in:

- `tryResolveFromCurrentContainer` (line 208): `const registration = registrations[registrations.length - 1]!`
- `resolveMultiple` (line 293): `for (const registration of registrations)`

Both paths pass the same object reference to `resolveRegistration`. `Map` uses reference equality (`===`) for object keys, so the same `Registration` always hits the same cache entry.

`inSingletonScope()` mutates `registration.scope` after creation, but mutating a property does not change object identity — the `Map` key still matches.

### Changes

#### 1. Change the `instances` map type

```typescript
// src/Container.ts

// Before:
private instances = new Map<string, any>();

// After:
private instances = new Map<Registration, any>();
```

#### 2. Use the registration object as the cache key

```typescript
// src/Container.ts — resolveRegistration()

// Before:
const instanceKey = `${abstraction.token.toString()}::${registration.implementation.name}`;
if (registration.scope === LifetimeScope.Singleton) {
  const existing = this.instances.get(instanceKey);
  if (existing) {
    return existing;
  }
}
// ...
if (registration.scope === LifetimeScope.Singleton) {
  this.instances.set(instanceKey, decoratedInstance);
}

// After:
if (registration.scope === LifetimeScope.Singleton) {
  const existing = this.instances.get(registration);
  if (existing) {
    return existing;
  }
}
// ...
if (registration.scope === LifetimeScope.Singleton) {
  this.instances.set(registration, decoratedInstance);
}
```

That's it. No new fields, no counters, no changes to `Registration` type.

### What stays the same

- `Registration` interface in `types.ts` — no changes
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
register(AuthPluginImpl).inSingletonScope()    → reg0 = Registration { impl: a, name: "a" }
register(CachePluginImpl).inSingletonScope()   → reg1 = Registration { impl: a, name: "a" }
register(LoggingPluginImpl).inSingletonScope() → reg2 = Registration { impl: a, name: "a" }

resolveAll(PluginAbstraction):
  reg0 → key = "Symbol(Plugin)::a" → cache miss → create AuthPlugin → cache it
  reg1 → key = "Symbol(Plugin)::a" → cache HIT  → return AuthPlugin ← WRONG
  reg2 → key = "Symbol(Plugin)::a" → cache HIT  → return AuthPlugin ← WRONG

Result: [AuthPlugin, AuthPlugin, AuthPlugin]
```

#### After (fixed)

```
register(AuthPluginImpl).inSingletonScope()    → reg0 = Registration { impl: a }
register(CachePluginImpl).inSingletonScope()   → reg1 = Registration { impl: a }
register(LoggingPluginImpl).inSingletonScope() → reg2 = Registration { impl: a }

resolveAll(PluginAbstraction):
  reg0 → key = reg0 (object ref) → cache miss → create AuthPlugin    → cache it
  reg1 → key = reg1 (object ref) → cache miss → create CachePlugin   → cache it
  reg2 → key = reg2 (object ref) → cache miss → create LoggingPlugin  → cache it

Result: [AuthPlugin, CachePlugin, LoggingPlugin]
```

### Child container behavior

No change. Child containers walk up to the parent's `resolveRegistration`, which holds the parent's `Registration` objects. Singletons are cached in the container where the registration lives, keyed by that registration's object reference.

```
Parent: register(AuthPluginImpl).inSingletonScope() → reg0
Child:  resolve(PluginAbstraction)
  → child has no registration
  → walks to parent
  → parent.resolveRegistration(reg0) → instances.get(reg0)
  → cache miss → create → instances.set(reg0, instance)
  → return instance

Parent: resolve(PluginAbstraction)
  → parent.resolveRegistration(reg0) → instances.get(reg0)
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
After: two distinct `Registration` objects → two separate singleton instances.

This is the correct behavior — two registrations should produce two instances. If the user wanted one instance, they should register once.

**Registration objects are never cloned:**

The fix relies on object identity. If `Registration` objects were ever shallow-copied or spread into a new object, the cache key would break. This does not happen anywhere in the codebase — `register()` creates the object, stores it in an array, and the same reference is read back during resolution.
