import type { Abstraction } from "./Abstraction.js";
import type { Constructor, Dependency } from "./types.js";

export const KEYS = {
    ABSTRACTION: "wby:abstraction",
    DEPENDENCIES: "wby:dependencies",
    IS_DECORATOR: "wby:isDecorator",
    IS_COMPOSITE: "wby:isComposite"
};

export class Metadata<T extends Constructor> {
    private readonly target: T;

    constructor(target: T) {
        this.target = target;
    }

    getAbstraction(): Abstraction<unknown> {
        return Reflect.getMetadata(KEYS.ABSTRACTION, this.target);
    }

    getDependencies(): Dependency[] {
        return Reflect.getMetadata(KEYS.DEPENDENCIES, this.target);
    }

    getAttribute(key: keyof typeof KEYS) {
        return Reflect.getMetadata(KEYS[key], this.target);
    }

    setAbstraction(abstraction: Abstraction<unknown>) {
        Reflect.defineMetadata(KEYS.ABSTRACTION, abstraction, this.target);
    }

    setDependencies(dependencies: Dependency[]) {
        Reflect.defineMetadata(KEYS.DEPENDENCIES, dependencies, this.target);
    }

    setAttribute(key: keyof typeof KEYS, value: unknown) {
        Reflect.defineMetadata(KEYS[key], value, this.target);
    }
}
