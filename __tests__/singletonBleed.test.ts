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

const names = (registry: IProductRegistry) => registry.getAll().map(p => p.name);

function createParent(): Container {
  const parent = new Container();
  parent.register(CoffeeProductImpl);
  parent.register(ComputerProductImpl);
  parent.register(ProductRegistryImpl).inSingletonScope();
  return parent;
}

describe("Singleton scope - per-container instances", () => {
  test("child inherits parent registrations plus its own", () => {
    const parent = createParent();
    const child = parent.createChildContainer();
    child.register(CarProductImpl);
    child.register(MobilePhoneProductImpl);

    expect(names(child.resolve(ProductRegistryAbstraction))).toEqual([
      "coffee",
      "computer",
      "car",
      "mobilePhone"
    ]);
  });

  test("child registrations do not bleed into the parent singleton", () => {
    const parent = createParent();
    const child = parent.createChildContainer();
    child.register(CarProductImpl);

    const childRegistry = child.resolve(ProductRegistryAbstraction);
    expect(names(childRegistry)).toEqual(["coffee", "computer", "car"]);

    const parentRegistry = parent.resolve(ProductRegistryAbstraction);
    expect(names(parentRegistry)).toEqual(["coffee", "computer"]);
    expect(parentRegistry).not.toBe(childRegistry);
  });

  test("sibling children get isolated instances with their own registrations", () => {
    const parent = createParent();
    const child1 = parent.createChildContainer();
    child1.register(CarProductImpl);
    const child2 = parent.createChildContainer();
    child2.register(LaptopProductImpl);

    const child1Registry = child1.resolve(ProductRegistryAbstraction);
    const child2Registry = child2.resolve(ProductRegistryAbstraction);
    const parentRegistry = parent.resolve(ProductRegistryAbstraction);

    expect(names(child1Registry)).toEqual(["coffee", "computer", "car"]);
    expect(names(child2Registry)).toEqual(["coffee", "computer", "laptop"]);
    expect(names(parentRegistry)).toEqual(["coffee", "computer"]);

    expect(child1Registry).not.toBe(child2Registry);
    expect(child1Registry).not.toBe(parentRegistry);
  });

  test("grandchild sees parent + child + own; parent and child are untouched", () => {
    const parent = createParent();
    const child = parent.createChildContainer();
    child.register(CarProductImpl);
    child.register(MobilePhoneProductImpl);
    const grandchild = child.createChildContainer();
    grandchild.register(LaptopProductImpl);
    grandchild.register(BallProductImpl);

    const grandchildRegistry = grandchild.resolve(ProductRegistryAbstraction);
    const childRegistry = child.resolve(ProductRegistryAbstraction);
    const parentRegistry = parent.resolve(ProductRegistryAbstraction);

    expect(names(grandchildRegistry)).toEqual([
      "coffee",
      "computer",
      "car",
      "mobilePhone",
      "laptop",
      "ball"
    ]);
    expect(names(childRegistry)).toEqual(["coffee", "computer", "car", "mobilePhone"]);
    expect(names(parentRegistry)).toEqual(["coffee", "computer"]);
  });

  test("same-container identity: resolving twice returns the same instance", () => {
    const parent = createParent();
    const child = parent.createChildContainer();
    child.register(CarProductImpl);

    expect(child.resolve(ProductRegistryAbstraction)).toBe(
      child.resolve(ProductRegistryAbstraction)
    );
    expect(parent.resolve(ProductRegistryAbstraction)).toBe(
      parent.resolve(ProductRegistryAbstraction)
    );
  });

  test("both siblings resolve before the parent; parent is unpolluted", () => {
    const parent = createParent();
    const child1 = parent.createChildContainer();
    child1.register(CarProductImpl);
    const child2 = parent.createChildContainer();
    child2.register(LaptopProductImpl);

    child1.resolve(ProductRegistryAbstraction);
    child2.resolve(ProductRegistryAbstraction);

    expect(names(parent.resolve(ProductRegistryAbstraction))).toEqual(["coffee", "computer"]);
  });

  test("parent resolves before the child; child still gets its own instance", () => {
    const parent = createParent();
    const parentRegistry = parent.resolve(ProductRegistryAbstraction);
    expect(names(parentRegistry)).toEqual(["coffee", "computer"]);

    const child = parent.createChildContainer();
    child.register(CarProductImpl);

    const childRegistry = child.resolve(ProductRegistryAbstraction);
    expect(names(childRegistry)).toEqual(["coffee", "computer", "car"]);
    expect(childRegistry).not.toBe(parentRegistry);

    const parentAgain = parent.resolve(ProductRegistryAbstraction);
    expect(parentAgain).toBe(parentRegistry);
    expect(names(parentAgain)).toEqual(["coffee", "computer"]);
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
    expect(childB).not.toBe(parentB);
  });

  test("singleton dependency chain: parent pre-cached dependency does not leak into the child", () => {
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

    const parentA = parent.resolve(ServiceAAbstraction);
    const childB = child.resolve(ServiceBAbstraction);

    expect(childB.serviceA).not.toBe(parentA);
    expect(childB.serviceA).toBe(child.resolve(ServiceAAbstraction));
  });

  test("simple singleton without overridable deps still yields per-container instances", () => {
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

    expect(parent.resolve(SimpleAbstraction)).toBe(parentInstance);
    expect(child.resolve(SimpleAbstraction)).toBe(childInstance);
  });
});
