# Per-Container Singleton Scoping

Revision 2 (2026-09-11). Supersedes the original spec. The first revision was written against an
older `Container.ts` and drifted after `feat: add Container.resolveImplementation (#17)` and
`fix: decorators resolution`. Section "Review findings" lists every issue found in the first
revision and the decision taken for each. The rest of the document is the resulting design.

## Problem

When a singleton registered in a parent container has a `{ multiple: true }` dependency, child
container registrations bleed into the parent's cached singleton instance.

### Root cause

In `resolveRegistration` (`src/Container.ts`), singletons are cached in `this.instances`, the
container that **owns** the registration. Dependencies are resolved via `resolveFrom`, the
container that **requested** the resolution. The cache key is the `Registration` object, so one
cache slot is shared by every container in the hierarchy.

When a child first resolves a parent's singleton:

1. Child calls `resolve(ProductRegistry)`, walks up to the parent.
2. Parent's `resolveRegistration` resolves dependencies with `resolveFrom = child`.
3. `resolveMultiple` for `[Product, { multiple: true }]` collects from parent (Coffee, Computer)
   **and** child (Car).
4. The instance holding all three products is cached in the **parent's** `instances` map.
5. Parent later resolves `ProductRegistry` and gets the child's Car.

The same mechanism also leaks plain overrides. If a child overrides `Logger` and is the first to
resolve a parent singleton that depends on `Logger`, every later resolver, including the parent,
gets the child's logger. `__tests__/childContainer/CHILD_CONTAINER_BUG.md` documented this as a
known follow-up when `resolveFrom` was introduced.

### Regression tests (committed, failing)

`__tests__/registry/registry.test.ts`:

1. `child-only plugin registration must not pollute the parent singleton registry`
2. `parent registration after child resolution must not bleed into child's cached singleton`

Both fail today at `expect(parentPlugins).toHaveLength(3)` with 4.

## Review findings

Issues found when re-reading the first revision against the current `Container.ts` (base
`09d73c0`). Each carries the decision that the design below implements.

### F1. The decorator chain walk double-applies parent decorators

The first revision walked from `resolveFrom` up to `this` and called `container.applyDecorators`
for each intermediate container. Since `fix: decorators resolution`, `applyDecorators` calls
`collectDecorators`, which already walks **up** the ancestor chain of whatever container it is
called on. Calling it per intermediate container applies the parent's decorators once per level:
twice for a child, three times for a grandchild.

**Decision:** drop the manual walk. Call `resolveFrom.applyDecorators(...)` once.
`resolveFrom.collectDecorators(token)` already returns the whole chain from root to `resolveFrom`
in parent-to-child order, including containers **above** the owner. This is one changed receiver,
not a new loop.

### F2. The spec contradicted itself on transient scope

The scope table said transient decorators come from the owning container only, while the
proposed code applied the child chain to every scope. One of them had to give.

**Decision:** decorators follow the requesting container for every non-global path. Everything
else in resolution is already viewed from `resolveFrom` (dependency overrides, `{ multiple: true }`
collection), so decorators registered in a child applying to services the child resolves is the
consistent rule. This is a behavior change for transient, instance and factory registrations
resolved through a child that has registered a decorator. No existing test covers that case.

The minimal-change alternative, keeping `this.applyDecorators` for transient/instance/factory and
changing only the singleton path, is rejected because it makes "which decorators apply" depend on
lifetime scope, which nobody will predict correctly.

### F3. Global scope was not global

The first revision cached global instances in the requesting container with a walk-up lookup.
Because global dependencies and decorators are resolved from the owner only, the constructed
instance is identical regardless of who resolves it. The walk-up therefore bought nothing and
introduced an ordering dependence ("Case B": a child resolving before its parent produced a second
instance that siblings never saw).

**Decision:** cache global instances in the **owning** container's `instances` map, exactly where
singletons are cached today. One registration, one instance, no matter who resolves first. This
also makes migration clean: code that relied on the old cross-container identity switches to
`inGlobalScope()` and gets identical identity semantics, minus the bleed.

### F4. Falsy singleton values are never cached

`if (existing)` at the cache check would re-construct any singleton that resolved to `0`, `false`,
`""` or `null`. Carried over from `docs/2026-05-26-container-hardening-design.md`.

