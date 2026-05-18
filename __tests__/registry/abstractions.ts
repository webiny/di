import { Abstraction } from "../../src/index.js";

export interface IPlugin {
  name: string;
  execute(): string;
}

export interface IPluginRegistry {
  getAll(): IPlugin[];
  executeAll(): string[];
}

export const PluginAbstraction = new Abstraction<IPlugin>("Plugin");
export const PluginRegistryAbstraction = new Abstraction<IPluginRegistry>("PluginRegistry");
