import type { Constructor, Dependencies, GetInterface, MapDependencies } from "./types.js";
import { Metadata } from "./Metadata.js";

type DropLast<T> = T extends [...infer P, any] ? [...P] : never;

type Implementation<A extends Abstraction<any>, I extends Constructor> = I & {
  __abstraction: A;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class Abstraction<T> {
  /**
   * If the generic type is not used in any way, TS simply ignores it, thus breaking the desired type checking.
   * We must set this to `protected` to prevent TSC from stripping the type away.
   * @internal
   */
  protected readonly __type!: T;

  public readonly token: symbol;

  constructor(name: string) {
    this.token = Symbol(name);
  }

  toString(): string {
    return this.token.description || this.token.toString();
  }

  createImplementation<I extends Constructor<GetInterface<this>>>(params: {
    implementation: I;
    dependencies: Dependencies<I>;
  }): Implementation<this, I> {
    const metadata = new Metadata(params.implementation);
    metadata.setAbstraction(this);
    metadata.setDependencies(params.dependencies);

    return params.implementation as Implementation<this, I>;
  }

  createDecorator<I extends Constructor>(params: {
    decorator: I;
    dependencies: MapDependencies<DropLast<ConstructorParameters<I>>>;
  }): Implementation<this, I> {
    const metadata = new Metadata(params.decorator);
    metadata.setAbstraction(this);
    metadata.setDependencies(params.dependencies as any);
    metadata.setAttribute("IS_DECORATOR", true);

    return params.decorator as Implementation<this, I>;
  }

  createComposite<I extends Constructor<GetInterface<this>>>(params: {
    implementation: I;
    dependencies: Dependencies<I>;
  }): Implementation<this, I> {
    const metadata = new Metadata(params.implementation);
    metadata.setAbstraction(this);
    metadata.setDependencies(params.dependencies);
    metadata.setAttribute("IS_COMPOSITE", true);

    return params.implementation as Implementation<this, I>;
  }
}
