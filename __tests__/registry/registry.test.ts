import { describe, test, expect, beforeEach } from "vitest";
import { Container, Abstraction, createImplementation } from "../../src/index.js";
import { PluginAbstraction, PluginRegistryAbstraction } from "./abstractions.js";
import {
  AuthPlugin,
  AuthPluginImpl,
  CachePlugin,
  CachePluginImpl,
  LoggingPlugin,
  LoggingPluginImpl,
  PluginRegistryImpl
} from "./implementations.js";

describe("Plugin Registry - Singleton Scope", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.register(AuthPluginImpl).inSingletonScope();
    container.register(CachePluginImpl).inSingletonScope();
    container.register(LoggingPluginImpl).inSingletonScope();
    container.register(PluginRegistryImpl).inSingletonScope();
  });

  test("registry is a singleton - resolving twice returns the same instance", () => {
    const registry1 = container.resolve(PluginRegistryAbstraction);
    const registry2 = container.resolve(PluginRegistryAbstraction);

    expect(registry1).toBe(registry2);
  });

  test("registry contains all registered plugin implementations", () => {
    const registry = container.resolve(PluginRegistryAbstraction);
    const plugins = registry.getAll();

    expect(plugins).toHaveLength(3);
    expect(plugins.some(p => p instanceof AuthPlugin && p.name === "auth")).toBe(true);
    expect(plugins.some(p => p instanceof CachePlugin && p.name === "cache")).toBe(true);
    expect(plugins.some(p => p instanceof LoggingPlugin && p.name === "logging")).toBe(true);
  });

  test("plugins inside the registry are the same singleton instances as individually resolved", () => {
    const registry = container.resolve(PluginRegistryAbstraction);
    const plugins = registry.getAll();

    const allResolved = container.resolveAll(PluginAbstraction);

    for (const plugin of plugins) {
      const matchingResolved = allResolved.find(p => p.constructor === plugin.constructor);
      expect(plugin).toBe(matchingResolved);
    }
  });

  test("plugin order matches registration order", () => {
    const registry = container.resolve(PluginRegistryAbstraction);
    const plugins = registry.getAll();

    expect(plugins[0]).toBeInstanceOf(AuthPlugin);
    expect(plugins[1]).toBeInstanceOf(CachePlugin);
    expect(plugins[2]).toBeInstanceOf(LoggingPlugin);
  });

  test("child container resolves the same singleton registry as the parent", () => {
    const child = container.createChildContainer();

    const registryFromParent = container.resolve(PluginRegistryAbstraction);
    const registryFromChild = child.resolve(PluginRegistryAbstraction);

    expect(registryFromParent).toBe(registryFromChild);
  });

  test("executeAll delegates to every plugin in order", () => {
    const registry = container.resolve(PluginRegistryAbstraction);
    const results = registry.executeAll();

    expect(results).toEqual(["auth:executed", "cache:executed", "logging:executed"]);
  });
});

describe("Plugin Registry - minified class names", () => {
  test("singleton implementations with identical class names resolve to distinct instances", () => {
    interface IService {
      id(): string;
    }

    const ServiceAbstraction = new Abstraction<IService>("Service");

    // Simulate rspack minification: all classes share the same name "a".
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

    // All three classes have name "a"
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
