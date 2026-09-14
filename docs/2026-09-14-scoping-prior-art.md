# Prior art: how other DI containers scope shared instances

2026-09-14. Companion to `2026-05-26-per-container-singleton-scoping-design.md`. Written while
deciding the open items in revision 2 of that spec.

The question every container in this survey has to answer is the same one the spec answers:

> When an instance is cached and shared across more than one scope, **whose view of the
> registrations builds it**, and **where is it cached**?

`@webiny/di` currently answers "the requester's view, cached in the owner". That combination is
what produces the bleed. No container below uses it.

## JavaScript / TypeScript

### tsyringe

The closest precedent for the design in the spec. It ships both behaviors as separate lifetimes:

- `Lifecycle.Singleton` — the instance is stored in the container that registered it and shared
  with every child.
- `Lifecycle.ContainerScoped` — one instance **per container in the hierarchy**. A child resolving
  a parent's registration constructs its own instance from its own view.

That maps one-to-one onto the spec's `Global` and its redefined `Singleton`. The difference is
naming: tsyringe leaves `Singleton` meaning the shared, owner-cached instance and gives the new
per-container behavior a new name.

### InversifyJS

Has the same bug, in the same shape. The singleton cache lives on the `Binding` object itself
(`binding.cache`), so parent and child share one cache slot, while dependencies resolve from the
container where `resolve()` was called. Whoever resolves first decides what everyone else gets.

Its escape hatch is `inRequestScope()`: one instance per `resolve()` call tree, with no cache that
outlives the call. Check this against Inversify v7 before quoting it — that version was rewritten.

### NestJS

Avoids the problem rather than scoping around it. Providers are application-wide singletons by
default. `Scope.REQUEST` **bubbles**: any provider that consumes a request-scoped provider becomes
request-scoped itself, transitively up the injection chain. Taint propagation instead of
per-container instance tables.

## C#

### Microsoft.Extensions.DependencyInjection

Three lifetimes: `Singleton`, `Scoped`, `Transient`. A singleton lives in the root provider and its
dependencies resolve from the root. `Scoped` is one instance per `IServiceScope`.

The bleed cannot occur because **scopes cannot add registrations** — the service collection is
frozen at `BuildServiceProvider()`. A scope is an instance table, not a registration table.

It also validates the related trap at build time (`ValidateScopes` / `ValidateOnBuild`):

```
Cannot consume scoped service 'IFoo' from singleton 'IBar'.
```

### Autofac

Does allow per-scope registrations — `BeginLifetimeScope(b => b.RegisterType<Car>().As<IProduct>())`
— so it faces exactly our situation. Its rule: an instance is stored in the scope that **shares**
it, and its dependencies are resolved **in that same scope**, never in the requesting one.
`SingleInstance` is root-owned and root-built; `InstancePerLifetimeScope` is one per scope, built
from that scope.

This is the same rule as the spec's F3 decision, applied to both scopes rather than only to the
global one.

## Java

### Spring

A singleton is one instance per `ApplicationContext`. Parent/child context hierarchies exist, but a
parent bean's dependencies resolve **only from the parent context** — the parent never sees child
registrations. Owner-view, with no exception.

For the case where a long-lived bean needs a shorter-lived one, Spring injects a **scoped proxy**
(`@Scope(proxyMode = ScopedProxyMode.TARGET_CLASS)`) that looks the real target up per call. Lazy
lookup instead of caching.

### Guice

`createChildInjector` exists; parent bindings stay in the parent and their singletons are cached
there. Guice's own documentation discourages child injectors for this confusion.

## PHP

### Symfony

A compiled container. Services are `shared: true` by default (a singleton); `shared: false` is
transient. There are no child containers. Symfony **removed scopes in 2.8** for being too
confusing; the replacement is `RequestStack`, a single shared service holding mutable per-request
state.

### Laravel

`bind()` (transient), `singleton()` (application-wide) and `scoped()` (one per request or queue job,
flushed between them). No container hierarchy. "A different dependency in a different context" is
solved by contextual binding — `when(Report::class)->needs(Filesystem::class)->give(...)` — rather
than by a child container that overrides a registration.

## Rust

### shaku

`Component` is a singleton held in an `Arc`; `Provider` constructs per call. Modules compose through
statically declared submodules wired at build time, and a submodule's component resolves its
dependencies inside its own module. Owner-view is enforced by the type system; there is no runtime
parent walk that could bleed.

## What this means for our design

1. **Requester-view dependencies for a shared instance is unique to us.** Every container above
   builds anything cached across scopes from the owner's view. The spec's F3 decision is the
   standard one.
2. **There are two established escapes from the bleed**, and we are choosing the second:
   - Freeze registrations so a child scope cannot add any (Microsoft DI, Symfony, shaku).
   - Cache per scope, with shared instances built from the owner's view (Autofac, tsyringe).
3. **Naming is worth reconsidering.** The spec redefines `Singleton` as per-container and adds
   `Global` for the old shared behavior, which is a major breaking change for every existing user.
   tsyringe (`Singleton` / `ContainerScoped`), Autofac (`SingleInstance` /
   `InstancePerLifetimeScope`) and Microsoft DI (`Singleton` / `Scoped`) all keep `Singleton`
   meaning the shared, owner-cached instance and give the per-container behavior its own name.
   Taking the same route here would give both behaviors without breaking the existing contract:
   `inSingletonScope()` keeps today's identity semantics minus the bleed (the F3 fix alone), and a
   new `inContainerScope()` provides the per-container instance. See "Open decision: scope naming"
   below.
4. **Nobody leaves the captive-dependency case unguarded.** Microsoft DI rejects it at build time,
   Spring proxies around it, Autofac throws when a shared component asks for a narrower scope. Our
   open item 1 (a global depending on a singleton) is the same trap and currently has no guard,
   only a documented consequence.

## Open decision: scope naming

Two ways to ship the same two behaviors.

**A. As specified.** `Singleton` becomes per-container; `Global` is the shared instance.

- Every user who relies on `child.resolve(X) === parent.resolve(X)` must migrate to
  `.inGlobalScope()`.
- The safer behavior (isolation) becomes the default one for the familiar keyword.
- Diverges from what `Singleton` means in tsyringe, Autofac, Microsoft DI, Spring and Guice.

**B. Additive.** `Singleton` keeps meaning the shared, owner-cached instance — fixed so that
dependencies and decorators come from the owner, which removes the bleed without changing identity
— and a new `inContainerScope()` adds the per-container instance.

- No migration for existing users; the bleed fix is a patch or minor rather than a major.
- Matches the naming every other container uses.
- The risk the bleed represents is only fixed for people who read the release notes and decide
  which scope they want; the default stays shared.

Both require the same `resolveRegistration` rewrite. The difference is which scope the existing
keyword points at.
