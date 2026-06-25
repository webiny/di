import { describe, test, expect } from "vitest";
import { Container, Abstraction } from "../src/index.js";

const ContainerToken = new Abstraction<Container>("Container");

function createContainer(): Container {
  const container = new Container();
  container.registerInstance(ContainerToken, container);
  return container;
}

describe("ContainerToken self-registration", () => {
  test("child container resolves parent container instead of itself", () => {
    const parent = createContainer();
    const child = parent.createChildContainer();

    const resolved = child.resolve(ContainerToken);

    // BUG: child inherits the parent's instance registration, so it gets the
    // parent container back — not the child it was resolved from.
    expect(resolved).toBe(parent);
    expect(resolved).not.toBe(child);
  });

  test("grandchild container also resolves the root container", () => {
    const root = createContainer();
    const child = root.createChildContainer();
    const grandchild = child.createChildContainer();

    const resolved = grandchild.resolve(ContainerToken);

    expect(resolved).toBe(root);
    expect(resolved).not.toBe(child);
    expect(resolved).not.toBe(grandchild);
  });

  test("child self-registration does not bleed into parent", () => {
    const parent = createContainer();
    const child = parent.createChildContainer();
    child.registerInstance(ContainerToken, child);

    const resolvedFromChild = child.resolve(ContainerToken);
    const resolvedFromParent = parent.resolve(ContainerToken);

    expect(resolvedFromChild).toBe(child);
    expect(resolvedFromParent).toBe(parent);
  });

  test("sibling self-registrations do not bleed into each other or parent", () => {
    const parent = createContainer();
    const child1 = parent.createChildContainer();
    const child2 = parent.createChildContainer();
    child1.registerInstance(ContainerToken, child1);
    child2.registerInstance(ContainerToken, child2);

    expect(child1.resolve(ContainerToken)).toBe(child1);
    expect(child2.resolve(ContainerToken)).toBe(child2);
    expect(parent.resolve(ContainerToken)).toBe(parent);
  });

  test("grandchild self-registration does not bleed into child or parent", () => {
    const root = createContainer();
    const child = root.createChildContainer();
    child.registerInstance(ContainerToken, child);
    const grandchild = child.createChildContainer();
    grandchild.registerInstance(ContainerToken, grandchild);

    expect(grandchild.resolve(ContainerToken)).toBe(grandchild);
    expect(child.resolve(ContainerToken)).toBe(child);
    expect(root.resolve(ContainerToken)).toBe(root);
  });
});
