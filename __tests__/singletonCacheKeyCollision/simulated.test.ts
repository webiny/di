import { describe, test, expect } from "vitest";
import { Container, Abstraction, createImplementation } from "../../src/index.js";

describe("Singleton cache key collision - simulated minified class names", () => {
  test("singleton implementations with identical class names resolve to distinct instances", () => {
    interface IService {
      id(): string;
    }

    const ServiceAbstraction = new Abstraction<IService>("Service");

    const ServiceA = { value: "a" };
    const ServiceB = { value: "b" };
    const ServiceC = { value: "c" };

    function makeImpl(marker: { value: string }) {
      class a implements IService {
        id(): string {
          return marker.value;
        }
      }
      return a;
    }

    const ImplA = makeImpl(ServiceA);
    const ImplB = makeImpl(ServiceB);
    const ImplC = makeImpl(ServiceC);

    expect(ImplA.name).toBe("a");
    expect(ImplB.name).toBe("a");
    expect(ImplC.name).toBe("a");

    const RegA = createImplementation({
      abstraction: ServiceAbstraction,
      implementation: ImplA,
      dependencies: []
    });
    const RegB = createImplementation({
      abstraction: ServiceAbstraction,
      implementation: ImplB,
      dependencies: []
    });
    const RegC = createImplementation({
      abstraction: ServiceAbstraction,
      implementation: ImplC,
      dependencies: []
    });

    const container = new Container();
    container.register(RegA).inSingletonScope();
    container.register(RegB).inSingletonScope();
    container.register(RegC).inSingletonScope();

    const all = container.resolveAll(ServiceAbstraction);

    expect(all).toHaveLength(3);
    expect(all[0]!.id()).toBe("a");
    expect(all[1]!.id()).toBe("b");
    expect(all[2]!.id()).toBe("c");
  });
});
