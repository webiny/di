# Container Hardening — Cold Review Findings

Findings from a zero-context code review of the `@webiny/di` codebase. Each issue was independently verified against the source.

## Critical Issues

### 1. Singleton cache check fails for falsy values

**File:** `src/Container.ts:229-232`

```typescript
const existing = this.instances.get(registration);
if (existing) {
  // BUG: fails for false, 0, "", null
  return existing;
}
```

`Map.get()` returns `undefined` for missing keys. But `if (existing)` also fails for any falsy value that a singleton legitimately resolves to. A singleton returning `0`, `false`, `""`, or `null` would be re-constructed on every `resolve()` call, defeating the singleton guarantee.

**Fix:** Change to `if (existing !== undefined)`.

Note: this fix also applies to the per-container singleton scoping change (spec `2026-05-26-per-container-singleton-scoping-design.md`) where the cache check moves to `resolveFrom.instances.get(registration)`.

### 2. Composites cannot be singleton-scoped

**File:** `src/Container.ts:86-108`

`registerComposite()` returns `void`, not a `RegistrationBuilder`. There is no way to call `.inSingletonScope()` on a composite. Every composite resolution creates a fresh instance — the composite's `dependencies` are re-resolved and a new object is constructed each time.

This may be intentional (composites aggregate, so they should reflect current registrations), but it's an asymmetry:

- `register()` → returns `RegistrationBuilder` → `.inSingletonScope()` available
- `registerComposite()` → returns `void` → no scope control

**Fix:** Document this as intentional behavior in `AGENTS.md` under Resolution Order, OR return a `RegistrationBuilder` from `registerComposite`.

### 3. `resolveWithDependencies` skips decorators and singleton semantics

**File:** `src/Container.ts:118-131`

```typescript
resolveWithDependencies<T extends Constructor>(config: {
  implementation: T;
  dependencies: Dependencies<T>;
}): InstanceType<T> {
  // ...
  return new Constructor(...resolvedDeps);  // no decorators, no singleton cache
}
```

This public method constructs a class with manually specified dependencies but bypasses `applyDecorators` and singleton caching entirely. A consumer might expect it to behave like `resolve()` with manual dep overrides.

**Fix:** Rename to `construct` or `instantiate` to clarify it's a raw construction helper, or add a doc comment. No behavior change needed — the current behavior is useful as-is, it's just the name that misleads.

## Important Issues

### 4. Circular dependency check bypassed for `{ multiple: true }`

**File:** `src/Container.ts:145`

```typescript
if (resolutionStack.has(abstraction.token) && !options.multiple) {
  throw new Error(`Circular dependency detected for ${abstraction.toString()}`);
}
```

When `options.multiple` is true, the circular dependency check is skipped. If two abstractions each have `{ multiple: true }` dependencies on each other, resolution would stack overflow instead of throwing a clear error.

**Fix:** Add a separate depth counter or visited set for `multiple` resolution to detect infinite recursion.

### 5. `new Map(resolutionStack)` cloned per-dependency — O(D²) allocations

**Files:** `src/Container.ts:191, 241, 326`

Every dependency resolution clones the entire resolution stack into a new Map. For a service with D dependencies, each of which has D dependencies, this creates D² Map allocations. A `Set<symbol>` with push/pop would be O(1) per dependency.

**Fix:** Replace `Map<symbol, boolean>` with a `Set<symbol>` and use add/delete instead of cloning. Pass by reference and restore after recursion.

### 6. Dead `prettier` scripts in `package.json`

**File:** `package.json:25-27`

```json
"prettier": "prettier \"**/**/*.{ts,json}\" --config .prettierrc.json",
"prettier:fix": "pnpm run prettier --write",
"prettier:check": "pnpm run prettier --check"
```

`prettier` is not a devDependency. `AGENTS.md` says "No eslint or prettier — use oxlint and oxfmt." These scripts would fail with "command not found." Dead config that confuses contributors.

**Fix:** Remove the three prettier scripts from `package.json`. Remove `.prettierrc.json` if it exists.

### 7. `reflect-metadata` side-effect import in `types.ts`

**File:** `src/types.ts:1`

```typescript
import "reflect-metadata";
```

Anyone importing just type definitions from the package gets the `reflect-metadata` polyfill injected as a side effect. This polyfill should only be loaded once at the application entry point, not from a types file.

**Fix:** Remove the import from `types.ts`. The `reflect-metadata` import belongs in the consuming application's entry point or test setup. The `__tests__/setupEnv.ts` file already has it for tests — wire that into `vitest.config.ts` as a `setupFiles` entry.

### 8. `setupEnv.ts` not wired into vitest config

**File:** `__tests__/setupEnv.ts`

This file exists and imports `reflect-metadata`, but it's not referenced in `vitest.config.ts` or any config. Tests work today because `types.ts` has the side-effect import (issue #7). If #7 is fixed, tests would break unless `setupEnv.ts` is properly wired.

**Fix:** Add `setupFiles: ['__tests__/setupEnv.ts']` to vitest config.

## Low Priority

### 9. `RegistrationBuilder.inSingletonScope()` returns `void`

**File:** `src/Container.ts:342`

Returns `void` instead of `this`. No issue today (only one method), but permanently closes the door to fluent chaining if more builder methods are added.

**Fix:** Return `this` instead of `void`. Zero risk, no behavior change.

### 10. `any` cast in `createDecorator.ts`

**File:** `src/createDecorator.ts:19`

```typescript
metadata.setDependencies(params.dependencies as unknown as Dependency[]);
```

The decorator's non-decoratee dependency list loses type checking at this cast boundary. This is a known limitation of expressing "all constructor params except the last one" in TypeScript's type system.

**Fix:** No easy fix without significantly more complex generics. Document as known limitation.

## Missing Features (not bugs, design decisions)

These are not bugs and don't need fixes, but worth documenting for future consideration:

- **No `dispose()` lifecycle** — singletons live forever, no teardown for DB connections/timers
- **No async factory support** — `registerFactory` takes `() => T` not `() => Promise<T>`
- **No named/keyed registrations** — multiple registrations only distinguishable by position
- **`resolveAll` ordering undocumented** — parent-first, child-last, but not stated anywhere