In practice this cannot be hit: the only value that enters the cache is the result of `new`, which
is always an object. The check is still wrong on its face and costs nothing to fix.

**Decision:** `if (existing !== undefined)`. `resolveInternal` already treats `undefined` as "not
found" and falls through to the parent, so `undefined` is the only value that cannot be cached
either way. No test, since no registration path can produce a falsy instance.

### F5. Stale references

- The implementation plan cites line numbers and commit hashes (`e541a8b`, `fb8ec03`) from before
  a rebase. Actual commits are `a96c546` and `baf1179`.
- `Container.resolveImplementation` did not exist when the first revision was written. It calls
  `resolveRegistration` with a fresh transient registration and `this` as `resolveFrom`, so it is
  unaffected, but the plan's "modify lines 222-261" no longer points at the right code.

**Decision:** regenerate `docs/superpowers/plans/2026-05-26-per-container-singleton-scoping.md`
from this revision before implementation starts.

## Design

### Three lifetime scopes

| Scope         | Instance per         | Deps resolved from   | Decorators (classes and their deps) | Cache location |
| ------------- | -------------------- | -------------------- | ----------------------------------- | -------------- |
| **Transient** | Every call           | Requesting container | Requesting container's chain        | None           |
| **Singleton** | Requesting container | Requesting container | Requesting container's chain        | Requesting     |
| **Global**    | Registration         | Owning container     | Owning container's chain            | Owning         |

"Chain" means the container plus all of its ancestors, applied root-first. For the requesting
container that is root → … → owner → … → requester. For the owning container it is root → … →
owner.

```typescript
container.register(ProductRegistryImpl).inSingletonScope(); // one per resolving container
container.register(SqlConnectionImpl).inGlobalScope(); // one, shared by the whole hierarchy
```

### Singleton scope

Each container that resolves the singleton gets its own instance, built from its own view of the
hierarchy and cached in its own `instances` map. Inheritance flows downward (child sees parent
registrations plus its own) and never upward.

```
Parent: ProductRegistry (singleton), CoffeeProduct, ComputerProduct
Child:  CarProduct

parent.resolve(ProductRegistry)  -> [Coffee, Computer]       cached in parent
child.resolve(ProductRegistry)   -> [Coffee, Computer, Car]  cached in child
parent.resolve(ProductRegistry)  -> [Coffee, Computer]       from parent cache, unpolluted
```

Consequences worth stating plainly:

- `child.resolve(X) !== parent.resolve(X)` for singletons. Same-container identity still holds.
- A singleton without any overridable dependency still gets one instance per container. This is
  redundant construction, not incorrect behavior. Use global scope when sharing is the point.
- Singleton A depending on singleton B: a child resolving A constructs and caches its own B, even
  if the parent already cached a B. Per-container means per-container all the way down.

### Global scope

One instance per registration, constructed entirely from the owning container's point of view and
cached in the owning container. Children resolve the same object. Child registrations, overrides
and decorators have no effect on it.

```
Parent: SqlConnection (global), LoggingDecorator for SqlConnection
Child:  MetricsDecorator for SqlConnection, FileLogger overriding Logger

child.resolve(SqlConnection)  -> LoggingDecorator(SqlConnection(parent's Logger))  cached in parent
parent.resolve(SqlConnection) -> same object
```

If child-specific behavior is needed on top of a global, wrap it behind a separate abstraction
that depends on the global one.

### Decorators

`applyDecorators` is called on the container whose chain should apply, and the same container is
passed as `resolveFrom` so decorator constructor dependencies come from the same place:

- Non-global paths: `resolveFrom.applyDecorators(abstraction, instance, stack, resolveFrom)`
- Global path: `this.applyDecorators(abstraction, instance, stack, this)`

Order is root-first, so inner decorators are the ones registered closest to the root:

```
Parent: ServiceA (singleton), DecoratorX for ServiceA
Child:  DecoratorY for ServiceA

child.resolve(ServiceA)  -> DecoratorY(DecoratorX(ServiceA))
parent.resolve(ServiceA) -> DecoratorX(ServiceA)
```

## Code changes

All in `src/Container.ts` and `src/types.ts`. `private` members of another `Container` instance are
accessible from within the class, so `resolveFrom.instances` and `resolveFrom.applyDecorators`
compile as-is.

### `src/types.ts`

```typescript
export enum LifetimeScope {
  Transient,
  Singleton,
  Global
}
```

