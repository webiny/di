---
"@webiny/di": major
---

**Breaking:** singletons are now built from the view of the container that holds the registration. Before, a singleton registered in a parent took its dependencies and decorators from whichever child resolved it first, and every other container got that child's version. A parent-registered singleton that depends on something registered only in a child container no longer sees it: an optional dependency resolves to `undefined`, and a required one throws "No registration found". To migrate, register the dependency where the singleton is registered, or switch the singleton to `inContainerScope()`.

**Breaking:** decorators are now collected from the container that resolves an abstraction, for transient, container-scoped, instance and factory registrations. Decorators registered in a child container now apply to those registrations even when they live in a parent. Singletons keep the registering container's decorators, and resolving a singleton from a child container that registered its own decorator for it now throws an error instead of silently skipping that decorator.

Add `inContainerScope()`: one instance per container that resolves it, built from that container's view and cached in it. Register it once in a parent and every child container gets its own instance.
