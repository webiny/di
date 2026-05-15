# Developer Guide

## Prerequisites

- Node.js >= 22.0.0
- pnpm (package manager)

## Getting Started

```bash
pnpm install
```

## Scripts

| Command              | Description                                       |
| -------------------- | ------------------------------------------------- |
| `pnpm test`          | Run all tests with type checking                  |
| `pnpm test:coverage` | Run tests with V8 code coverage for `src/`        |
| `pnpm build`         | Build the library with rslib                      |
| `pnpm lint`          | Run TypeScript compiler, oxlint, and oxfmt checks |
| `pnpm lint:fix`      | Auto-fix oxlint issues                            |
| `pnpm format`        | Check formatting with oxfmt                       |
| `pnpm format:fix`    | Auto-fix formatting with oxfmt                    |
| `pnpm release`       | Build and publish via changesets                  |

## Running a Single Test File

```bash
pnpm vitest run __tests__/container.test.ts
pnpm vitest run __tests__/childContainer/childContainer.test.ts
```

## Running Tests in Watch Mode

```bash
pnpm vitest __tests__/container.test.ts
```

## Project Structure

```
src/
  Abstraction.ts         Abstraction<T> class — unified token + type
  Container.ts           DI container with registration, resolution, child containers
  Metadata.ts            reflect-metadata wrapper for storing abstraction/dependency info
  createImplementation.ts  Factory for binding implementations to abstractions
  createDecorator.ts     Factory for creating decorator registrations
  createComposite.ts     Factory for creating composite registrations
  isDecorator.ts         Runtime check for decorator metadata
  isComposite.ts         Runtime check for composite metadata
  DependencyGraph.ts     Dependency graph utilities
  types.ts               Core type definitions
  index.ts               Public API exports

__tests__/
  setupEnv.ts            Global test setup (reflect-metadata import)
  container.test.ts      Main container tests
  singletons.test.ts     Singleton lifetime tests
  types.test-d.ts        Compile-time type tests
  childContainer/        Child container cross-resolution bug tests
```

## Linting and Formatting

This project uses [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting and
[oxfmt](https://oxc.rs/docs/guide/usage/formatter) for formatting (not ESLint/Prettier).

```bash
# Check everything
pnpm lint

# Fix lint issues
pnpm lint:fix

# Fix formatting
pnpm format:fix
```

## Publishing

Releases are managed with [changesets](https://github.com/changesets/changesets).

Before opening a PR, you **must** run `pnpm changeset` to record what changed and what kind of
version bump it requires. This is an interactive prompt that asks you to:

1. Select the package(s) affected
2. Choose a bump type — `patch` (bug fix), `minor` (new feature), or `major` (breaking change)
3. Write a short summary of the change

This creates a markdown file in the `.changeset/` directory that gets committed with your PR.
Without it, the release pipeline has no way to know a new version should be published.

```bash
# Record your change (run this before opening a PR)
pnpm changeset

# Publish (builds first) — typically done by CI, not manually
pnpm release
```
