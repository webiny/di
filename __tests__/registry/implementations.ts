import { createImplementation } from "../../src/index.js";
import {
  PluginAbstraction,
  PluginRegistryAbstraction,
  type IPlugin,
  type IPluginRegistry
} from "./abstractions.js";

export class AuthPlugin implements IPlugin {
  name = "auth";

  execute(): string {
    return "auth:executed";
  }
}

export class CachePlugin implements IPlugin {
  name = "cache";

  execute(): string {
    return "cache:executed";
  }
}

export class LoggingPlugin implements IPlugin {
  name = "logging";

  execute(): string {
    return "logging:executed";
  }
}

export class PluginRegistry implements IPluginRegistry {
  constructor(private plugins: IPlugin[]) {}

  getAll(): IPlugin[] {
    return this.plugins;
  }

  executeAll(): string[] {
    return this.plugins.map(p => p.execute());
  }
}

export const AuthPluginImpl = createImplementation({
  abstraction: PluginAbstraction,
  implementation: AuthPlugin,
  dependencies: []
});

export const CachePluginImpl = createImplementation({
  abstraction: PluginAbstraction,
  implementation: CachePlugin,
  dependencies: []
});

export const LoggingPluginImpl = createImplementation({
  abstraction: PluginAbstraction,
  implementation: LoggingPlugin,
  dependencies: []
});

export class MetricsPlugin implements IPlugin {
  name = "metrics";

  execute(): string {
    return "metrics:executed";
  }
}

export const MetricsPluginImpl = createImplementation({
  abstraction: PluginAbstraction,
  implementation: MetricsPlugin,
  dependencies: []
});

export class ValidationPlugin implements IPlugin {
  name = "validation";

  execute(): string {
    return "validation:executed";
  }
}

export const ValidationPluginImpl = createImplementation({
  abstraction: PluginAbstraction,
  implementation: ValidationPlugin,
  dependencies: []
});

export const PluginRegistryImpl = createImplementation({
  abstraction: PluginRegistryAbstraction,
  implementation: PluginRegistry,
  dependencies: [[PluginAbstraction, { multiple: true }]]
});
