import { Container, Abstraction, createImplementation } from "../../src/index";

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

const container = new Container();
container.register(AuthPluginImpl).inSingletonScope();
container.register(CachePluginImpl).inSingletonScope();
container.register(LoggingPluginImpl).inSingletonScope();
container.register(PluginRegistryImpl).inSingletonScope();

const registry = container.resolve(PluginRegistryAbstraction);
const plugins = registry.getAll();
const results = registry.executeAll();

const output = {
  pluginCount: plugins.length,
  names: plugins.map(p => p.name),
  results,
  distinctInstances: new Set(plugins.map(p => p.constructor)).size
};

process.stdout.write(JSON.stringify(output));
