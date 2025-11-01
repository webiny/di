import type { Abstraction } from "./Abstraction.js";
import type { Constructor, Dependencies, Implementation, GetInterface } from "./types.js";
import { Metadata } from "./Metadata.js";

export function createImplementation<
    A extends Abstraction<any>,
    I extends Constructor<GetInterface<A>>
>(params: { abstraction: A; implementation: I; dependencies: Dependencies<I> }) {
    const metadata = new Metadata(params.implementation);
    metadata.setAbstraction(params.abstraction);
    metadata.setDependencies(params.dependencies);

    return params.implementation as Implementation<I>;
}
