---
"@webiny/di": minor
---

Add `Container.resolveImplementation(implementation)`.

Resolves one implementation without registering it, for the case where the abstraction cannot
identify which one you mean — several implementations registered under a single abstraction, where
`resolve()` cannot say which and `resolveAll()` would construct all of them.

The implementation's dependencies come from its own metadata, so the caller passes only the class.
Resolution is otherwise identical to `resolve()`: dependencies are resolved from the container, and
decorators registered for the abstraction are applied. That last part is what `resolveWithDependencies`
does not do, which made an implementation resolved through it silently undecoratable.

Note that it does not consult registrations, so a registered singleton is not shared:

```ts
container.register(Impl).inSingletonScope();

container.resolve(Thing);              // the singleton, same instance every time
container.resolveImplementation(Impl); // a FRESH instance, not the singleton
```

Prefer `resolve()` whenever the abstraction can identify what you want.