### `RegistrationBuilder`

```typescript
class RegistrationBuilder<T> {
  constructor(private registration: Registration<T>) {}

  inSingletonScope(): this {
    this.registration.scope = LifetimeScope.Singleton;
    return this;
  }

  inGlobalScope(): this {
    this.registration.scope = LifetimeScope.Global;
    return this;
  }
}
```

Returning `this` instead of `void` is a hardening item; it costs nothing and keeps the builder
chainable.

### `resolveRegistration`

Before (current main):

```typescript
private resolveRegistration<T>(
  abstraction: Abstraction<T>,
  registration: Registration<T>,
  resolutionStack: Map<symbol, boolean>,
  resolveFrom: Container
): T {
  if (registration.scope === LifetimeScope.Singleton) {
    const existing = this.instances.get(registration);
    if (existing) {
      return existing;
    }
  }

  resolutionStack.set(abstraction.token, true);

  const resolvedDeps = registration.dependencies.map(dep => {
    const [abstractionDep, depOptions] = Array.isArray(dep) ? dep : [dep, {}];
    return resolveFrom.resolveInternal(abstractionDep, new Map(resolutionStack), depOptions, resolveFrom);
  });

  const instance = new registration.implementation(...resolvedDeps);
  const decoratedInstance = this.applyDecorators(abstraction, instance, resolutionStack, resolveFrom);

  if (registration.scope === LifetimeScope.Singleton) {
    this.instances.set(registration, decoratedInstance);
  }

  resolutionStack.delete(abstraction.token);
  return decoratedInstance;
}
```

After:

```typescript
private resolveRegistration<T>(
  abstraction: Abstraction<T>,
  registration: Registration<T>,
  resolutionStack: Map<symbol, boolean>,
  resolveFrom: Container
): T {
  // Global instances live with the registration owner and are built from the owner's view.
  // Singletons live with the requester and are built from the requester's view.
  const isGlobal = registration.scope === LifetimeScope.Global;
  const context = isGlobal ? this : resolveFrom;

  if (registration.scope !== LifetimeScope.Transient) {
    const existing = context.instances.get(registration);
    if (existing !== undefined) {
      return existing;
    }
  }

  resolutionStack.set(abstraction.token, true);

  const resolvedDeps = registration.dependencies.map(dep => {
    const [abstractionDep, depOptions] = Array.isArray(dep) ? dep : [dep, {}];
    return context.resolveInternal(abstractionDep, new Map(resolutionStack), depOptions, context);
  });

  const instance = new registration.implementation(...resolvedDeps);
  const decoratedInstance = context.applyDecorators(abstraction, instance, resolutionStack, context);

  if (registration.scope !== LifetimeScope.Transient) {
    context.instances.set(registration, decoratedInstance);
  }

  resolutionStack.delete(abstraction.token);
  return decoratedInstance;
}
```

The whole change collapses to "pick the context container once, then use it for cache, deps and
decorators". For transient and singleton the context is `resolveFrom`; for global it is `this`.

### Other `applyDecorators` call sites (F2)

`tryResolveFromCurrentContainer` (instance registrations, factories) and `resolveMultiple`
(instance registrations, factories) call `this.applyDecorators(..., resolveFrom)`. Change the
receiver to `resolveFrom` so the requesting container's decorator chain applies on every
non-global path. Class registrations in `resolveMultiple` go through `resolveRegistration` and
need no separate change.

### Unchanged

- `resolveInternal` walk-up, circular-dependency check, `{ optional: true }` handling.
- `resolveImplementation`: still transient, still `this` as `resolveFrom`.
- Composites: still transient, still not cacheable. `registerComposite` returning `void` is a
  known asymmetry, out of scope here.
- `registerInstance` and `registerFactory`: never touch the singleton cache.

## Impact on existing tests

These assert cross-container reference identity for singletons and will fail after the change.
Each is rewritten to assert same-container identity plus cross-container **non**-identity, or
moved to `inGlobalScope()` where shared identity is what the test is about.

`__tests__/singletons.test.ts`:

- `should share singleton instance across all child containers`
- `should create singleton only once even with multiple resolves`
- `should share singleton through nested child containers`
- `should share child-level singleton with its own nested children`
- `should inject same singleton instance into multiple consumers`
- `should handle singleton with decorators applied at parent level`

