import { Metadata } from "./Metadata.js";
import type { Constructor } from "./types.js";

export const isDecorator = (implementation: Constructor) => {
    const metadata = new Metadata(implementation);
    return Boolean(metadata.getAttribute("IS_DECORATOR"));
};
