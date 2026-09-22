# Container Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bugs, remove dead config, and harden the DI container based on findings from a cold code review.

**Architecture:** Targeted fixes across Container.ts, types.ts, package.json, and vitest.config.ts. No public API changes. Each fix is independent and can be committed separately.

**Tech Stack:** TypeScript 6, Vitest 4, pnpm, oxlint, oxfmt

**Spec:** `docs/2026-05-26-container-hardening-design.md`

---

## File Map

| File                                 | Action     | Responsibility                                                                                        |
| ------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------- |
| `src/Container.ts:229-230`           | Modify     | Fix falsy singleton cache check                                                                       |
| `src/Container.ts:342`               | Modify     | Return `this` from `inSingletonScope`                                                                 |
| `src/types.ts:1`                     | Modify     | Remove `reflect-metadata` side-effect import                                                          |
| `__tests__/setupEnv.ts`              | Keep as-is | Already has `reflect-metadata` import                                                                 |
| `vitest.config.ts`                   | Modify     | Wire `setupEnv.ts` into `setupFiles`                                                                  |
| `package.json:25-27`                 | Modify     | Remove dead prettier scripts                                                                          |
| `AGENTS.md`                          | Modify     | Document composite non-singleton behavior, `resolveAll` ordering, `resolveWithDependencies` semantics |
| `__tests__/singletonFalsy.test.ts`   | Create     | Test singleton with falsy values                                                                      |
| `__tests__/circularMultiple.test.ts` | Create     | Test circular `{ multiple: true }` detection                                                          |
| `src/Container.ts:145`               | Modify     | Add depth guard for `{ multiple: true }` resolution                                                   |

---

### Task 1: Fix singleton cache check for falsy values

**Files:**

- Modify: `src/Container.ts:229-230`
- Create: `__tests__/singletonFalsy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { Abstraction, Container, createImplementation } from "../src/index.js";

describe("Singleton with falsy values", () => {
  test("singleton returning 0 is cached correctly", () => {
    class ZeroService {
      getValue(): number {
        return 0;
      }
    }

    const ZeroAbstraction = new Abstraction<ZeroService>("ZeroService");
    const ZeroImpl = ZeroAbstraction.createImplementation({
      implementation: ZeroService,
      dependencies: []
    });

    const container = new Container();
    container.register(ZeroImpl).inSingletonScope();

    const first = container.resolve(ZeroAbstraction);
    const second = container.resolve(ZeroAbstraction);

    expect(first).toBe(second);
    expect(first.getValue()).toBe(0);
  });

  test("singleton returning false is cached correctly", () => {
    class FalseService {
      getValue(): boolean {
        return false;
      }
    }

    const FalseAbstraction = new Abstraction<FalseService>("FalseService");
    const FalseImpl = FalseAbstraction.createImplementation({
      implementation: FalseService,
      dependencies: []
    });

    const container = new Container();
    container.register(FalseImpl).inSingletonScope();

    const first = container.resolve(FalseAbstraction);
    const second = container.resolve(FalseAbstraction);

    expect(first).toBe(second);
  });

  test("singleton returning empty string is cached correctly", () => {
    class EmptyStringService {
      getValue(): string {
        return "";
      }
    }

    const EmptyAbstraction = new Abstraction<EmptyStringService>("EmptyStringService");
    const EmptyImpl = EmptyAbstraction.createImplementation({
      implementation: EmptyStringService,
      dependencies: []
    });

    const container = new Container();
    container.register(EmptyImpl).inSingletonScope();

    const first = container.resolve(EmptyAbstraction);
    const second = container.resolve(EmptyAbstraction);

    expect(first).toBe(second);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test`

Expected: All three tests pass because the singleton resolves to a class instance (truthy), not a primitive. The cache bug only manifests if `instances.set` stores a falsy value — which can't happen with `new registration.implementation(...)` since constructors always return objects. However, this test documents the expected behavior and guards against future changes where factory-produced singletons might return primitives.

