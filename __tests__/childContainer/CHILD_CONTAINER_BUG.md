# Child Container Cross-Resolution Bug

## Summary

When a child container resolves an abstraction that is only registered in the parent, the parent
resolves all nested dependencies using its own registrations. Child container overrides are never
consulted for those nested dependencies.

## Setup

```
Parent container:
  NotificationService  ->  NotificationServiceImpl(Logger, EmailClient, TemplateEngine, AuditTrail)
  Logger               ->  NullLogger
  EmailClient          ->  NullEmailClient
  TemplateEngine       ->  NullTemplateEngine
  AuditTrail           ->  NullAuditTrail

Child container (overrides):
  Logger               ->  ConsoleLogger
  EmailClient          ->  SmtpEmailClient
```

## Expected Behavior

```
child.resolve(NotificationService)
  1. Child has no NotificationService registration -> ask parent
  2. Parent finds NotificationServiceImpl, begins resolving its dependencies
  3. For each dependency, resolution starts from the CHILD (the originator):
     - Logger        -> child has ConsoleLogger       -> use it
     - EmailClient   -> child has SmtpEmailClient      -> use it
     - TemplateEngine -> child has nothing -> parent has NullTemplateEngine -> use it
     - AuditTrail    -> child has nothing -> parent has NullAuditTrail     -> use it
```

## Actual Behavior

```
child.resolve(NotificationService)
  1. Child has no NotificationService registration -> ask parent
  2. Parent finds NotificationServiceImpl, begins resolving its dependencies
  3. For each dependency, resolution happens from the PARENT (this = parent):
     - Logger        -> NullLogger       (child override ignored)
     - EmailClient   -> NullEmailClient  (child override ignored)
     - TemplateEngine -> NullTemplateEngine
     - AuditTrail    -> NullAuditTrail
```

## Root Cause

`Container.ts`, lines 153-154:

```typescript
if (this.parent) {
  return this.parent.resolveInternal(abstraction, resolutionStack, options);
}
```

Once control moves to the parent, all subsequent `this.resolveInternal(...)` calls inside
`resolveRegistration` and `applyDecorators` refer to the parent container. The child that
initiated the resolution is forgotten.

The same problem exists in `resolveMultiple` (line 249), `tryResolveFromCurrentContainer`
(composite branch, line 183), and `applyDecorators` (line 289) — every path that calls
`this.resolveInternal` for nested dependencies loses the originating container context.

## Fix

Pass a `resolveFrom` container through the entire resolution chain. This container always points
back to the child that started the resolution. When any container resolves nested dependencies, it
calls `resolveFrom.resolveInternal(...)` instead of `this.resolveInternal(...)`.

```
resolveInternal(abstraction, stack, options, resolveFrom = this)
```

The `resolveFrom` parameter is set once at the public `resolve()` entry point and threaded
through every private method unchanged. The parent uses `this` only to look up its own
registrations — never to recurse into dependencies.

## Affected Test Cases

| Test                                                       | Status | Why                                                      |
| ---------------------------------------------------------- | ------ | -------------------------------------------------------- |
| parent resolves all null implementations                   | PASS   | No child involved                                        |
| child overrides no deps                                    | PASS   | No overrides, parent deps are correct by default         |
| child overrides some deps                                  | FAIL   | Child's ConsoleLogger and SmtpEmailClient ignored        |
| child overrides all deps                                   | FAIL   | All child overrides ignored                              |
| grandchild inherits overrides through the chain            | FAIL   | Neither child nor grandchild overrides consulted         |
| child override does not affect parent resolution           | FAIL   | Child resolution half is broken (parent half is correct) |
| notify output reflects which implementations were resolved | FAIL   | Output contains Null\* names instead of real ones        |

## Known Follow-Up: Singleton Scope with Child Overrides

The `resolveFrom` fix correctly resolves transient dependencies from the originating child
container. However, it introduces a subtle edge case with singletons registered in the parent.

When a parent-registered singleton is first resolved through a child, the singleton instance is
constructed using that child's dependency overrides and then cached in the parent. Any subsequent
resolution of the same singleton — from a different child, or from the parent itself — returns the
cached instance, which was built with the first child's dependencies.

```
Parent:
  ServiceA (singleton) -> ServiceAImpl(Logger)
  Logger               -> NullLogger

Child1:
  Logger -> ConsoleLogger

Child2:
  Logger -> FileLogger

child1.resolve(ServiceA)  -> ServiceAImpl gets ConsoleLogger, cached in parent
child2.resolve(ServiceA)  -> returns the SAME cached instance (with ConsoleLogger, not FileLogger)
parent.resolve(ServiceA)  -> returns the SAME cached instance (with ConsoleLogger, not NullLogger)
```

This is not addressed by the current fix and should be tackled separately. Possible solutions:

1. **Per-child singleton caches** — each child maintains its own singleton cache for
   parent-registered singletons, keyed by the originating container.
2. **Prohibit singleton + child override** — throw an error if a child attempts to override a
   dependency of a parent-registered singleton.
3. **Document as expected** — singletons are shared by design; if you need per-child instances,
   use transient scope or register the service in the child directly.
