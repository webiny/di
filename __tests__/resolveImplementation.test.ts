import { describe, test, expect } from "vitest";
import {
  Abstraction,
  Container,
  createComposite,
  createDecorator,
  createImplementation
} from "../src/index.js";

interface IGreeter {
  greet(): string;
}

interface IPrefix {
  value: string;
}

const Greeter = new Abstraction<IGreeter>("Greeter");
const Prefix = new Abstraction<IPrefix>("Prefix");

class Hello implements IGreeter {
  greet() {
    return "hello";
  }
}

class Goodbye implements IGreeter {
  greet() {
    return "goodbye";
  }
}

class PrefixedGreeter implements IGreeter {
  constructor(private prefix: IPrefix) {}
  greet() {
    return `${this.prefix.value} hello`;
  }
}

const HelloImpl = createImplementation({
  abstraction: Greeter,
  implementation: Hello,
  dependencies: []
});

const GoodbyeImpl = createImplementation({
  abstraction: Greeter,
  implementation: Goodbye,
  dependencies: []
});

const PrefixedGreeterImpl = createImplementation({
  abstraction: Greeter,
  implementation: PrefixedGreeter,
  dependencies: [Prefix]
});

describe("resolveImplementation", () => {
  test("resolves the given implementation without registering it", () => {
    const container = new Container();

    expect(container.resolveImplementation(HelloImpl).greet()).toBe("hello");

    // Nothing was registered, so the abstraction is still unresolvable.
    expect(() => container.resolve(Greeter)).toThrow("No registration found for Greeter");
    expect(container.resolveAll(Greeter)).toHaveLength(0);
  });

  test("takes dependencies from the implementation's own metadata", () => {
    const container = new Container();
    container.registerInstance(Prefix, { value: "well," });

    expect(container.resolveImplementation(PrefixedGreeterImpl).greet()).toBe("well, hello");
  });

  test("picks one implementation when several share an abstraction", () => {
    const container = new Container();
    container.register(HelloImpl);
    container.register(GoodbyeImpl);

    // `resolve` cannot say which one is wanted and `resolveAll` builds both. This can.
    expect(container.resolveImplementation(GoodbyeImpl).greet()).toBe("goodbye");
  });

  test("builds only the requested implementation", () => {
    const container = new Container();
    const built: string[] = [];

    class Counted implements IGreeter {
      constructor() {
        built.push("counted");
      }
      greet() {
        return "counted";
      }
    }

    class Other implements IGreeter {
      constructor() {
        built.push("other");
      }
      greet() {
        return "other";
      }
    }

    const CountedImpl = createImplementation({
      abstraction: Greeter,
      implementation: Counted,
      dependencies: []
    });
    const OtherImpl = createImplementation({
      abstraction: Greeter,
      implementation: Other,
      dependencies: []
    });

    container.register(CountedImpl);
    container.register(OtherImpl);

    container.resolveImplementation(CountedImpl);

    expect(built).toEqual(["counted"]);
  });

  test("applies decorators registered for the abstraction", () => {
    const container = new Container();

    container.registerDecorator(
      createDecorator({
        abstraction: Greeter,
        decorator: class implements IGreeter {
          constructor(private decoratee: IGreeter) {}
          greet() {
            return `[${this.decoratee.greet()}]`;
          }
        },
        dependencies: []
      })
    );

    expect(container.resolveImplementation(HelloImpl).greet()).toBe("[hello]");
  });

  test("applies decorators registered on a parent container", () => {
    const parent = new Container();
    parent.registerDecorator(
      createDecorator({
        abstraction: Greeter,
        decorator: class implements IGreeter {
          constructor(private decoratee: IGreeter) {}
          greet() {
            return `[${this.decoratee.greet()}]`;
          }
        },
        dependencies: []
      })
    );

    const child = parent.createChildContainer();

    expect(child.resolveImplementation(HelloImpl).greet()).toBe("[hello]");
  });

  test("resolves dependencies from the container it was called on", () => {
    const parent = new Container();
    parent.registerInstance(Prefix, { value: "parent" });

    const child = parent.createChildContainer();
    child.registerInstance(Prefix, { value: "child" });

    expect(parent.resolveImplementation(PrefixedGreeterImpl).greet()).toBe("parent hello");
    expect(child.resolveImplementation(PrefixedGreeterImpl).greet()).toBe("child hello");
  });

  /**
   * The one behaviour that makes `resolve()` and `resolveImplementation()` non-interchangeable, and
   * the reason they are separate methods rather than one overload: this does not consult
   * registrations, so a registered singleton is not shared.
   */
  test("does not share a registered singleton", () => {
    const container = new Container();
    container.register(HelloImpl).inSingletonScope();

    const viaAbstraction = container.resolve(Greeter);
    expect(container.resolve(Greeter)).toBe(viaAbstraction);

    const viaImplementation = container.resolveImplementation(HelloImpl);
    expect(viaImplementation).not.toBe(viaAbstraction);
    expect(container.resolveImplementation(HelloImpl)).not.toBe(viaImplementation);
  });

  test("returns a new instance each call, since there is no registration to cache on", () => {
    const container = new Container();

    expect(container.resolveImplementation(HelloImpl)).not.toBe(
      container.resolveImplementation(HelloImpl)
    );
  });

  test("throws for a class that is not an implementation", () => {
    const container = new Container();

    class NotAnImplementation {}

    expect(() => container.resolveImplementation(NotAnImplementation)).toThrow(
      "No abstraction metadata found for NotAnImplementation"
    );
  });

  test("throws for a decorator", () => {
    const container = new Container();

    const SomeDecorator = createDecorator({
      abstraction: Greeter,
      decorator: class implements IGreeter {
        constructor(private decoratee: IGreeter) {}
        greet() {
          return this.decoratee.greet();
        }
      },
      dependencies: []
    });

    expect(() => container.resolveImplementation(SomeDecorator)).toThrow("is a decorator!");
  });

  test("throws for a composite", () => {
    const container = new Container();

    const SomeComposite = createComposite({
      abstraction: Greeter,
      implementation: class implements IGreeter {
        constructor(private greeters: IGreeter[]) {}
        greet() {
          return this.greeters.map(g => g.greet()).join(",");
        }
      },
      dependencies: [[Greeter, { multiple: true }]]
    });

    expect(() => container.resolveImplementation(SomeComposite)).toThrow("is a composite!");
  });
});
