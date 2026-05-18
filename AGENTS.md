# @webiny/di - Agent Guide

## What This Is

A TypeScript dependency injection container for the Webiny ecosystem. Published as `@webiny/di` on npm. ESM-only, Node >= 22.

## Architecture

The DI system has five core concepts:

1. **Abstraction** (`src/Abstraction.ts`) - A typed token (`symbol`-based) that represents an interface. Created with `new Abstraction<T>("Name")`. Each instance gets a unique symbol, so two abstractions with the same name are still distinct.

2. **Implementation** - A class bound to an abstraction via `createImplementation()` or `Abstraction.createImplementation()`. Metadata (abstraction token, dependencies) is stored on the class using `reflect-metadata`.

3. **Decorator** - Wraps an existing implementation. Created with `createDecorator()`. The decoratee is always the **last** constructor parameter. Additional dependencies come before it.

4. **Composite** - Aggregates multiple implementations of the same abstraction into one. Created with `createComposite()`. Typically takes `[Abstraction, { multiple: true }]` as a dependency.

5. **Container** (`src/Container.ts`) - Manages registrations and resolves instances. Supports child containers (`createChildContainer()`), where child overrides are preferred during resolution but unresolved dependencies fall back to the parent.

## Resolution Order

When resolving a single abstraction from a container:

1. Composite (if registered)
2. Instance registrations (`registerInstance`) - last registered wins
3. Class registrations (`register`) - last registered wins
4. Factory registrations (`registerFactory`) - last registered wins
5. Walk up to parent container and repeat
6. Throw if nothing found (unless `{ optional: true }`)

Decorators are applied after resolution, in registration order.

## Child Container Semantics

Child containers resolve dependencies starting from the **requesting** container (the one `resolve()` was called on), not from where the registration lives. This means a service registered in a parent can have its dependencies overridden by a child. The `resolveFrom` parameter in internal methods tracks this origin.

## Lifetime Scopes

- **Transient** (default) - New instance on every `resolve()` call.
- **Singleton** - One instance per container where registered. Cached after first resolution (including decorators). Shared with all child containers that don't shadow the registration.

## Key Files

| File                     | Role                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| `src/Container.ts`       | All registration and resolution logic                                            |
| `src/Abstraction.ts`     | Token class with factory methods                                                 |
| `src/Metadata.ts`        | `reflect-metadata` wrapper (keys prefixed `wby:`)                                |
| `src/types.ts`           | Core types and advanced mapped types for dependency validation                   |
| `src/create*.ts`         | Factory functions (`createImplementation`, `createDecorator`, `createComposite`) |
| `src/is*.ts`             | Runtime type guards                                                              |
| `src/DependencyGraph.ts` | WIP, not used in production, excluded from coverage                              |

## Type System

The `Dependencies<T>` type in `types.ts` maps constructor parameters to their abstraction declarations. It enforces at compile time that:

- Required params map to `Abstraction<T>` or `[Abstraction<T>]` or `[Abstraction<T>, { multiple: false }]`
- Optional params (`?`) require `[Abstraction<T>, { optional: true }]`
- Array params require `[Abstraction<T>, { multiple: true }]`

Type-level tests live in `__tests__/types.test-d.ts`.

## Toolchain

| Tool             | Purpose                               |
| ---------------- | ------------------------------------- |
| **pnpm**         | Package manager (v10 in CI)           |
| **TypeScript 6** | Type checking (`tsc --noEmit`)        |
| **Vitest**       | Test runner (v4, `--run --typecheck`) |
| **rslib**        | Bundler (ESM, esnext, with DTS)       |
| **oxlint**       | Linter (NOT eslint)                   |
| **oxfmt**        | Formatter (NOT prettier)              |
| **changesets**   | Versioning and publishing             |

## Commands

```sh
pnpm test              # run all tests with typecheck
pnpm lint              # tsc + oxlint + oxfmt check
pnpm build             # rslib build
pnpm test:coverage     # V8 coverage for src/
```

Run a single test file: `pnpm vitest run __tests__/container.test.ts`

## Checks to Run Before Committing

Run all three in order. All must pass — this matches CI.

```sh
pnpm lint    # tsc (type errors) + oxlint (lint) + oxfmt --check (formatting)
pnpm build   # rslib build → dist/index.js + dist/index.d.ts
pnpm test    # vitest --run --typecheck (46 tests + type-level tests)
```

If `oxfmt --check` fails, fix with `pnpm oxfmt --write <file>`. Do not use prettier.

## CI

GitHub Actions on every push: `pnpm install --frozen-lockfile && pnpm lint && pnpm build && pnpm test`.

## Test Structure

- `__tests__/container.test.ts` - Core registration, resolution, decorators, composites, factories, error cases, type shorthand tests.
- `__tests__/singletons.test.ts` - Singleton lifetime across parent/child hierarchy.
- `__tests__/childContainer/` - Cross-container resolution bug tests with multi-level dependency override scenarios.
- `__tests__/types.test-d.ts` - Compile-time type assertion tests.
- `__tests__/setupEnv.ts` - Imports `reflect-metadata` globally for tests.

## Conventions

- No comments unless explaining a non-obvious "why".
- No eslint or prettier - use oxlint and oxfmt.
- `.js` extensions in imports (ESM resolution).
- Tests use `describe`/`test` from Vitest, not `it` (except `singletons.test.ts` which uses `it`).
- Abstractions are created as module-level constants (e.g., `const Logger = new Abstraction<ILogger>("Logger")`).
- Implementations are created via factory functions and stored as constants (e.g., `const ConsoleLoggerImpl = createImplementation({...})`).
- Run `pnpm changeset` before opening any PR that should trigger a release.

## Known Issues

- `DependencyGraph.ts` is WIP and uses `@ts-nocheck`. It references a `graphlib` dependency that isn't installed. Excluded from coverage.
- The child container test file (`__tests__/childContainer/childContainer.test.ts`) includes tests for a cross-resolution bug where child overrides must propagate through parent-registered services. This is a critical correctness property of the container.
