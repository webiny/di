// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class Abstraction<T> {
    public readonly token: symbol;

    constructor(name: string) {
        this.token = Symbol.for(name);
    }

    toString(): string {
        return this.token.description || this.token.toString();
    }
}
