import { describe, test } from "vitest";
import { Abstraction } from "~/index.js";

interface ILogger {
  log(...args: unknown[]): void;
}

interface IFormatter {
  format(message: string): string;
}

const LoggerAbstraction = new Abstraction<ILogger>("LoggerAbstraction");
const FormatterAbstraction = new Abstraction<IFormatter>("FormatterAbstraction");

describe("Container Types", () => {
  test("dependencies types must be enforced", () => {
    interface IUseCase {}

    const UseCaseAbstraction = new Abstraction<IUseCase>("UseCase");

    class UseCase {
      constructor(
        private logger: ILogger,
        private formatter: IFormatter
      ) {}
    }

    // Correct assignment!!
    UseCaseAbstraction.createImplementation({
      implementation: UseCase,
      dependencies: [LoggerAbstraction, FormatterAbstraction]
    });

    // Invalid assignment!!
    UseCaseAbstraction.createImplementation({
      implementation: UseCase,
      // @ts-expect-error is not assignable to type
      dependencies: [LoggerAbstraction]
    });

    // Invalid assignment!!
    UseCaseAbstraction.createImplementation({
      implementation: UseCase,
      // @ts-expect-error is not assignable to type
      dependencies: [LoggerAbstraction, LoggerAbstraction]
    });
  });
});
