import { test } from "vitest";
import {
  Dep1,
  Dep2,
  Dep3,
  Dep4,
  Dep5,
  Dep6,
  Dep7,
  Dep8,
  ServiceAbstraction
} from "./abstractions.js";
import { EightDepsService } from "./implementations.js";

test("MapDependencies resolves 8 constructor parameters", () => {
  ServiceAbstraction.createImplementation({
    implementation: EightDepsService,
    dependencies: [Dep1, Dep2, Dep3, Dep4, Dep5, Dep6, Dep7, Dep8]
  });
});
