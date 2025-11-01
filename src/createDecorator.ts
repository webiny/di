import type { Abstraction } from "./Abstraction.js";
import type { Constructor, Dependency, GetInterface, MapDependencies } from "./types.js";
import { Metadata } from "./Metadata.js";

type DropLast<T> = T extends [...infer P, any] ? [...P] : never;

type GetLast<T> = T extends [...any, infer Last] ? Last : never;

type Implementation<A extends Abstraction<any>, I extends Constructor> =
    GetInterface<A> extends GetLast<ConstructorParameters<I>> ? I : "Wrong decoratee type!";

export function createDecorator<A extends Abstraction<any>, I extends Constructor>(params: {
    abstraction: A;
    decorator: Implementation<A, I>;
    dependencies: MapDependencies<DropLast<ConstructorParameters<I>>>;
}): Implementation<A, I> {
    const metadata = new Metadata(params.decorator as Constructor);
    metadata.setAbstraction(params.abstraction);
    metadata.setDependencies(params.dependencies as unknown as Dependency[]);
    metadata.setAttribute("IS_DECORATOR", true);

    return params.decorator;
}
