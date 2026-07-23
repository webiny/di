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
  Dep9,
  ServiceAbstraction
} from "./abstractions.js";
import { NineDepsService } from "./implementations.js";

test("MapDependencies resolves 9 constructor parameters", () => {
  ServiceAbstraction.createImplementation({
    implementation: NineDepsService,
    dependencies: [Dep1, Dep2, Dep3, Dep4, Dep5, Dep6, Dep7, Dep8, Dep9]
  });
});
