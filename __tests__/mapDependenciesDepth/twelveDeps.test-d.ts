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
  Dep10,
  Dep11,
  Dep12,
  ServiceAbstraction
} from "./abstractions.js";
import { TwelveDepsService } from "./implementations.js";

test("MapDependencies resolves 12 constructor parameters", () => {
  ServiceAbstraction.createImplementation({
    implementation: TwelveDepsService,
    dependencies: [Dep1, Dep2, Dep3, Dep4, Dep5, Dep6, Dep7, Dep8, Dep9, Dep10, Dep11, Dep12]
  });
});