`__tests__/registry/registry.test.ts`:

- `child container resolves the same singleton registry as the parent`

`__tests__/container.test.ts`:

- `should resolve instance from parent container if not found in child container` (registers a
  singleton in the root and asserts `toBe` identity from the child)

`__tests__/childContainer/childContainer.test.ts` uses transient registrations and is unaffected.
`__tests__/singletonCacheKeyCollision/*` resolve from a single container and are unaffected.

## New tests

The first three files below are committed (`test: pin per-container singleton and decorator chain
semantics`) and fail until the fix lands. The global scope file is deferred until
`inGlobalScope()` exists, since the suite runs with typecheck.

### Singleton bleed (`__tests__/singletonBleed.test.ts`)

1. Child inherits parent registrations plus its own.
2. Sibling children get isolated instances with their own registrations.
3. Grandchild sees parent + child + own; parent and child untouched.
4. Same-container identity: resolving twice returns the same object.
5. Both siblings resolve before parent; parent is unpolluted.
6. Parent resolves before child; child still gets its own instance and the parent cache is intact.
7. Singleton dependency chain: child's `B.a === child.resolve(A)` and `!== parent.resolve(A)`,
   including when the parent cached `A` first.
8. Simple singleton without overridable deps still yields per-container instances.

### Singleton cross-resolution (`__tests__/childContainer/singletonCrossResolution.test.ts`)

Singleton variants of every `childContainer.test.ts` scenario: override none, some, all;
grandchild and great-grandchild chains; parent unaffected after child resolution.

### Decorator chain (`__tests__/singletonDecoratorChain.test.ts`)

1. Child decorator applied on top of parent decorator for a parent-owned singleton; parent gets only
   its own.
2. Grandchild gets three layers, root-first; each ancestor decorator applied **exactly once** (F1).
3. Intermediate decorator's constructor dependency is resolved from the requesting container, so a
   grandchild override reaches a child-registered decorator.
4. Child decorator also applies to a parent-owned **transient**, instance registration and factory
   resolved from the child (F2).

### Global scope (`__tests__/globalScope.test.ts`, deferred)

1. Parent resolves first; both children get the same object.
2. Child resolves first; parent and sibling get the same object as the child (F3: order does not
   matter).
3. Child decorator ignored.
4. Child `{ multiple: true }` registrations ignored; assert exact product names, not just length.
5. Child override of a dependency ignored; the global uses the owner's registration.
6. Same-container identity.
7. Deep hierarchy: great-grandchild resolves the root's instance.
8. Global registered in a child is shared by that child's descendants and invisible to the parent.

## Open items from cold review (2026-09-11)

Two independent reviews of this revision confirmed the "After" code produces the behavior claimed
in every traced case. These are gaps in what the spec states, left for the owner to decide or
confirm before implementation.

1. **Global depending on Singleton.** The singleton dependency is resolved as if the owner
   requested it and is cached in the owner. So `parent.resolve(G).s === parent.resolve(S)` but
   `child.resolve(G).s !== child.resolve(S)`. State it, and add a test.
2. **Global shadowing.** Parent and child both registering the same abstraction as global yields
   two instances; nearest registration wins for that container and its descendants; `resolveAll`
   returns both. State it.
3. **Lifecycle cost.** Per-request child containers rebuild every parent singleton per request
   unless migrated to global. Belongs under "Breaking change". Upside: today's code retains
   child-built instances in the parent forever; the fix removes that retention.
4. **Composites.** Never decorated, never cached. Add a table row so the F2 rule is not read as
   covering them.
5. **Cache slots are write-once.** Later registrations or decorators never invalidate a cached
   instance. `registry.test.ts` pins this for registrations; nothing pins it for decorators.
6. **`resolveWithDependencies`** uses `this` throughout, never caches, never decorates. Add to
   "Unchanged".
7. **Test hygiene** in the committed files: one decorator-chain test passes today by accident and
   needs an assertion on the child's result; duplicated `ServiceA`/`ServiceB` fixtures should be
   hoisted; unread `id` fields should go; "child overrides all deps" leaves `TemplateEngine`
   unoverridden.
