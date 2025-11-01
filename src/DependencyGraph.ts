// @ts-nocheck This file is work-in-progress.
import { Graph } from "graphlib";
import type { Container } from "./Container.js";
import { Metadata } from "./Metadata.js";
import type { Implementation } from "./types.js";

export class DependencyGraph {
    private container: Container;
    private readonly graph: Graph;

    constructor(container: Container) {
        this.container = container;
        this.graph = new Graph({ directed: true });
    }

    buildGraph(rootImplementation: Implementation<any>): Graph {
        const metadata = new Metadata(rootImplementation);
        const rootAbstraction = metadata.getAbstraction();

        if (!rootAbstraction) {
            throw new Error("Root implementation is missing an abstraction.");
        }

        const rootNodeId = this.getNodeId(rootImplementation);
        this.graph.setNode(rootNodeId);

        // Start recursive dependency traversal
        this.addDependencies(rootNodeId, rootImplementation);

        return this.graph;
    }

    private addDependencies(parentNodeId: string, implementation: Implementation<any>) {
        const metadata = new Metadata(implementation);
        const dependencies = metadata.getDependencies() || [];

        dependencies.forEach(dep => {
            const [depAbstraction] = Array.isArray(dep) ? dep : [dep];
            // @ts-expect-error TODO: fix token access
            const depEntries = this.container["implementations"].get(depAbstraction.token) || [];

            depEntries.forEach(depEntry => {
                const depNodeId = this.getNodeId(depEntry.impl);
                this.graph.setNode(depNodeId);
                this.graph.setEdge(parentNodeId, depNodeId);

                // Recurse to add further dependencies
                this.addDependencies(depNodeId, depEntry.impl);
            });
        });
    }

    private getNodeId(implementation: Implementation<any>): string {
        // Simplify node ID to only the implementation name
        return implementation.name || "Unknown Implementation";
    }
}