Actually — this is a latent bug. The `instances` map stores the **decorated** result. If a decorator returns a falsy value (a proxy, a wrapper that evaluates to falsy), the cache check fails. The fix is still correct regardless.

- [ ] **Step 3: Fix the cache check**

In `src/Container.ts`, change line 230 from:

```typescript
      if (existing) {
```

To:

```typescript
      if (existing !== undefined) {
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/Container.ts __tests__/singletonFalsy.test.ts
git commit -m "fix: use strict undefined check for singleton cache to handle falsy values"
```

---

### Task 2: Remove `reflect-metadata` side-effect from types.ts and wire setupEnv.ts

**Files:**

- Modify: `src/types.ts:1`
- Modify: `vitest.config.ts`

These two changes must be done together — removing the import from types.ts without wiring setupEnv.ts would break all tests.

- [ ] **Step 1: Wire setupEnv.ts into vitest config**

In `vitest.config.ts`, change the test config from:

```typescript
  test: {
    globals: true,
    include: ["__tests__/**/*.test.ts"],
```

To:

```typescript
  test: {
    globals: true,
    include: ["__tests__/**/*.test.ts"],
    setupFiles: ["__tests__/setupEnv.ts"],
```

- [ ] **Step 2: Remove reflect-metadata import from types.ts**

In `src/types.ts`, remove line 1:

```typescript
import "reflect-metadata";
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`

Expected: All tests pass — `setupEnv.ts` now provides the `reflect-metadata` polyfill via vitest's `setupFiles`.

- [ ] **Step 4: Run full checks**

Run: `pnpm lint && pnpm build && pnpm test`

Expected: All pass. The build output should no longer bundle the `reflect-metadata` side-effect import in the types module.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts vitest.config.ts
git commit -m "fix: move reflect-metadata import from types.ts to vitest setupFiles"
```

---

### Task 3: Remove dead prettier scripts from package.json

**Files:**

- Modify: `package.json:25-27`

- [ ] **Step 1: Remove the three prettier scripts**

In `package.json`, remove these three lines from the `"scripts"` block:

```json
    "prettier": "prettier \"**/**/*.{ts,json}\" --config .prettierrc.json",
    "prettier:fix": "pnpm run prettier --write",
    "prettier:check": "pnpm run prettier --check",
```

- [ ] **Step 2: Run full checks**

Run: `pnpm lint && pnpm build && pnpm test`

Expected: All pass. No script references prettier externally.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: remove dead prettier scripts — project uses oxfmt"
```

---

### Task 4: Add depth guard for `{ multiple: true }` circular resolution

**Files:**

- Modify: `src/Container.ts:145`
- Create: `__tests__/circularMultiple.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, test, expect } from "vitest";
import { Abstraction, Container, createImplementation } from "../src/index.js";

describe("Circular dependency detection for { multiple: true }", () => {
  test("detects circular { multiple: true } resolution and throws instead of stack overflow", () => {
    interface IPluginA {
      name: string;
    }

    interface IPluginB {
      name: string;
    }

    class PluginA implements IPluginA {
      name = "a";
      constructor(public deps: IPluginB[]) {}
    }

    class PluginB implements IPluginB {
      name = "b";
      constructor(public deps: IPluginA[]) {}
    }

    const PluginAAbstraction = new Abstraction<IPluginA>("PluginA");
    const PluginBAbstraction = new Abstraction<IPluginB>("PluginB");

    const PluginAImpl = PluginAAbstraction.createImplementation({
      implementation: PluginA,
      dependencies: [[PluginBAbstraction, { multiple: true }]]
    });

    const PluginBImpl = PluginBAbstraction.createImplementation({
      implementation: PluginB,
      dependencies: [[PluginAAbstraction, { multiple: true }]]
    });

    const container = new Container();
    container.register(PluginAImpl);
    container.register(PluginBImpl);

    expect(() => {
      container.resolveAll(PluginAAbstraction);
    }).toThrow(/[Cc]ircular|[Mm]ax.*depth|[Rr]ecursion/);
  });
});
```

