# Per-Container Singleton Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix singleton bleed-through so each container gets its own singleton instance reflecting its own dependency graph, with decorator chains applied in parent-to-child order.

**Architecture:** Two changes in `resolveRegistration`: (1) cache lookup/write uses `resolveFrom.instances` instead of `this.instances`, (2) after applying owning container's decorators, walk `resolveFrom` up to `this` and apply each intermediate container's decorators. This gives each container a per-container singleton scoped to its own registrations.

**Tech Stack:** TypeScript 6, Vitest 4, pnpm, oxlint, oxfmt

**Spec:** `docs/2026-05-26-per-container-singleton-scoping-design.md`

---

## File Map

| File                                                        | Action               | Responsibility                                       |
| ----------------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| `src/Container.ts`                                          | Modify lines 222-261 | Singleton cache + decorator chain changes            |
| `__tests__/singletons.test.ts`                              | Modify               | Update cross-container identity assertions           |
| `__tests__/registry/registry.test.ts`                       | Modify               | Update cross-container identity assertion            |
| `__tests__/singletonBleed.test.ts`                          | Create               | New: bleed-through, inheritance, siblings, hierarchy |
| `__tests__/childContainer/singletonCrossResolution.test.ts` | Create               | New: singleton variants of childContainer tests      |
| `__tests__/singletonDecoratorChain.test.ts`                 | Create               | New: decorator chain across container hierarchy      |
| `AGENTS.md`                                                 | Modify line 43       | Update Lifetime Scopes docs                          |

---

### Task 1: Write failing bleed-through test

**Files:**

- Create: `__tests__/singletonBleed.test.ts`

This is the core test that proves the bug exists today and will pass after the fix.

- [ ] **Step 1: Create the test file with the ProductRegistry bleed-through scenario**

