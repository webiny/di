import { describe, it, expect } from "vitest";
import { Container, Abstraction } from "../src/index.js";

/**
 * This test suite verifies:
 *
 * 1) Parent-level singletons are shared across all children
 * 2) Child-level singletons are scoped to that child and its descendants
 * 3) Singleton dependencies are properly shared across hierarchy
 * 4) Edge cases like shadowing and decorator application
 * 5) Sibling isolation - siblings don't share each other's singletons
 */

describe("Container - Singleton Scope Across Hierarchy", () => {
  class MyService {
    public readonly id = Math.random();

    greet() {
      return `Hello from ${this.id}`;
    }
  }

  class ChildSpecificService {
    public readonly id = Math.random();
  }

  class ServiceWithDependency {
    constructor(public readonly myService: MyService) {}
  }

  const MyServiceAbstraction = new Abstraction<MyService>("MyService");
  const ChildSpecificServiceAbstraction = new Abstraction<ChildSpecificService>(
    "ChildSpecificService"
  );
  const ServiceWithDependencyAbstraction = new Abstraction<ServiceWithDependency>(
    "ServiceWithDependency"
  );

  const MyServiceImpl = MyServiceAbstraction.createImplementation({
    implementation: MyService,
    dependencies: []
  });

  const ChildSpecificServiceImpl = ChildSpecificServiceAbstraction.createImplementation({
    implementation: ChildSpecificService,
    dependencies: []
  });

  const ServiceWithDependencyImpl = ServiceWithDependencyAbstraction.createImplementation({
    implementation: ServiceWithDependency,
    dependencies: [MyServiceAbstraction]
  });

  describe("Parent-level singletons", () => {
    it("should share singleton instance across all child containers", () => {
      const rootContainer = new Container();
      rootContainer.register(MyServiceImpl).inSingletonScope();

      const child1 = rootContainer.createChildContainer();
      const child2 = rootContainer.createChildContainer();

      const instanceFromRoot = rootContainer.resolve(MyServiceAbstraction);
      const instanceFromChild1 = child1.resolve(MyServiceAbstraction);
      const instanceFromChild2 = child2.resolve(MyServiceAbstraction);

      // All three should be the SAME instance
      expect(instanceFromRoot).toBe(instanceFromChild1);
      expect(instanceFromRoot).toBe(instanceFromChild2);
      expect(instanceFromChild1).toBe(instanceFromChild2);

      // Verify they have the same ID
      expect(instanceFromRoot.id).toBe(instanceFromChild1.id);
      expect(instanceFromRoot.id).toBe(instanceFromChild2.id);
    });

    it("should create singleton only once even with multiple resolves", () => {
      const rootContainer = new Container();
      rootContainer.register(MyServiceImpl).inSingletonScope();

      const child = rootContainer.createChildContainer();

      // Resolve multiple times from different containers
      const i1 = child.resolve(MyServiceAbstraction);
      const i2 = rootContainer.resolve(MyServiceAbstraction);
      const i3 = child.resolve(MyServiceAbstraction);
      const i4 = rootContainer.resolve(MyServiceAbstraction);

      // All should be the same instance
      expect(i1).toBe(i2);
      expect(i2).toBe(i3);
      expect(i3).toBe(i4);
    });

    it("should share singleton through nested child containers", () => {
      const rootContainer = new Container();
      rootContainer.register(MyServiceImpl).inSingletonScope();

      const child1 = rootContainer.createChildContainer();
      const child2 = child1.createChildContainer();
      const child3 = child2.createChildContainer();

      const instanceFromRoot = rootContainer.resolve(MyServiceAbstraction);
      const instanceFromChild1 = child1.resolve(MyServiceAbstraction);
      const instanceFromChild2 = child2.resolve(MyServiceAbstraction);
      const instanceFromChild3 = child3.resolve(MyServiceAbstraction);

      // All should be the same instance, no matter how deep the hierarchy
      expect(instanceFromRoot).toBe(instanceFromChild1);
      expect(instanceFromRoot).toBe(instanceFromChild2);
      expect(instanceFromRoot).toBe(instanceFromChild3);
    });
  });

  describe("Child-level singletons", () => {
    it("should scope singleton to child container where it was registered", () => {
      const rootContainer = new Container();
      const child1 = rootContainer.createChildContainer();
      const child2 = rootContainer.createChildContainer();

      // Register singleton at CHILD level
      child1.register(ChildSpecificServiceImpl).inSingletonScope();

      const instanceFromChild1a = child1.resolve(ChildSpecificServiceAbstraction);
      const instanceFromChild1b = child1.resolve(ChildSpecificServiceAbstraction);

      // Should be same instance within child1
      expect(instanceFromChild1a).toBe(instanceFromChild1b);

      // Should throw when trying to resolve from root (not registered there)
      expect(() => {
        rootContainer.resolve(ChildSpecificServiceAbstraction);
      }).toThrow();

      // Should throw when trying to resolve from child2 (not registered there)
      expect(() => {
        child2.resolve(ChildSpecificServiceAbstraction);
      }).toThrow();
    });

    it("should allow different children to have different singleton instances", () => {
      const rootContainer = new Container();

      const child1 = rootContainer.createChildContainer();
      const child2 = rootContainer.createChildContainer();

      // Register singleton in BOTH children separately
      child1.register(ChildSpecificServiceImpl).inSingletonScope();
      child2.register(ChildSpecificServiceImpl).inSingletonScope();

      const instanceFromChild1 = child1.resolve(ChildSpecificServiceAbstraction);
      const instanceFromChild2 = child2.resolve(ChildSpecificServiceAbstraction);

      // Should be DIFFERENT instances (different registrations)
      expect(instanceFromChild1).not.toBe(instanceFromChild2);
      expect(instanceFromChild1.id).not.toBe(instanceFromChild2.id);
    });

    it("should share child-level singleton with its own nested children", () => {
      const rootContainer = new Container();
      const child = rootContainer.createChildContainer();
      const grandchild = child.createChildContainer();

      // Register at child level
      child.register(ChildSpecificServiceImpl).inSingletonScope();

      const instanceFromChild = child.resolve(ChildSpecificServiceAbstraction);
      const instanceFromGrandchild = grandchild.resolve(ChildSpecificServiceAbstraction);

      // Grandchild should reuse child's singleton
      expect(instanceFromChild).toBe(instanceFromGrandchild);
    });
  });

  describe("Singleton dependencies", () => {
    it("should inject same singleton instance into multiple consumers", () => {
      const rootContainer = new Container();

      // Register dependency as singleton
      rootContainer.register(MyServiceImpl).inSingletonScope();

      // Register consumers as transient
      rootContainer.register(ServiceWithDependencyImpl);

      const child1 = rootContainer.createChildContainer();
      const child2 = rootContainer.createChildContainer();

      const consumer1 = rootContainer.resolve(ServiceWithDependencyAbstraction);
      const consumer2 = child1.resolve(ServiceWithDependencyAbstraction);
      const consumer3 = child2.resolve(ServiceWithDependencyAbstraction);

      // Consumers are different instances (transient)
      expect(consumer1).not.toBe(consumer2);
      expect(consumer1).not.toBe(consumer3);

      // But they all share the SAME singleton dependency
      expect(consumer1.myService).toBe(consumer2.myService);
      expect(consumer1.myService).toBe(consumer3.myService);
      expect(consumer1.myService.id).toBe(consumer2.myService.id);
    });

    it("should maintain singleton across dependency chains", () => {
      class ServiceA {
        public readonly id = Math.random();
      }

      class ServiceB {
        constructor(public readonly serviceA: ServiceA) {}
      }

      class ServiceC {
        constructor(
          public readonly serviceA: ServiceA,
          public readonly serviceB: ServiceB
        ) {}
      }

      const ServiceAAbstraction = new Abstraction<ServiceA>("ServiceA");
      const ServiceBAbstraction = new Abstraction<ServiceB>("ServiceB");
      const ServiceCAbstraction = new Abstraction<ServiceC>("ServiceC");

      const ServiceAImpl = ServiceAAbstraction.createImplementation({
        implementation: ServiceA,
        dependencies: []
      });

      const ServiceBImpl = ServiceBAbstraction.createImplementation({
        implementation: ServiceB,
        dependencies: [ServiceAAbstraction]
      });

      const ServiceCImpl = ServiceCAbstraction.createImplementation({
        implementation: ServiceC,
        dependencies: [ServiceAAbstraction, ServiceBAbstraction]
      });

      const rootContainer = new Container();
      rootContainer.register(ServiceAImpl).inSingletonScope();
      rootContainer.register(ServiceBImpl);
      rootContainer.register(ServiceCImpl);

      const child = rootContainer.createChildContainer();

      const serviceC = child.resolve(ServiceCAbstraction);

      // ServiceC has direct reference to ServiceA and indirect via ServiceB
      // Both should be the SAME singleton instance
      expect(serviceC.serviceA).toBe(serviceC.serviceB.serviceA);
      expect(serviceC.serviceA.id).toBe(serviceC.serviceB.serviceA.id);
    });
  });

  describe("Edge cases", () => {
    it("should handle singleton registered in both parent and child", () => {
      const rootContainer = new Container();
      rootContainer.register(MyServiceImpl).inSingletonScope();

      const child = rootContainer.createChildContainer();
      child.register(MyServiceImpl).inSingletonScope();

      const instanceFromRoot = rootContainer.resolve(MyServiceAbstraction);
      const instanceFromChild = child.resolve(MyServiceAbstraction);

      // Child's registration shadows parent's
      // Should be DIFFERENT instances
      expect(instanceFromRoot).not.toBe(instanceFromChild);
      expect(instanceFromRoot.id).not.toBe(instanceFromChild.id);
    });

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

      // All should be the same decorated singleton
      expect(i1).toBe(i2);
      expect(i2).toBe(i3);

      // Verify decoration was applied
      expect(i1.greet()).toContain("Decorated:");
    });

    it("should not leak singletons between sibling containers", () => {
      const rootContainer = new Container();

      const child1 = rootContainer.createChildContainer();
      const child2 = rootContainer.createChildContainer();

      // Each child registers its own singleton
      child1.register(ChildSpecificServiceImpl).inSingletonScope();
      child2.register(ChildSpecificServiceImpl).inSingletonScope();

      const instance1a = child1.resolve(ChildSpecificServiceAbstraction);
      const instance1b = child1.resolve(ChildSpecificServiceAbstraction);

      const instance2a = child2.resolve(ChildSpecificServiceAbstraction);
      const instance2b = child2.resolve(ChildSpecificServiceAbstraction);

      // Within each child, should reuse singleton
      expect(instance1a).toBe(instance1b);
      expect(instance2a).toBe(instance2b);

      // But sibling children should have different instances
      expect(instance1a).not.toBe(instance2a);
      expect(instance1a.id).not.toBe(instance2a.id);
    });
  });
});
