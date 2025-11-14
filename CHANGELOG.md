# @webiny/di

## 0.2.0

### Minor Changes

- 4f095d1: Added new methods on Abstraction class: createImplementation, createDecorator, and createComposite.
  Make token unique: use Symbol(name) to make each abstraction unique, even if using the same name.

## 0.1.1

### Patch Changes

- 7db2f63: exclude unnecessary files from the published package

## 0.1.0

Initial release of Webiny DI container, with support for abstractions, decorators, composites, and hierarchical containers.
