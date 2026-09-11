import { describe, test, expect } from "vitest";
import { Abstraction, Container } from "../src/index.js";

interface IService {
  execute(): string;
}

interface IPrefix {
  value: string;
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

class PrefixedDecorator implements IService {
  constructor(
    private prefix: IPrefix,
    private decoratee: IService
  ) {}

  execute(): string {
    return `${this.prefix.value}:${this.decoratee.execute()}`;
  }
}

const Service = new Abstraction<IService>("Service");
const Prefix = new Abstraction<IPrefix>("Prefix");

const BaseServiceImpl = Service.createImplementation({
  implementation: BaseService,
  dependencies: []
});

const ParentDecoratorImpl = Service.createDecorator({
  decorator: ParentDecorator,
  dependencies: []
});

const ChildDecoratorImpl = Service.createDecorator({
  decorator: ChildDecorator,
  dependencies: []
});

const GrandchildDecoratorImpl = Service.createDecorator({
  decorator: GrandchildDecorator,
  dependencies: []
});

const PrefixedDecoratorImpl = Service.createDecorator({
  decorator: PrefixedDecorator,
  dependencies: [Prefix]
});

describe("Decorator chain across the container hierarchy - singletons", () => {
  test("child decorator wraps the parent decorator; parent gets only its own", () => {
    const parent = new Container();
    parent.register(BaseServiceImpl).inSingletonScope();
    parent.registerDecorator(ParentDecoratorImpl);
    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    expect(child.resolve(Service).execute()).toBe("childDec(parentDec(base))");
    expect(parent.resolve(Service).execute()).toBe("parentDec(base)");
  });

  test("grandchild gets three layers root-first, each ancestor decorator applied exactly once", () => {
    const parent = new Container();
    parent.register(BaseServiceImpl).inSingletonScope();
    parent.registerDecorator(ParentDecoratorImpl);
    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);
    const grandchild = child.createChildContainer();
    grandchild.registerDecorator(GrandchildDecoratorImpl);

    expect(grandchild.resolve(Service).execute()).toBe("grandchildDec(childDec(parentDec(base)))");
    expect(child.resolve(Service).execute()).toBe("childDec(parentDec(base))");
    expect(parent.resolve(Service).execute()).toBe("parentDec(base)");
  });

  test("parent singleton is unaffected after a child with its own decorator resolves first", () => {
    const parent = new Container();
    parent.register(BaseServiceImpl).inSingletonScope();
    parent.registerDecorator(ParentDecoratorImpl);
    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    child.resolve(Service);

    const parentResult = parent.resolve(Service);
    expect(parentResult.execute()).toBe("parentDec(base)");
    expect(parent.resolve(Service)).toBe(parentResult);
  });

  test("intermediate decorator's dependency is resolved from the requesting container", () => {
    const parent = new Container();
    parent.register(BaseServiceImpl).inSingletonScope();
    const child = parent.createChildContainer();
    child.registerInstance(Prefix, { value: "child" });
    child.registerDecorator(PrefixedDecoratorImpl);
    const grandchild = child.createChildContainer();
    grandchild.registerInstance(Prefix, { value: "grandchild" });

    expect(grandchild.resolve(Service).execute()).toBe("grandchild:base");
    expect(child.resolve(Service).execute()).toBe("child:base");
  });

  test("decorator registered above the owner still applies when the child resolves", () => {
    const root = new Container();
    root.registerDecorator(ParentDecoratorImpl);
    const owner = root.createChildContainer();
    owner.register(BaseServiceImpl).inSingletonScope();
    const child = owner.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    expect(child.resolve(Service).execute()).toBe("childDec(parentDec(base))");
    expect(owner.resolve(Service).execute()).toBe("parentDec(base)");
  });
});

describe("Decorator chain across the container hierarchy - non-singleton paths", () => {
  test("child decorator applies to a parent-owned transient resolved from the child", () => {
    const parent = new Container();
    parent.register(BaseServiceImpl);
    parent.registerDecorator(ParentDecoratorImpl);
    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    expect(child.resolve(Service).execute()).toBe("childDec(parentDec(base))");
    expect(parent.resolve(Service).execute()).toBe("parentDec(base)");
  });

  test("child decorator applies to a parent-owned instance registration resolved from the child", () => {
    const parent = new Container();
    parent.registerInstance(Service, new BaseService());
    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    expect(child.resolve(Service).execute()).toBe("childDec(base)");
    expect(parent.resolve(Service).execute()).toBe("base");
  });

  test("child decorator applies to a parent-owned factory registration resolved from the child", () => {
    const parent = new Container();
    parent.registerFactory(Service, () => new BaseService());
    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    expect(child.resolve(Service).execute()).toBe("childDec(base)");
    expect(parent.resolve(Service).execute()).toBe("base");
  });

  test("child decorator applies to every entry of resolveAll from the child", () => {
    const parent = new Container();
    parent.register(BaseServiceImpl);
    parent.registerInstance(Service, new BaseService());
    parent.registerFactory(Service, () => new BaseService());
    const child = parent.createChildContainer();
    child.registerDecorator(ChildDecoratorImpl);

    expect(child.resolveAll(Service).map(s => s.execute())).toEqual([
      "childDec(base)",
      "childDec(base)",
      "childDec(base)"
    ]);
    expect(parent.resolveAll(Service).map(s => s.execute())).toEqual(["base", "base", "base"]);
  });
});