```typescript
import { describe, test, expect } from "vitest";
import { Abstraction, Container, createImplementation } from "../src/index.js";

interface IProduct {
  name: string;
}

interface IProductRegistry {
  getAll(): IProduct[];
}

class CoffeeProduct implements IProduct {
  name = "coffee";
}

class ComputerProduct implements IProduct {
  name = "computer";
}

class CarProduct implements IProduct {
  name = "car";
}

class MobilePhoneProduct implements IProduct {
  name = "mobilePhone";
}

class LaptopProduct implements IProduct {
  name = "laptop";
}

class BallProduct implements IProduct {
  name = "ball";
}

class ProductRegistry implements IProductRegistry {
  constructor(private products: IProduct[]) {}

  getAll(): IProduct[] {
    return this.products;
  }
}

const Product = new Abstraction<IProduct>("Product");
const ProductRegistryAbstraction = new Abstraction<IProductRegistry>("ProductRegistry");

const CoffeeProductImpl = createImplementation({
  abstraction: Product,
  implementation: CoffeeProduct,
  dependencies: []
});

const ComputerProductImpl = createImplementation({
  abstraction: Product,
  implementation: ComputerProduct,
  dependencies: []
});

const CarProductImpl = createImplementation({
  abstraction: Product,
  implementation: CarProduct,
  dependencies: []
});

const MobilePhoneProductImpl = createImplementation({
  abstraction: Product,
  implementation: MobilePhoneProduct,
  dependencies: []
});

const LaptopProductImpl = createImplementation({
  abstraction: Product,
  implementation: LaptopProduct,
  dependencies: []
});

const BallProductImpl = createImplementation({
  abstraction: Product,
  implementation: BallProduct,
  dependencies: []
});

const ProductRegistryImpl = createImplementation({
  abstraction: ProductRegistryAbstraction,
  implementation: ProductRegistry,
  dependencies: [[Product, { multiple: true }]]
});

describe("Singleton bleed-through prevention", () => {
  test("child registrations do not bleed into parent singleton", () => {
    const parent = new Container();
    parent.register(CoffeeProductImpl);
    parent.register(ComputerProductImpl);
    parent.register(ProductRegistryImpl).inSingletonScope();

    const child = parent.createChildContainer();
    child.register(CarProductImpl);

    const childRegistry = child.resolve(ProductRegistryAbstraction);
    expect(childRegistry.getAll()).toHaveLength(3);
    expect(childRegistry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer", "car"])
    );

    const parentRegistry = parent.resolve(ProductRegistryAbstraction);
    expect(parentRegistry.getAll()).toHaveLength(2);
    expect(parentRegistry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer"])
    );

    expect(parentRegistry).not.toBe(childRegistry);
  });

  test("child inherits parent registrations plus its own", () => {
    const parent = new Container();
    parent.register(CoffeeProductImpl);
    parent.register(ComputerProductImpl);
    parent.register(ProductRegistryImpl).inSingletonScope();

    const child = parent.createChildContainer();
    child.register(CarProductImpl);
    child.register(MobilePhoneProductImpl);

    const childRegistry = child.resolve(ProductRegistryAbstraction);
    const names = childRegistry.getAll().map(p => p.name);
    expect(names).toHaveLength(4);
    expect(names).toEqual(expect.arrayContaining(["coffee", "computer", "car", "mobilePhone"]));
  });

  test("sibling children each get their own isolated singleton", () => {
    const parent = new Container();
    parent.register(CoffeeProductImpl);
    parent.register(ComputerProductImpl);
    parent.register(ProductRegistryImpl).inSingletonScope();

    const child1 = parent.createChildContainer();
    child1.register(CarProductImpl);

    const child2 = parent.createChildContainer();
    child2.register(LaptopProductImpl);

    const child1Registry = child1.resolve(ProductRegistryAbstraction);
    const child2Registry = child2.resolve(ProductRegistryAbstraction);
    const parentRegistry = parent.resolve(ProductRegistryAbstraction);

    expect(child1Registry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer", "car"])
    );
    expect(child2Registry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer", "laptop"])
    );
    expect(parentRegistry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer"])
    );

    expect(child1Registry).not.toBe(child2Registry);
    expect(child1Registry).not.toBe(parentRegistry);
  });

  test("deep hierarchy: grandchild sees parent + child + own registrations", () => {
    const parent = new Container();
    parent.register(CoffeeProductImpl);
    parent.register(ComputerProductImpl);
    parent.register(ProductRegistryImpl).inSingletonScope();

    const child = parent.createChildContainer();
    child.register(CarProductImpl);
    child.register(MobilePhoneProductImpl);

    const grandchild = child.createChildContainer();
    grandchild.register(LaptopProductImpl);
    grandchild.register(BallProductImpl);

    const parentRegistry = parent.resolve(ProductRegistryAbstraction);
    const childRegistry = child.resolve(ProductRegistryAbstraction);
    const grandchildRegistry = grandchild.resolve(ProductRegistryAbstraction);

    expect(parentRegistry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer"])
    );
    expect(parentRegistry.getAll()).toHaveLength(2);

    expect(childRegistry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer", "car", "mobilePhone"])
    );
    expect(childRegistry.getAll()).toHaveLength(4);

    expect(grandchildRegistry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer", "car", "mobilePhone", "laptop", "ball"])
    );
    expect(grandchildRegistry.getAll()).toHaveLength(6);
  });

  test("same-container identity: resolving twice returns the same instance", () => {
    const parent = new Container();
    parent.register(CoffeeProductImpl);
    parent.register(ProductRegistryImpl).inSingletonScope();

    const child = parent.createChildContainer();
    child.register(CarProductImpl);

    const childRegistry1 = child.resolve(ProductRegistryAbstraction);
    const childRegistry2 = child.resolve(ProductRegistryAbstraction);
    expect(childRegistry1).toBe(childRegistry2);

    const parentRegistry1 = parent.resolve(ProductRegistryAbstraction);
    const parentRegistry2 = parent.resolve(ProductRegistryAbstraction);
    expect(parentRegistry1).toBe(parentRegistry2);
  });

  test("both siblings resolve before parent - parent is unpolluted", () => {
    const parent = new Container();
    parent.register(CoffeeProductImpl);
    parent.register(ComputerProductImpl);
    parent.register(ProductRegistryImpl).inSingletonScope();

    const child1 = parent.createChildContainer();
    child1.register(CarProductImpl);

    const child2 = parent.createChildContainer();
    child2.register(LaptopProductImpl);

    child1.resolve(ProductRegistryAbstraction);
    child2.resolve(ProductRegistryAbstraction);

    const parentRegistry = parent.resolve(ProductRegistryAbstraction);
    expect(parentRegistry.getAll()).toHaveLength(2);
    expect(parentRegistry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer"])
    );
  });

  test("parent resolves before child - child still gets its own instance", () => {
    const parent = new Container();
    parent.register(CoffeeProductImpl);
    parent.register(ComputerProductImpl);
    parent.register(ProductRegistryImpl).inSingletonScope();

    const parentRegistry = parent.resolve(ProductRegistryAbstraction);
    expect(parentRegistry.getAll()).toHaveLength(2);

    const child = parent.createChildContainer();
    child.register(CarProductImpl);

    const childRegistry = child.resolve(ProductRegistryAbstraction);
    expect(childRegistry.getAll()).toHaveLength(3);
    expect(childRegistry.getAll().map(p => p.name)).toEqual(
      expect.arrayContaining(["coffee", "computer", "car"])
    );

    const parentRegistryAgain = parent.resolve(ProductRegistryAbstraction);
    expect(parentRegistryAgain).toBe(parentRegistry);
    expect(parentRegistryAgain.getAll()).toHaveLength(2);
  });

  test("singleton dependency chain: per-container instances are consistent", () => {
    class ServiceA {
      public readonly id = Math.random();
    }

    class ServiceB {
      constructor(public readonly serviceA: ServiceA) {}
    }

    const ServiceAAbstraction = new Abstraction<ServiceA>("ServiceA");
    const ServiceBAbstraction = new Abstraction<ServiceB>("ServiceB");

    const ServiceAImpl = ServiceAAbstraction.createImplementation({
      implementation: ServiceA,
      dependencies: []
    });

    const ServiceBImpl = ServiceBAbstraction.createImplementation({
      implementation: ServiceB,
      dependencies: [ServiceAAbstraction]
    });

    const parent = new Container();
    parent.register(ServiceAImpl).inSingletonScope();
    parent.register(ServiceBImpl).inSingletonScope();

    const child = parent.createChildContainer();

    const childB = child.resolve(ServiceBAbstraction);
    const childA = child.resolve(ServiceAAbstraction);
    expect(childB.serviceA).toBe(childA);

    const parentB = parent.resolve(ServiceBAbstraction);
    const parentA = parent.resolve(ServiceAAbstraction);
    expect(parentB.serviceA).toBe(parentA);

    expect(childA).not.toBe(parentA);
  });

  test("simple singleton without multiple deps produces per-container instances", () => {
    class SimpleService {
      public readonly id = Math.random();
    }

    const SimpleAbstraction = new Abstraction<SimpleService>("SimpleService");
    const SimpleImpl = SimpleAbstraction.createImplementation({
      implementation: SimpleService,
      dependencies: []
    });

    const parent = new Container();
    parent.register(SimpleImpl).inSingletonScope();

    const child = parent.createChildContainer();

    const parentInstance = parent.resolve(SimpleAbstraction);
    const childInstance = child.resolve(SimpleAbstraction);

    expect(parentInstance).not.toBe(childInstance);

    const parentAgain = parent.resolve(SimpleAbstraction);
    const childAgain = child.resolve(SimpleAbstraction);
    expect(parentAgain).toBe(parentInstance);
    expect(childAgain).toBe(childInstance);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`

