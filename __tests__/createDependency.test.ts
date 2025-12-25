import { describe, test, expect, beforeEach } from "vitest";
import { Container, Abstraction, createDependency } from "../src/index.js";

describe("createDependency", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should create a dependency-only class without abstraction", () => {
    // Create an abstraction for a simple service
    const ConfigAbstraction = new Abstraction<{ getValue(): string }>("Config");

    class ConfigImpl {
      getValue(): string {
        return "config value";
      }
    }

    const ConfigImplementation = ConfigAbstraction.createImplementation({
      implementation: ConfigImpl,
      dependencies: []
    });

    // Create a local dependency class that doesn't need an abstraction
    class LocalService {
      constructor(private config: { getValue(): string }) {}

      getConfigValue(): string {
        return this.config.getValue();
      }
    }

    const LocalServiceDep = createDependency({
      implementation: LocalService,
      dependencies: [ConfigAbstraction]
    });

    // Now use the local service in another abstraction
    const AppAbstraction = new Abstraction<{ run(): string }>("App");

    class AppImpl {
      constructor(private localService: LocalService) {}

      run(): string {
        return this.localService.getConfigValue();
      }
    }

    const AppImplementation = AppAbstraction.createImplementation({
      implementation: AppImpl,
      dependencies: [LocalServiceDep]
    });

    // Register and resolve
    container.register(ConfigImplementation);
    container.register(AppImplementation);

    const app = container.resolve(AppAbstraction);
    expect(app.run()).toBe("config value");
  });

  test("should resolve dependencies transitively through dependency-only classes", () => {
    // Create a chain: ServiceA -> LocalClass -> ServiceB
    const ServiceBAbstraction = new Abstraction<{ getValue(): number }>("ServiceB");

    class ServiceBImpl {
      getValue(): number {
        return 42;
      }
    }

    const ServiceBImplementation = ServiceBAbstraction.createImplementation({
      implementation: ServiceBImpl,
      dependencies: []
    });

    // Local class without abstraction
    class LocalMiddleware {
      constructor(private serviceB: { getValue(): number }) {}

      process(): number {
        return this.serviceB.getValue() * 2;
      }
    }

    const LocalMiddlewareDep = createDependency({
      implementation: LocalMiddleware,
      dependencies: [ServiceBAbstraction]
    });

    // Another service that depends on the local class
    const ServiceAAbstraction = new Abstraction<{ compute(): number }>("ServiceA");

    class ServiceAImpl {
      constructor(private middleware: LocalMiddleware) {}

      compute(): number {
        return this.middleware.process() + 10;
      }
    }

    const ServiceAImplementation = ServiceAAbstraction.createImplementation({
      implementation: ServiceAImpl,
      dependencies: [LocalMiddlewareDep]
    });

    container.register(ServiceBImplementation);
    container.register(ServiceAImplementation);

    const serviceA = container.resolve(ServiceAAbstraction);
    expect(serviceA.compute()).toBe(94); // (42 * 2) + 10
  });

  test("should work with multiple dependency-only classes", () => {
    const DataAbstraction = new Abstraction<{ getData(): string }>("Data");

    class DataImpl {
      getData(): string {
        return "data";
      }
    }

    const DataImplementation = DataAbstraction.createImplementation({
      implementation: DataImpl,
      dependencies: []
    });

    // First local class
    class LocalParser {
      constructor(private data: { getData(): string }) {}

      parse(): string {
        return `parsed: ${this.data.getData()}`;
      }
    }

    const LocalParserDep = createDependency({
      implementation: LocalParser,
      dependencies: [DataAbstraction]
    });

    // Second local class
    class LocalFormatter {
      constructor(private data: { getData(): string }) {}

      format(): string {
        return `formatted: ${this.data.getData()}`;
      }
    }

    const LocalFormatterDep = createDependency({
      implementation: LocalFormatter,
      dependencies: [DataAbstraction]
    });

    // Service that uses both local classes
    const ProcessorAbstraction = new Abstraction<{ process(): string }>("Processor");

    class ProcessorImpl {
      constructor(
        private parser: LocalParser,
        private formatter: LocalFormatter
      ) {}

      process(): string {
        return `${this.parser.parse()} | ${this.formatter.format()}`;
      }
    }

    const ProcessorImplementation = ProcessorAbstraction.createImplementation({
      implementation: ProcessorImpl,
      dependencies: [LocalParserDep, LocalFormatterDep]
    });

    container.register(DataImplementation);
    container.register(ProcessorImplementation);

    const processor = container.resolve(ProcessorAbstraction);
    expect(processor.process()).toBe("parsed: data | formatted: data");
  });

  test("should throw error if dependency-only class is used without metadata", () => {
    // Create a class without using createDependency
    class InvalidClass {
      constructor(private value: string) {}
    }

    const ServiceAbstraction = new Abstraction<{ test(): void }>("Service");

    class ServiceImpl {
      constructor(private invalid: InvalidClass) {}

      test(): void {}
    }

    const ServiceImplementation = ServiceAbstraction.createImplementation({
      implementation: ServiceImpl,
      dependencies: [InvalidClass] // Using class without createDependency
    });

    container.register(ServiceImplementation);

    expect(() => container.resolve(ServiceAbstraction)).toThrow(
      "InvalidClass does not have dependency metadata"
    );
  });

  test("should support nested dependency-only classes", () => {
    const CoreAbstraction = new Abstraction<{ getCore(): string }>("Core");

    class CoreImpl {
      getCore(): string {
        return "core";
      }
    }

    const CoreImplementation = CoreAbstraction.createImplementation({
      implementation: CoreImpl,
      dependencies: []
    });

    // Level 1 local class
    class Level1 {
      constructor(private core: { getCore(): string }) {}

      getLevel1(): string {
        return `L1(${this.core.getCore()})`;
      }
    }

    const Level1Dep = createDependency({
      implementation: Level1,
      dependencies: [CoreAbstraction]
    });

    // Level 2 local class depends on Level 1
    class Level2 {
      constructor(private level1: Level1) {}

      getLevel2(): string {
        return `L2(${this.level1.getLevel1()})`;
      }
    }

    const Level2Dep = createDependency({
      implementation: Level2,
      dependencies: [Level1Dep]
    });

    // Top level service depends on Level 2
    const TopAbstraction = new Abstraction<{ getTop(): string }>("Top");

    class TopImpl {
      constructor(private level2: Level2) {}

      getTop(): string {
        return `Top(${this.level2.getLevel2()})`;
      }
    }

    const TopImplementation = TopAbstraction.createImplementation({
      implementation: TopImpl,
      dependencies: [Level2Dep]
    });

    container.register(CoreImplementation);
    container.register(TopImplementation);

    const top = container.resolve(TopAbstraction);
    expect(top.getTop()).toBe("Top(L2(L1(core)))");
  });
});
