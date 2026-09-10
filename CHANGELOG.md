# @webiny/di

## 1.1.0

### Minor Changes

- 6bb91b2: Add `Container.resolveImplementation(implementation)`.

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

  container.resolve(Thing); // the singleton, same instance every time
  container.resolveImplementation(Impl); // a FRESH instance, not the singleton
  ```

  Prefer `resolve()` whenever the abstraction can identify what you want.

## 1.0.2

### Patch Changes

- 72e2081: ensure decorators are resolved from all ancestor containers

## 1.0.1

### Patch Changes

- b1cfedb: fix: multiple singleton implementations of the same abstraction now resolve correctly in minified/production builds

## 1.0.0

### Major Changes

- ffef059: fix: resolve child container dependencies from the originating container

## 0.2.3

### Patch Changes

- 95db24e: resolve instances from all parent containers

## 0.2.2

### Patch Changes

- b1a4ef1: ensure generic type is preserved in Abstraction.d.ts when built

## 0.2.1

### Patch Changes

- 5e9d851: enforce typechecking of the dependencies array

## 0.2.0

### Minor Changes

- 987ed28: add new methods on Abstraction class: createImplementation, createDecorator, and createComposite.
- 9bd1b04: use Symbol(name) to make each abstraction unique, even if using the same name.

## 0.1.1

### Patch Changes

- 7db2f63: exclude unnecessary files from the published package

## 0.1.0

Initial release of Webiny DI container, with support for abstractions, decorators, composites, and hierarchical containers.
