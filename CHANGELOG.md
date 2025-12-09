# @webiny/di

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
