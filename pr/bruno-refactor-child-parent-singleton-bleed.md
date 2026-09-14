## Issue

A singleton registered in a parent container is cached in the parent but built from the view of whichever container resolves it first. If a child resolves it first, the child's registrations (`{ multiple: true }` entries, overridden dependencies) end up in the parent's cached instance and every other container gets them.

Root cause in `resolveRegistration`: cache in `this.instances`, dependencies from `resolveFrom`. Two related gaps: decorators registered in a child never apply to a parent-owned service the child resolves, and there is no scope for "one instance shared by the whole hierarchy" once singletons stop leaking.

Pinned by 22 failing tests. Implementation not started.

## Possible solutions

Pick one context container per resolution and use it for cache, dependencies and decorators. Two ways to name the result:

**A. Redefine `Singleton`, add `Global`** (current spec). `inSingletonScope()` becomes one instance per resolving container; `inGlobalScope()` is one instance per registration, built and cached in the owner. Isolation by default. Breaks `child.resolve(X) === parent.resolve(X)`; major release.

**B. Keep `Singleton`, add `ContainerScoped`.** `inSingletonScope()` keeps shared identity but is built from the owner's view, which alone removes the bleed. New `inContainerScope()` gives the per-container instance. Matches tsyringe, Autofac and Microsoft DI naming. Patch for the fix, minor for the new scope.

Same `resolveRegistration` change either way; only the meaning of the existing keyword differs. Decision pending.

## Docs

- Design: `docs/2026-05-26-per-container-singleton-scoping-design.md` (revision 2, open items at the end)
- Prior art: `docs/2026-09-14-scoping-prior-art.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
