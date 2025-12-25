import type { Constructor, Dependencies } from "./types.js";
import { Metadata } from "./Metadata.js";

export function createDependency<I extends Constructor>(params: {
  implementation: I;
  dependencies: Dependencies<I>;
}): I {
  const metadata = new Metadata(params.implementation);
  metadata.setDependencies(params.dependencies);
  metadata.setAttribute("IS_DEPENDENCY", true);

  return params.implementation;
}