Expected: Multiple failures. The core test "child registrations do not bleed into parent singleton" will fail because `parentRegistry.getAll()` returns 3 products (including `car`) instead of 2. The "simple singleton" test will fail because `parentInstance` is currently `toBe(childInstance)`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add __tests__/singletonBleed.test.ts
git commit -m "test: add failing tests for singleton bleed-through bug"
```

---

### Task 2: Implement per-container singleton caching

**Files:**

- Modify: `src/Container.ts:222-261`

- [ ] **Step 1: Change singleton cache lookup and write in resolveRegistration**

In `src/Container.ts`, change `resolveRegistration` from:

```typescript
private resolveRegistration<T>(
  abstraction: Abstraction<T>,
  registration: Registration<T>,
  resolutionStack: Map<symbol, boolean>,
  resolveFrom: Container
): T {
  if (registration.scope === LifetimeScope.Singleton) {
    const existing = this.instances.get(registration);
    if (existing) {
      return existing;
    }
  }

  resolutionStack.set(abstraction.token, true);

  const resolvedDeps = registration.dependencies.map(dep => {
    const [abstractionDep, depOptions] = Array.isArray(dep) ? dep : [dep, {}];
    return resolveFrom.resolveInternal(
      abstractionDep,
      new Map(resolutionStack),
      depOptions,
      resolveFrom
    );
  });

  const instance = new registration.implementation(...resolvedDeps);
  const decoratedInstance = this.applyDecorators(
    abstraction,
    instance,
    resolutionStack,
    resolveFrom
  );

  if (registration.scope === LifetimeScope.Singleton) {
    this.instances.set(registration, decoratedInstance);
  }

  resolutionStack.delete(abstraction.token);
  return decoratedInstance;
}
```

To:

```typescript
private resolveRegistration<T>(
  abstraction: Abstraction<T>,
  registration: Registration<T>,
  resolutionStack: Map<symbol, boolean>,
  resolveFrom: Container
): T {
  if (registration.scope === LifetimeScope.Singleton) {
    const existing = resolveFrom.instances.get(registration);
    if (existing) {
      return existing;
    }
  }

  resolutionStack.set(abstraction.token, true);

  const resolvedDeps = registration.dependencies.map(dep => {
    const [abstractionDep, depOptions] = Array.isArray(dep) ? dep : [dep, {}];
    return resolveFrom.resolveInternal(
      abstractionDep,
      new Map(resolutionStack),
      depOptions,
      resolveFrom
    );
  });

  const instance = new registration.implementation(...resolvedDeps);
  let decoratedInstance = this.applyDecorators(
    abstraction,
    instance,
    resolutionStack,
    resolveFrom
  );

  if (resolveFrom !== this) {
    const chain: Container[] = [];
    let current: Container | undefined = resolveFrom;
    while (current && current !== this) {
      chain.push(current);
      current = current.parent;
    }
    chain.reverse();
    for (const container of chain) {
      decoratedInstance = container.applyDecorators(
        abstraction,
        decoratedInstance,
        resolutionStack,
        resolveFrom
      );
    }
  }

  if (registration.scope === LifetimeScope.Singleton) {
    resolveFrom.instances.set(registration, decoratedInstance);
  }

  resolutionStack.delete(abstraction.token);
  return decoratedInstance;
}
```

The changes are:

1. Line 229: `this.instances.get` → `resolveFrom.instances.get`
2. Line 248: `const` → `let` for `decoratedInstance`
3. Lines 254-265: New decorator chain block
4. Line 256 (was line 255): `this.instances.set` → `resolveFrom.instances.set`

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

Expected: `singletonBleed.test.ts` passes (all 9 tests). `singletons.test.ts` and `registry/registry.test.ts` will fail — that is expected and handled in Task 3.

- [ ] **Step 3: Commit the implementation**

```bash
git add src/Container.ts
git commit -m "fix: cache singletons per-resolving-container to prevent bleed-through"
```

---

### Task 3: Update existing singleton tests for new semantics

**Files:**

- Modify: `__tests__/singletons.test.ts`
- Modify: `__tests__/registry/registry.test.ts`

These tests assert cross-container reference identity (`toBe`) which no longer holds. Update them to assert behavioral equivalence within the same container and per-container isolation across containers.

- [ ] **Step 1: Update singletons.test.ts — "Parent-level singletons" describe block**

Replace the three tests in the "Parent-level singletons" describe block (lines 54-112) with:

```typescript
describe("Parent-level singletons", () => {
  it("should produce per-container singleton instances", () => {
    const rootContainer = new Container();
    rootContainer.register(MyServiceImpl).inSingletonScope();

    const child1 = rootContainer.createChildContainer();
    const child2 = rootContainer.createChildContainer();

    const instanceFromRoot = rootContainer.resolve(MyServiceAbstraction);
    const instanceFromChild1 = child1.resolve(MyServiceAbstraction);
    const instanceFromChild2 = child2.resolve(MyServiceAbstraction);

    expect(instanceFromRoot).not.toBe(instanceFromChild1);
    expect(instanceFromRoot).not.toBe(instanceFromChild2);
    expect(instanceFromChild1).not.toBe(instanceFromChild2);
  });

  it("should return the same instance when resolved multiple times from the same container", () => {
    const rootContainer = new Container();
    rootContainer.register(MyServiceImpl).inSingletonScope();

    const child = rootContainer.createChildContainer();

    const i1 = child.resolve(MyServiceAbstraction);
    const i2 = child.resolve(MyServiceAbstraction);
    const i3 = rootContainer.resolve(MyServiceAbstraction);
    const i4 = rootContainer.resolve(MyServiceAbstraction);

    expect(i1).toBe(i2);
    expect(i3).toBe(i4);
    expect(i1).not.toBe(i3);
  });

  it("should produce per-container instances through nested child containers", () => {
    const rootContainer = new Container();
    rootContainer.register(MyServiceImpl).inSingletonScope();

    const child1 = rootContainer.createChildContainer();
    const child2 = child1.createChildContainer();
    const child3 = child2.createChildContainer();

    const instanceFromRoot = rootContainer.resolve(MyServiceAbstraction);
    const instanceFromChild1 = child1.resolve(MyServiceAbstraction);
    const instanceFromChild2 = child2.resolve(MyServiceAbstraction);
    const instanceFromChild3 = child3.resolve(MyServiceAbstraction);

    expect(instanceFromRoot).not.toBe(instanceFromChild1);
    expect(instanceFromChild1).not.toBe(instanceFromChild2);
    expect(instanceFromChild2).not.toBe(instanceFromChild3);

    expect(rootContainer.resolve(MyServiceAbstraction)).toBe(instanceFromRoot);
    expect(child3.resolve(MyServiceAbstraction)).toBe(instanceFromChild3);
  });
});
```

- [ ] **Step 2: Update singletons.test.ts — "Child-level singletons" share-with-nested test**

Replace the "should share child-level singleton with its own nested children" test (lines 158-171) with:

```typescript
it("should produce per-container instances for child-level singletons in nested children", () => {
  const rootContainer = new Container();
  const child = rootContainer.createChildContainer();
  const grandchild = child.createChildContainer();

  child.register(ChildSpecificServiceImpl).inSingletonScope();

  const instanceFromChild = child.resolve(ChildSpecificServiceAbstraction);
  const instanceFromGrandchild = grandchild.resolve(ChildSpecificServiceAbstraction);

  expect(instanceFromChild).not.toBe(instanceFromGrandchild);

  expect(child.resolve(ChildSpecificServiceAbstraction)).toBe(instanceFromChild);
  expect(grandchild.resolve(ChildSpecificServiceAbstraction)).toBe(instanceFromGrandchild);
});
```

- [ ] **Step 3: Update singletons.test.ts — "Singleton dependencies" inject test**

Replace the "should inject same singleton instance into multiple consumers" test (lines 175-199) with:

```typescript
it("should inject per-container singleton instances into consumers", () => {
  const rootContainer = new Container();

  rootContainer.register(MyServiceImpl).inSingletonScope();
  rootContainer.register(ServiceWithDependencyImpl);

  const child1 = rootContainer.createChildContainer();
  const child2 = rootContainer.createChildContainer();

  const consumer1 = rootContainer.resolve(ServiceWithDependencyAbstraction);
  const consumer2 = child1.resolve(ServiceWithDependencyAbstraction);
  const consumer3 = child2.resolve(ServiceWithDependencyAbstraction);

  expect(consumer1).not.toBe(consumer2);
  expect(consumer1).not.toBe(consumer3);

  expect(consumer1.myService).not.toBe(consumer2.myService);
  expect(consumer1.myService).not.toBe(consumer3.myService);

  expect(consumer1.myService).toBe(rootContainer.resolve(MyServiceAbstraction));
  expect(consumer2.myService).toBe(child1.resolve(MyServiceAbstraction));
});
```

- [ ] **Step 4: Update singletons.test.ts — "Edge cases" decorator test**

Replace the "should handle singleton with decorators applied at parent level" test (lines 269-302) with:

```typescript
it("should handle singleton with decorators applied at parent level", () => {
  class MyServiceDecoratorImpl implements MyService {
    public readonly id = Math.random();

    constructor(private decoratee: MyService) {}

    greet() {
      return `Decorated: ${this.decoratee.greet()}`;
    }
  }

  const MyServiceDecorator = MyServiceAbstraction.createDecorator({
    decorator: MyServiceDecoratorImpl,
    dependencies: []
  });

  const rootContainer = new Container();
  rootContainer.register(MyServiceImpl).inSingletonScope();
  rootContainer.registerDecorator(MyServiceDecorator);

  const child1 = rootContainer.createChildContainer();
  const child2 = rootContainer.createChildContainer();

  const i1 = rootContainer.resolve(MyServiceAbstraction);
  const i2 = child1.resolve(MyServiceAbstraction);
  const i3 = child2.resolve(MyServiceAbstraction);

  expect(i1).not.toBe(i2);
  expect(i2).not.toBe(i3);

  expect(i1.greet()).toContain("Decorated:");
  expect(i2.greet()).toContain("Decorated:");
  expect(i3.greet()).toContain("Decorated:");

  expect(rootContainer.resolve(MyServiceAbstraction)).toBe(i1);
  expect(child1.resolve(MyServiceAbstraction)).toBe(i2);
});
```

- [ ] **Step 5: Update registry/registry.test.ts — cross-container test**

Replace the "child container resolves the same singleton registry as the parent" test (lines 63-70) with:

```typescript
test("child container resolves its own singleton registry instance", () => {
  const child = container.createChildContainer();

  const registryFromParent = container.resolve(PluginRegistryAbstraction);
  const registryFromChild = child.resolve(PluginRegistryAbstraction);

  expect(registryFromParent).not.toBe(registryFromChild);

  expect(registryFromParent.getAll()).toHaveLength(3);
  expect(registryFromChild.getAll()).toHaveLength(3);
  expect(registryFromChild.executeAll()).toEqual(registryFromParent.executeAll());
});
```

- [ ] **Step 6: Run all tests**

Run: `pnpm test`

Expected: All tests pass — `singletons.test.ts`, `registry/registry.test.ts`, `singletonBleed.test.ts`, and all existing `childContainer` and `container.test.ts` tests.

- [ ] **Step 7: Commit the test updates**

```bash
git add __tests__/singletons.test.ts __tests__/registry/registry.test.ts
git commit -m "test: update existing singleton tests for per-container scoping semantics"
```

---

### Task 4: Write singleton cross-resolution tests

**Files:**

- Create: `__tests__/childContainer/singletonCrossResolution.test.ts`

Mirror the existing `childContainer.test.ts` scenarios but with `.inSingletonScope()` on the NotificationService. These reuse the same abstractions and implementations from the childContainer test infrastructure.

- [ ] **Step 1: Create the singleton cross-resolution test file**

```typescript
import { beforeEach, describe, expect, test } from "vitest";
import { Container } from "../../src/index.js";
import { NotificationService } from "./abstractions.js";
import {
  ConsoleLogger,
  ConsoleLoggerImpl,
  NotificationServiceImpl,
  NotificationServiceImplementation,
  NullAuditTrail,
  NullAuditTrailImpl,
  NullEmailClient,
  NullEmailClientImpl,
  NullLogger,
  NullLoggerImpl,
  NullTemplateEngine,
  NullTemplateEngineImpl,
  RealAuditTrail,
  RealAuditTrailImpl,
  SmtpEmailClient,
  SmtpEmailClientImpl
} from "./implementations.js";

