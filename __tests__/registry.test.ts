import { describe, test, expect, beforeEach } from "vitest";
import { Container, Abstraction, createImplementation } from "../src/index.js";

interface IPlugin {
  name: string;
  execute(): string;
}

interface IPluginRegistry {
  getAll(): IPlugin[];
  executeAll(): string[];
}

const PluginAbstraction = new Abstraction<IPlugin>("Plugin");
const PluginRegistryAbstraction = new Abstraction<IPluginRegistry>("PluginRegistry");

class AuthPlugin implements IPlugin {
  name = "auth";

  execute(): string {
    return "auth:executed";
  }
}

class CachePlugin implements IPlugin {
  name = "cache";

  execute(): string {
    return "cache:executed";
  }
}

class LoggingPlugin implements IPlugin {
  name = "logging";

  execute(): string {
    return "logging:executed";
  }
}

class PluginRegistry implements IPluginRegistry {
  constructor(private plugins: IPlugin[]) {}

  getAll(): IPlugin[] {
    return this.plugins;
  }

  executeAll(): string[] {
    return this.plugins.map(p => p.execute());
  }
}

const AuthPluginImpl = createImplementation({
  abstraction: PluginAbstraction,
  implementation: AuthPlugin,
  dependencies: []
});

const CachePluginImpl = createImplementation({
  abstraction: PluginAbstraction,
  implementation: CachePlugin,
  dependencies: []
});

const LoggingPluginImpl = createImplementation({
  abstraction: PluginAbstraction,
  implementation: LoggingPlugin,
  dependencies: []
});

const PluginRegistryImpl = createImplementation({
  abstraction: PluginRegistryAbstraction,
  implementation: PluginRegistry,
  dependencies: [[PluginAbstraction, { multiple: true }]]
});

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
    expect(plugins.some(p => p instanceof AuthPlugin)).toBe(true);
    expect(plugins.some(p => p instanceof CachePlugin)).toBe(true);
    expect(plugins.some(p => p instanceof LoggingPlugin)).toBe(true);
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
