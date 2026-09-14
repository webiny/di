import { describe, test, expect, beforeEach } from "vitest";
import { Container } from "../../src/index.js";
import { PluginAbstraction, PluginRegistryAbstraction } from "./abstractions.js";
import {
  AuthPlugin,
  AuthPluginImpl,
  CachePlugin,
  CachePluginImpl,
  LoggingPlugin,
  LoggingPluginImpl,
  MetricsPlugin,
  MetricsPluginImpl,
  ValidationPluginImpl,
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

  test("child-only plugin registration must not pollute the parent singleton registry", () => {
    const child = container.createChildContainer();
    child.register(MetricsPluginImpl);

    const registryFromChild = child.resolve(PluginRegistryAbstraction);
    const childPlugins = registryFromChild.getAll();
    expect(childPlugins).toHaveLength(4);
    expect(childPlugins.some(p => p instanceof MetricsPlugin)).toBe(true);

    const registryFromParent = container.resolve(PluginRegistryAbstraction);
    const parentPlugins = registryFromParent.getAll();
    expect(parentPlugins).toHaveLength(3);
    expect(parentPlugins.some(p => p instanceof MetricsPlugin)).toBe(false);
  });

  test("parent registration after child resolution must not bleed into child's cached singleton", () => {
    const child = container.createChildContainer();
    child.register(MetricsPluginImpl);

    const registryFromChild = child.resolve(PluginRegistryAbstraction);
    expect(registryFromChild.getAll()).toHaveLength(4);

    const registryFromParent = container.resolve(PluginRegistryAbstraction);
    expect(registryFromParent.getAll()).toHaveLength(3);

    container.register(ValidationPluginImpl);

    const registryFromChildAgain = child.resolve(PluginRegistryAbstraction);
    expect(registryFromChildAgain.getAll()).toHaveLength(4);
  });
});
