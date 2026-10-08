---
"@webiny/di": minor
---

Add `inContainerScope()`: one instance per container that resolves it, built from that container's view and cached in it. Register it once in a parent and every child container gets its own instance.

Singletons are now built from the view of the container that holds the registration. Before, a singleton registered in a parent took its dependencies and decorators from whichever child resolved it first, and every other container got that child's version. If your code relied on a parent-registered singleton picking up dependencies registered only in a child container, register those dependencies where the singleton is registered, or switch the singleton to `inContainerScope()`.

Decorators are now collected from the container that resolves an abstraction, for transient, container-scoped, instance and factory registrations. Decorators registered in a child container now apply to those registrations even when they live in a parent.