8. **Scope naming.** `docs/2026-09-14-scoping-prior-art.md` surveys how tsyringe, InversifyJS,
   NestJS, Microsoft DI, Autofac, Spring, Guice, Symfony, Laravel and shaku scope shared instances.
   Every one of them keeps `Singleton` (or its equivalent) meaning the shared, owner-cached
   instance and gives the per-container behavior a separate name — `ContainerScoped`,
   `InstancePerLifetimeScope`, `Scoped`. This design instead redefines `Singleton` and adds
   `Global`, which is what makes the release a major. The additive alternative is spelled out under
   "Open decision: scope naming" in that document: keep `Singleton` shared (owner-view deps and
   decorators, which removes the bleed on its own) and add `inContainerScope()` for the
   per-container instance. Same `resolveRegistration` rewrite either way; only the meaning of the
   existing keyword differs.
9. **Captive dependencies are unguarded.** Microsoft DI rejects a singleton consuming a scoped
   service at build time; Autofac throws; Spring injects a scoped proxy. Open item 1 above is the
   same trap and currently ships as documented behavior with no check.

## Breaking change

The singleton contract changes from "one shared instance across the hierarchy" to "one instance
per container that resolves it". Release as a **major** with a changeset.

Migration:

- `child.resolve(X) === parent.resolve(X)` for singletons no longer holds.
- Code that wants the old sharing switches the registration to `.inGlobalScope()`. Identity
  semantics are then identical to today's singleton, without the bleed.
- Decorators registered in a child now apply to parent-owned services resolved from that child,
  regardless of scope (F2).

## Documentation updates

`AGENTS.md`, Lifetime Scopes:

- **Transient** (default): new instance on every `resolve()` call.
- **Singleton**: one instance per container that resolves it, cached after first resolution with
  decorators applied. Each container gets an instance reflecting its own dependency graph.
  Inheritance flows downward, never upward.
- **Global**: one instance per registration, cached in the owning container and shared by every
  descendant. Dependencies and decorators are resolved from the owning container only; child
  registrations and decorators have no effect.

`AGENTS.md`, Child Container Semantics: add that decorators are collected from the requesting
container's chain, root-first, for all non-global resolutions.

Remove the "Singleton bleed-through bug" entry from Known Issues once the fix lands.

## Alternatives considered

- **Smart caching (reuse parent instance when the child adds nothing relevant).** Requires
  tracking each singleton's transitive dependency set and diffing registrations per container.
  Easy to get subtly wrong. Rejected.
- **Fix only `{ multiple: true }` resolution by using `this` for it.** Stops the bleed but the child
  no longer sees its own registrations in the aggregate. Rejected.
- **Walk-up cache for global scope.** See F3. Rejected in favor of owner-cached.
- **Separate `registerGlobal()` method.** Duplicates registration logic; every new scope would need
  a new method. Rejected in favor of the builder.
- **Scope strategy objects.** Over-engineered for three scopes. Rejected.

See `docs/2026-09-14-scoping-prior-art.md` for how other containers answer the same question.

## Related: ContainerToken self-registration

A parent that registers itself via `registerInstance(ContainerToken, container)` is inherited by
children, which then resolve the **parent** container instead of themselves. This is an inheritance
limitation, not a bleed: `registerInstance` in a child writes only to the child's map.
`__tests__/containerToken.test.ts` pins both facts. The tests that assert the limitation
(`expect(resolved).toBe(parent)`) will need flipping if `createChildContainer` ever self-registers
the child. Unaffected by this change.

## Branch hygiene

Not part of the design, but found on the branch and worth resolving before the PR is opened.

- **Engines vs CI.** `chore: update dependencies` sets `engines.node` to `>=24.0.0`; both workflows
  in `.github/workflows` still run Node 22.x. Align one with the other.
- **Unrelated bumps.** vitest 5, vite 8, rslib 1.0 and the workspace hardening ride on this
  feature branch. Fine if intended; otherwise split them out.
- **Stale cache-key-collision material.** `bugs/` and `docs/SINGLETON_CACHE_KEY_COLLISION_TESTS.md`
  describe a bug fixed in #12. Two of its ten planned test files exist. Two of the unwritten ones
  (`withChildContainer`, `withDeepHierarchy`) assert cross-container singleton identity and must
  use `inGlobalScope()` if they are ever written.
- **Hardening doc status.** Prettier scripts are already gone. `import "reflect-metadata"` in
  `src/types.ts` and the unwired `__tests__/setupEnv.ts` are still open.
- **Changeset.** None present. Add one (major) before opening the PR.