- [ ] **Step 2: Run to verify it fails (stack overflow)**

Run: `pnpm test`

Expected: The test crashes with a stack overflow or RangeError instead of a clean circular dependency error.

- [ ] **Step 3: Add a max resolution depth guard**

In `src/Container.ts`, add a `MAX_RESOLUTION_DEPTH` constant and a depth parameter to `resolveInternal`. Change the method signature and add the guard at the top:

At the top of the `Container` class (after the private fields), add:

```typescript
  private static readonly MAX_RESOLUTION_DEPTH = 100;
```

Then in `resolveInternal`, change line 145 from:

```typescript
if (resolutionStack.has(abstraction.token) && !options.multiple) {
  throw new Error(`Circular dependency detected for ${abstraction.toString()}`);
}
```

To:

```typescript
if (resolutionStack.has(abstraction.token) && !options.multiple) {
  throw new Error(`Circular dependency detected for ${abstraction.toString()}`);
}

if (resolutionStack.size > Container.MAX_RESOLUTION_DEPTH) {
  throw new Error(
    `Max resolution depth exceeded — possible circular dependency involving ${abstraction.toString()}`
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`

Expected: All tests pass, including the new circular multiple test which now gets a clean error instead of a stack overflow.

- [ ] **Step 5: Commit**

```bash
git add src/Container.ts __tests__/circularMultiple.test.ts
git commit -m "fix: add max depth guard for { multiple: true } circular resolution"
```

---

### Task 5: Return `this` from `RegistrationBuilder.inSingletonScope()`

**Files:**

- Modify: `src/Container.ts:339-345`

- [ ] **Step 1: Change the return type**

In `src/Container.ts`, change the `RegistrationBuilder` class from:

```typescript
class RegistrationBuilder<T> {
  constructor(private registration: Registration<T>) {}

  inSingletonScope(): void {
    this.registration.scope = LifetimeScope.Singleton;
  }
}
```

To:

```typescript
class RegistrationBuilder<T> {
  constructor(private registration: Registration<T>) {}

  inSingletonScope(): this {
    this.registration.scope = LifetimeScope.Singleton;
    return this;
  }
}
```

- [ ] **Step 2: Run full checks**

Run: `pnpm lint && pnpm build && pnpm test`

Expected: All pass. Existing code that calls `.inSingletonScope()` without chaining is unaffected.

- [ ] **Step 3: Commit**

```bash
git add src/Container.ts
git commit -m "refactor: return this from RegistrationBuilder.inSingletonScope for fluent chaining"
```

---

### Task 6: Update AGENTS.md documentation

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: Document composite non-singleton behavior**

In `AGENTS.md`, after the Resolution Order section (after line 33), add a note under composites:

After the line "Decorators are applied after resolution, in registration order." add:

```
Composites are always transient — `registerComposite()` does not return a `RegistrationBuilder`, so `.inSingletonScope()` is not available. Each resolution creates a fresh composite instance reflecting current registrations.
```

- [ ] **Step 2: Document `resolveAll` ordering**

In the Resolution Order section, after "Walk up to parent container and repeat", add:

```
When resolving multiple (`resolveAll` / `{ multiple: true }`): results are collected parent-first, then child. Within each container, order is: instance registrations, then class registrations, then factories — all in registration order.
```

- [ ] **Step 3: Document `resolveWithDependencies` semantics**

In the Architecture section (after the Container bullet point on line 19), add:

```
`resolveWithDependencies` is a raw construction helper — it resolves the specified dependencies and calls the constructor, but does not apply decorators or singleton caching. Use it for one-off instantiation outside the normal resolution pipeline.
```

- [ ] **Step 4: Run full checks**

Run: `pnpm lint && pnpm build && pnpm test`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document composite transience, resolveAll ordering, resolveWithDependencies semantics"
```