describe("Child Container - singleton cross-container resolution", () => {
  let parentContainer: Container;

  beforeEach(() => {
    parentContainer = new Container();
    parentContainer.register(NullLoggerImpl);
    parentContainer.register(NullEmailClientImpl);
    parentContainer.register(NullTemplateEngineImpl);
    parentContainer.register(NullAuditTrailImpl);
    parentContainer.register(NotificationServiceImplementation).inSingletonScope();
  });

  test("parent singleton resolves all null implementations", () => {
    const service = parentContainer.resolve(NotificationService) as NotificationServiceImpl;
    expect(service.getLogger()).toBeInstanceOf(NullLogger);
    expect(service.getEmailClient()).toBeInstanceOf(NullEmailClient);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("child overrides some deps - child singleton uses child deps, parent unaffected", () => {
    const child = parentContainer.createChildContainer();
    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);

    const childService = child.resolve(NotificationService) as NotificationServiceImpl;
    expect(childService.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(childService.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(childService.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(childService.getAuditTrail()).toBeInstanceOf(NullAuditTrail);

    const parentService = parentContainer.resolve(NotificationService) as NotificationServiceImpl;
    expect(parentService.getLogger()).toBeInstanceOf(NullLogger);
    expect(parentService.getEmailClient()).toBeInstanceOf(NullEmailClient);
  });

  test("child overrides all deps - child singleton uses all child deps", () => {
    const child = parentContainer.createChildContainer();
    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);
    child.register(RealAuditTrailImpl);

    const service = child.resolve(NotificationService) as NotificationServiceImpl;
    expect(service.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(service.getAuditTrail()).toBeInstanceOf(RealAuditTrail);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
  });

  test("child overrides no deps - child singleton uses all parent deps", () => {
    const child = parentContainer.createChildContainer();
    const service = child.resolve(NotificationService) as NotificationServiceImpl;

    expect(service.getLogger()).toBeInstanceOf(NullLogger);
    expect(service.getEmailClient()).toBeInstanceOf(NullEmailClient);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("grandchild inherits overrides through the chain (singleton)", () => {
    const child = parentContainer.createChildContainer();
    child.register(ConsoleLoggerImpl);

    const grandchild = child.createChildContainer();
    grandchild.register(SmtpEmailClientImpl);

    const service = grandchild.resolve(NotificationService) as NotificationServiceImpl;
    expect(service.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("child override does not affect parent singleton resolution", () => {
    const child = parentContainer.createChildContainer();
    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);

    const parentService = parentContainer.resolve(NotificationService) as NotificationServiceImpl;
    expect(parentService.getLogger()).toBeInstanceOf(NullLogger);
    expect(parentService.getEmailClient()).toBeInstanceOf(NullEmailClient);

    const childService = child.resolve(NotificationService) as NotificationServiceImpl;
    expect(childService.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(childService.getEmailClient()).toBeInstanceOf(SmtpEmailClient);

    expect(parentService).not.toBe(childService);

    const parentServiceAgain = parentContainer.resolve(
      NotificationService
    ) as NotificationServiceImpl;
    expect(parentServiceAgain).toBe(parentService);
    expect(parentServiceAgain.getLogger()).toBeInstanceOf(NullLogger);
  });

  test("great-grandchild resolves overrides spread across 4 levels (singleton)", () => {
    const child = parentContainer.createChildContainer();
    child.register(ConsoleLoggerImpl);

    const grandchild = child.createChildContainer();
    grandchild.register(SmtpEmailClientImpl);

    const greatGrandchild = grandchild.createChildContainer();
    greatGrandchild.register(RealAuditTrailImpl);

    const service = greatGrandchild.resolve(NotificationService) as NotificationServiceImpl;
    expect(service.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(service.getAuditTrail()).toBeInstanceOf(RealAuditTrail);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/childContainer/singletonCrossResolution.test.ts
git commit -m "test: add singleton variants of child container cross-resolution tests"
```

---

### Task 5: Write decorator chain tests

**Files:**

- Create: `__tests__/singletonDecoratorChain.test.ts`

- [ ] **Step 1: Create the decorator chain test file**

```typescript
import { describe, test, expect } from "vitest";
import { Abstraction, Container, createImplementation } from "../src/index.js";

interface IService {
  execute(): string;
}

class BaseService implements IService {
  execute(): string {
    return "base";
  }
}

class ParentDecorator implements IService {
  constructor(private decoratee: IService) {}

  execute(): string {
    return `parentDec(${this.decoratee.execute()})`;
  }
}

class ChildDecorator implements IService {
  constructor(private decoratee: IService) {}

  execute(): string {
    return `childDec(${this.decoratee.execute()})`;
  }
}

class GrandchildDecorator implements IService {
  constructor(private decoratee: IService) {}

  execute(): string {
    return `grandchildDec(${this.decoratee.execute()})`;
  }
}

const ServiceAbstraction = new Abstraction<IService>("Service");

const BaseServiceImpl = ServiceAbstraction.createImplementation({
  implementation: BaseService,
  dependencies: []
});

const ParentDecoratorImpl = ServiceAbstraction.createDecorator({
  decorator: ParentDecorator,
  dependencies: []
});

const ChildDecoratorImpl = ServiceAbstraction.createDecorator({
  decorator: ChildDecorator,
  dependencies: []
});

const GrandchildDecoratorImpl = ServiceAbstraction.createDecorator({
  decorator: GrandchildDecorator,
  dependencies: []
});

describe("Singleton decorator chain across container hierarchy", () => {
  test("child decorator applied to parent singleton", () => {
    const parent = new Container();
    parent.register(BaseServiceImpl).inSingletonScope();
    parent.registerDecorator(ParentDecoratorImpl);

    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    const childResult = child.resolve(ServiceAbstraction);
    expect(childResult.execute()).toBe("childDec(parentDec(base))");

    const parentResult = parent.resolve(ServiceAbstraction);
    expect(parentResult.execute()).toBe("parentDec(base)");
  });

  test("grandchild gets all three decorator layers in parent-to-child order", () => {
    const parent = new Container();
    parent.register(BaseServiceImpl).inSingletonScope();
    parent.registerDecorator(ParentDecoratorImpl);

    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    const grandchild = child.createChildContainer();
    grandchild.registerDecorator(GrandchildDecoratorImpl);

    const grandchildResult = grandchild.resolve(ServiceAbstraction);
    expect(grandchildResult.execute()).toBe("grandchildDec(childDec(parentDec(base)))");

    const childResult = child.resolve(ServiceAbstraction);
    expect(childResult.execute()).toBe("childDec(parentDec(base))");

    const parentResult = parent.resolve(ServiceAbstraction);
    expect(parentResult.execute()).toBe("parentDec(base)");
  });

  test("parent singleton unaffected by child decorators", () => {
    const parent = new Container();
    parent.register(BaseServiceImpl).inSingletonScope();
    parent.registerDecorator(ParentDecoratorImpl);

    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    child.resolve(ServiceAbstraction);

    const parentResult = parent.resolve(ServiceAbstraction);
    expect(parentResult.execute()).toBe("parentDec(base)");

    const parentAgain = parent.resolve(ServiceAbstraction);
    expect(parentAgain).toBe(parentResult);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/singletonDecoratorChain.test.ts
git commit -m "test: add singleton decorator chain tests across container hierarchy"
```

---

### Task 6: Update documentation and run final checks

**Files:**

- Modify: `AGENTS.md:39-43`

- [ ] **Step 1: Update AGENTS.md Lifetime Scopes section**

In `AGENTS.md`, replace the singleton bullet (line 43):

```
- **Singleton** - One instance per container where registered. Cached after first resolution (including decorators). Shared with all child containers that don't shadow the registration.
```

With:

```
- **Singleton** - One instance per container that resolves it. Cached after first resolution (including decorators). Each container in the hierarchy gets its own instance reflecting its own dependency graph. Inheritance flows downward — child sees parent registrations plus its own — but never upward.
```

- [ ] **Step 2: Run full check suite**

Run: `pnpm lint && pnpm build && pnpm test`

Expected: All pass — lint clean, build produces `dist/index.js` + `dist/index.d.ts`, all tests green.

- [ ] **Step 3: Fix any formatting issues**

Run: `pnpm lint:fix`

Only run this if the lint step from Step 2 reported oxfmt formatting issues.

- [ ] **Step 4: Commit documentation update**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md singleton lifetime scope documentation"
```

- [ ] **Step 5: Verify final state**

Run: `pnpm lint && pnpm build && pnpm test`

Expected: All green, clean working tree.
