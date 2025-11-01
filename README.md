# @webiny/di

**A professional-grade dependency injection container for TypeScript applications built with SOLID principles.**

This is not a toy container for simple dependency wiring. **@webiny/di** is engineered for architects and senior developers who build complex, maintainable systems using Clean Architecture, Domain-Driven Design, and rigorous adherence to SOLID principles.

> ⚠️ **Prerequisites:** This library assumes you understand and practice:
>
> - **Dependency Inversion Principle** - Programming to abstractions, not implementations
> - **Open/Closed Principle** - Extending behavior through decoration, not modification
> - **Interface Segregation** - Focused, cohesive abstractions
>
> If your codebase doesn't use abstractions and follows an anemic domain model, a simpler DI solution may be more appropriate.

## Table of Contents

- [Features](#features)
- [Who Should Use This](#who-should-use-this)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
    - [Abstractions](#abstractions)
    - [Implementations](#implementations)
    - [Dependencies](#dependencies)
- [Lifetime Scopes](#lifetime-scopes)
    - [Transient (Default)](#transient-default)
    - [Singleton](#singleton)
- [Why @webiny/di?](#why-webinydi)
    - [Built for SOLID Principles, Not Just Convenience](#built-for-solid-principles-not-just-convenience)
    - [True Type Safety](#true-type-safety)
    - [First-Class Decorator Pattern](#first-class-decorator-pattern)
- [Comparison with Other Containers](#comparison-with-other-containers)
- [Advanced Features](#advanced-features)
    - [Decorator Pattern](#decorator-pattern)
    - [Multiple Decorators](#multiple-decorators)
    - [Composite Pattern](#composite-pattern)
    - [Dependency Options](#dependency-options)
    - [Hierarchical Containers](#hierarchical-containers)
    - [Instance Registration](#instance-registration)
    - [Factory Registration](#factory-registration)
    - [Resolve All](#resolve-all)
    - [Manual Resolution with Dependencies](#manual-resolution-with-dependencies)
- [Type Safety](#type-safety)
- [Real-World Example](#real-world-example)
- [Best Practices](#best-practices)
- [Error Handling](#error-handling)
- [Testing](#testing)
    - [Unit Testing with Mocks](#unit-testing-with-mocks)
    - [Integration Testing with Container](#integration-testing-with-container)
    - [Testing with Child Containers](#testing-with-child-containers)
- [Philosophy](#philosophy)
    - [There Are No "Plugins"](#there-are-no-plugins)
    - [DI Containers Are Only Useful with SOLID](#di-containers-are-only-useful-with-solid)
    - [Professional Tools for Professional Developers](#professional-tools-for-professional-developers)
    - [We Choose Compile-Time Safety Over Runtime Flexibility](#we-choose-compile-time-safety-over-runtime-flexibility)
- [Contributing](#contributing)

## Features

- ✨ **True Type Safety**: Unlike other DI containers, type safety is enforced at compile-time. The `Abstraction<T>` class unifies tokens and types, making it impossible to resolve dependencies with incorrect types. No manual generic passing, no runtime surprises.
- 🎯 **First-Class Decorator Pattern**: The only DI container with true abstraction decoration. Implement the Open/Closed Principle without compromise - extend behavior through decoration, not modification.
- 🏛️ **SOLID by Design**: Every feature exists to enable rigorous adherence to SOLID principles. This isn't a general-purpose container - it's a tool for professional architects building maintainable systems.
- 🔗 **Composite Pattern**: Register multiple implementations as composites for elegant handling of collections
- 🏗️ **Hierarchical Containers**: Create child containers with inheritance for scoped lifetimes and feature isolation
- ⚡ **Lifetime Scopes**: Transient and Singleton lifetime management
- 🔍 **Metadata-Based**: Uses reflect-metadata for clean, decorator-free API
- 🎨 **Clean Architecture Ready**: Designed from the ground up for Clean Architecture and Domain-Driven Design

## Installation

```bash
npm install @webiny/di reflect-metadata
```

> **Note**: This package requires `reflect-metadata` to be installed and imported at your application's entry point.

## Who Should Use This

**@webiny/di is for you if:**

- ✅ You build applications using Clean Architecture or Hexagonal Architecture
- ✅ You practice Domain-Driven Design with rich domain models
- ✅ You understand and apply SOLID principles rigorously
- ✅ You need to extend system behavior through composition, not modification
- ✅ You value compile-time safety over runtime flexibility
- ✅ You're building enterprise applications where maintainability is critical

**This library is NOT for you if:**

- ❌ You're looking for a quick way to wire up dependencies in a simple app
- ❌ Your codebase uses concrete classes everywhere (no abstractions)
- ❌ You follow an anemic domain model or transaction script pattern
- ❌ You prefer runtime configuration over compile-time safety
- ❌ You're building a prototype or MVP where architecture doesn't matter yet

## Quick Start

```typescript
import "reflect-metadata";
import { Container, Abstraction, createImplementation } from "@webiny/di";

// 1. Define an abstraction (interface token)
interface IUserRepository {
  getById(id: string): Promise<User>;
}

const UserRepository = new Abstraction<IUserRepository>("UserRepository");

// 2. Create an implementation
class UserRepositoryImpl implements IUserRepository {
  async getById(id: string): Promise<User> {
    // implementation
  }
}

const UserRepositoryImplementation = createImplementation({
  abstraction: UserRepository,
  implementation: UserRepositoryImpl,
  dependencies: []
});

// 3. Register and resolve
const container = new Container();
container.register(UserRepositoryImplementation);

const userRepo = container.resolve(UserRepository);
```

## Core Concepts

### Abstractions

Abstractions are type-safe tokens that represent interfaces or abstract contracts.

```typescript
interface ILogger {
  log(message: string): void;
}

const Logger = new Abstraction<ILogger>("Logger");
```

### Implementations

Use `createImplementation` to bind implementations to abstractions with their dependencies.

```typescript
class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(message);
  }
}

const ConsoleLoggerImpl = createImplementation({
  abstraction: Logger,
  implementation: ConsoleLogger,
  dependencies: []
});
```

### Dependencies

Specify dependencies as an array of abstractions or tuples with options.

```typescript
interface IUserService {
  createUser(name: string): Promise<void>;
}

const UserService = new Abstraction<IUserService>("UserService");

class UserServiceImpl implements IUserService {
  constructor(
    private repository: IUserRepository,
    private logger: ILogger
  ) {}

  async createUser(name: string): Promise<void> {
    this.logger.log(`Creating user: ${name}`);
    // implementation
  }
}

const UserServiceImpl = createImplementation({
  abstraction: UserService,
  implementation: UserServiceImpl,
  dependencies: [UserRepository, Logger]
});
```

## Lifetime Scopes

### Transient (Default)

A new instance is created every time the dependency is resolved.

```typescript
container.register(UserRepositoryImpl);
// or explicitly:
container.register(UserRepositoryImpl); // default is transient
```

### Singleton

A single instance is created and reused for all resolutions.

```typescript
container.register(UserRepositoryImpl).inSingletonScope();
```

## Advanced Features

### Decorator Pattern

Decorators wrap existing implementations to add cross-cutting concerns without modifying the original code.

```typescript
interface IPageRepository {
  getById(id: string): Promise<Page>;
}

const PageRepository = new Abstraction<IPageRepository>("PageRepository");

// Base implementation
class PageRepositoryImpl implements IPageRepository {
  async getById(id: string): Promise<Page> {
    // fetch from API
  }
}

// Caching decorator
class CachedPageRepository implements IPageRepository {
  constructor(
    private cache: ICache,
    private decoratee: IPageRepository // The decorated instance
  ) {}

  async getById(id: string): Promise<Page> {
    const cached = await this.cache.get(id);
    if (cached) return cached;

    const page = await this.decoratee.getById(id);
    await this.cache.set(id, page);
    return page;
  }
}

// Register base implementation
const PageRepositoryImplementation = createImplementation({
  abstraction: PageRepository,
  implementation: PageRepositoryImpl,
  dependencies: []
});

container.register(PageRepositoryImplementation);

// Register decorator
const CachedPageRepositoryDecorator = createDecorator({
  abstraction: PageRepository,
  decorator: CachedPageRepository,
  dependencies: [Cache] // Cache is injected, decoratee is passed automatically
});

container.registerDecorator(CachedPageRepositoryDecorator);
```

**Key Points:**

- Decorators are applied in the order they are registered
- The last constructor parameter of a decorator must be the decorated type
- Dependencies are resolved before the decoratee is passed

### Multiple Decorators

Chain multiple decorators to compose functionality:

```typescript
// 1. Base implementation
container.register(CreatePageUseCaseImpl);

// 2. Add validation
container.registerDecorator(ValidationDecorator);

// 3. Add authorization
container.registerDecorator(AuthorizationDecorator);

// 4. Add metrics
container.registerDecorator(MetricsDecorator);

// Resolution order: MetricsDecorator -> AuthorizationDecorator -> ValidationDecorator -> CreatePageUseCaseImpl
```

### Composite Pattern

Composites collect multiple implementations and expose them as a single implementation.

```typescript
interface IPlugin {
  execute(): void;
}

const Plugin = new Abstraction<IPlugin>("Plugin");

class PluginComposite implements IPlugin {
  constructor(private plugins: IPlugin[]) {}

  execute(): void {
    this.plugins.forEach(plugin => plugin.execute());
  }
}

const PluginCompositeImpl = createComposite({
  abstraction: Plugin,
  implementation: PluginComposite,
  dependencies: [[Plugin, { multiple: true }]]
});

container.registerComposite(PluginCompositeImpl);
```

### Dependency Options

#### Multiple Dependencies

Resolve all implementations of an abstraction as an array:

```typescript
interface IEventHandler {
  handle(event: DomainEvent): Promise<void>;
}

const EventHandler = new Abstraction<IEventHandler>("EventHandler");

class EventPublisher {
  constructor(private handlers: IEventHandler[]) {}

  async publish(event: DomainEvent): Promise<void> {
    for (const handler of this.handlers) {
      await handler.handle(event);
    }
  }
}

const EventPublisherImpl = createImplementation({
  abstraction: EventPublisher,
  implementation: EventPublisher,
  dependencies: [[EventHandler, { multiple: true }]]
});
```

#### Optional Dependencies

Mark dependencies as optional if they may not be registered:

```typescript
class UserService {
  constructor(
    private repository: IUserRepository,
    private logger?: ILogger // Optional
  ) {}

  async createUser(name: string): Promise<void> {
    this.logger?.log(`Creating user: ${name}`);
    // implementation
  }
}

const UserServiceImpl = createImplementation({
  abstraction: UserService,
  implementation: UserService,
  dependencies: [UserRepository, [Logger, { optional: true }]]
});
```

### Hierarchical Containers

Create child containers that inherit registrations from their parent:

```typescript
const parentContainer = new Container();
parentContainer.register(LoggerImpl).inSingletonScope();

const childContainer = parentContainer.createChildContainer();

// Child can resolve parent's registrations
const logger = childContainer.resolve(Logger);

// Child registrations don't affect parent
childContainer.register(UserRepositoryImpl);
```

**Use cases:**

- Scoped lifetimes (e.g., per-request in web applications)
- Feature isolation
- Testing with overridden dependencies

### Instance Registration

Register pre-created instances directly:

```typescript
const configInstance = new Configuration({ apiKey: "secret" });
container.registerInstance(Configuration, configInstance);
```

### Factory Registration

Register a factory function for custom instance creation:

```typescript
container.registerFactory(Logger, () => {
  return new ConsoleLogger(process.env.LOG_LEVEL);
});
```

### Resolve All

Get all registered implementations of an abstraction:

```typescript
// Register multiple implementations
container.register(EmailNotificationHandler);
container.register(SmsNotificationHandler);
container.register(PushNotificationHandler);

// Resolve all
const handlers = container.resolveAll(NotificationHandler);
// Returns: [EmailNotificationHandler, SmsNotificationHandler, PushNotificationHandler]
```

### Manual Resolution with Dependencies

Manually create instances with resolved dependencies:

```typescript
const instance = container.resolveWithDependencies({
  implementation: MyClass,
  dependencies: [Logger, UserRepository]
});
```

## Type Safety

The container provides **enforced** type safety through the `Abstraction<T>` class. Unlike other DI containers where tokens and types are separate, here they are unified:

```typescript
// The abstraction IS the token AND carries the type
const Logger = new Abstraction<ILogger>("Logger");

// ✅ Type is automatically inferred from the abstraction
const logger = container.resolve(Logger); // Type: ILogger (no manual generic needed!)

// ✅ Dependencies are type-checked against constructor parameters
const UserServiceImpl = createImplementation({
  abstraction: UserService,
  implementation: UserServiceImpl,
  dependencies: [
    UserRepository, // Type-checked: must be IUserRepository
    Logger // Type-checked: must be ILogger
  ]
});

// ❌ TypeScript error: wrong type
const wrong: ISomeOtherType = container.resolve(Logger);
// Error: Type 'ILogger' is not assignable to type 'ISomeOtherType'
```

This approach eliminates entire classes of bugs that exist in other DI containers where you can accidentally resolve the wrong type.

## Real-World Example

Here's a complete example of a feature using clean architecture principles:

```typescript
import "reflect-metadata";
import { Container, Abstraction, createImplementation, createDecorator } from "@webiny/di";

// Domain Layer
interface User {
  id: string;
  name: string;
  email: string;
}

// Application Layer - Repository Interface
interface IUserRepository {
  getById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

const UserRepository = new Abstraction<IUserRepository>("UserRepository");

// Application Layer - Use Case
interface IGetUserUseCase {
  execute(id: string): Promise<User | null>;
}

const GetUserUseCase = new Abstraction<IGetUserUseCase>("GetUserUseCase");

class GetUserUseCaseImpl implements IGetUserUseCase {
  constructor(private repository: IUserRepository) {}

  async execute(id: string): Promise<User | null> {
    return this.repository.getById(id);
  }
}

// Infrastructure Layer - Repository Implementation
interface IUserGateway {
  fetchUser(id: string): Promise<User | null>;
}

const UserGateway = new Abstraction<IUserGateway>("UserGateway");

class UserRepositoryImpl implements IUserRepository {
  constructor(private gateway: IUserGateway) {}

  async getById(id: string): Promise<User | null> {
    return this.gateway.fetchUser(id);
  }

  async save(user: User): Promise<void> {
    // implementation
  }
}

class UserGraphQLGateway implements IUserGateway {
  async fetchUser(id: string): Promise<User | null> {
    // GraphQL query
    return { id, name: "John", email: "john@example.com" };
  }
}

// Cross-cutting Concerns - Logging Decorator
interface ILogger {
  log(message: string): void;
}

const Logger = new Abstraction<ILogger>("Logger");

class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(`[LOG] ${message}`);
  }
}

class LoggingGetUserDecorator implements IGetUserUseCase {
  constructor(
    private logger: ILogger,
    private decoratee: IGetUserUseCase
  ) {}

  async execute(id: string): Promise<User | null> {
    this.logger.log(`Fetching user: ${id}`);
    const user = await this.decoratee.execute(id);
    this.logger.log(`User fetched: ${user?.name || "not found"}`);
    return user;
  }
}

// DI Setup
const container = new Container();

// Register infrastructure
container.register(
  createImplementation({
    abstraction: UserGateway,
    implementation: UserGraphQLGateway,
    dependencies: []
  })
);

container
  .register(
    createImplementation({
      abstraction: UserRepository,
      implementation: UserRepositoryImpl,
      dependencies: [UserGateway]
    })
  )
  .inSingletonScope();

// Register use case
container.register(
  createImplementation({
    abstraction: GetUserUseCase,
    implementation: GetUserUseCaseImpl,
    dependencies: [UserRepository]
  })
);

// Register logger
container
  .register(
    createImplementation({
      abstraction: Logger,
      implementation: ConsoleLogger,
      dependencies: []
    })
  )
  .inSingletonScope();

// Add logging decorator
container.registerDecorator(
  createDecorator({
    abstraction: GetUserUseCase,
    decorator: LoggingGetUserDecorator,
    dependencies: [Logger]
  })
);

// Usage
const useCase = container.resolve(GetUserUseCase);
const user = await useCase.execute("123");
```

## Best Practices

### 1. Define Abstractions at Module Boundaries

```typescript
// features/users/abstractions.ts
export interface IUserRepository {
  /* ... */
}
export const UserRepository = new Abstraction<IUserRepository>("UserRepository");

export interface IGetUserUseCase {
  /* ... */
}
export const GetUserUseCase = new Abstraction<IGetUserUseCase>("GetUserUseCase");
```

### 2. Use Namespaces for Convenience

```typescript
export const UserRepository = new Abstraction<IUserRepository>("UserRepository");

export namespace UserRepository {
  export type Interface = IUserRepository;
}

// Usage
function example(repo: UserRepository.Interface) {
  // ...
}
```

### 3. Register in Feature Modules

```typescript
// features/users/feature.ts
export function registerUserFeature(container: Container) {
  container.register(UserGatewayImpl);
  container.register(UserRepositoryImpl).inSingletonScope();
  container.register(GetUserUseCaseImpl);
}
```

### 4. Use Singletons for Stateful Services

```typescript
// Stateful services should be singletons
container.register(CacheImpl).inSingletonScope();
container.register(DatabaseConnectionImpl).inSingletonScope();

// Stateless services can be transient
container.register(GetUserUseCaseImpl); // transient by default
```

### 5. Prefer Constructor Injection

```typescript
// ✅ Good: Constructor injection
class UserService {
  constructor(private repository: IUserRepository) {}
}

// ❌ Avoid: Property injection or service locator pattern
class UserService {
  repository?: IUserRepository;

  setRepository(repo: IUserRepository) {
    this.repository = repo;
  }
}
```

## Error Handling

The container provides clear error messages:

```typescript
// Circular dependency detection
try {
  container.resolve(ServiceA);
} catch (error) {
  // Error: Circular dependency detected for ServiceA
}

// Missing registration
try {
  container.resolve(UnregisteredService);
} catch (error) {
  // Error: No registration found for UnregisteredService
}

// Missing abstraction metadata
try {
  container.register(ImplementationWithoutMetadata);
} catch (error) {
  // Error: No abstraction metadata found for ImplementationWithoutMetadata
}
```

## Testing

### Unit Testing with Mocks

```typescript
import { describe, it, expect, vi } from "vitest";

describe("GetUserUseCase", () => {
  it("should fetch user by id", async () => {
    const mockRepository: IUserRepository = {
      getById: vi.fn().mockResolvedValue({ id: "1", name: "John" }),
      save: vi.fn()
    };

    const useCase = new GetUserUseCaseImpl(mockRepository);
    const user = await useCase.execute("1");

    expect(user?.name).toBe("John");
    expect(mockRepository.getById).toHaveBeenCalledWith("1");
  });
});
```

### Integration Testing with Container

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("User Feature Integration", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    registerUserFeature(container);
  });

  it("should wire up all dependencies correctly", () => {
    const useCase = container.resolve(GetUserUseCase);
    expect(useCase).toBeDefined();
  });

  it("should execute use case with real dependencies", async () => {
    const useCase = container.resolve(GetUserUseCase);
    const user = await useCase.execute("123");
    expect(user).toBeDefined();
  });
});
```

### Testing with Child Containers

```typescript
describe("User Feature with Overrides", () => {
  it("should use mock repository in tests", async () => {
    const parentContainer = new Container();
    registerUserFeature(parentContainer);

    const testContainer = parentContainer.createChildContainer();

    // Override repository with mock
    const mockRepo = new MockUserRepository();
    testContainer.registerInstance(UserRepository, mockRepo);

    const useCase = testContainer.resolve(GetUserUseCase);
    const user = await useCase.execute("123");

    expect(mockRepo.getByIdCalled).toBe(true);
  });
});
```

## Performance Considerations

- **Singleton Scope**: Use for expensive-to-create objects (database connections, caches)
- **Transient Scope**: Use for lightweight, stateless services
- **Resolution Caching**: Singleton instances are cached automatically
- **Decorator Overhead**: Minimal, but avoid excessive decorator chains (>10)

## Why @webiny/di?

### Built for SOLID Principles, Not Just Convenience

Most DI containers are designed to make dependency wiring convenient. **@webiny/di** goes further - it's engineered to make SOLID principles not just possible, but natural and frictionless.

**The truth about DI containers:** They provide architectural value _only_ when used with SOLID principles. Without abstractions (Dependency Inversion Principle) and without the need to extend behavior (Open/Closed Principle), a DI container is just glorified object instantiation.

**@webiny/di** doesn't pretend otherwise. This library is for professionals building:

- Clean Architecture applications with clear layer boundaries
- Domain-Driven Design systems with rich domain models
- Extensible platforms where behavior is composed, not hardcoded
- Enterprise applications where maintainability matters more than quick hacks

### True Type Safety

Most DI containers claim to be "type-safe," but they rely on manual generic parameters that can be incorrect. In these libraries, the token (string/symbol) and the type (generic parameter) are separate, allowing for mismatches:

```typescript
// ❌ Other libraries - token and type are separate
const TYPES = { UserRepository: Symbol.for("UserRepository") };
container.bind<IUserRepository>(TYPES.UserRepository).to(UserRepositoryImpl);

// ❌ You can resolve with the WRONG type - compiles fine, fails at runtime!
const repo = container.get<IProductRepository>(TYPES.UserRepository);
// TypeScript can't catch this mistake because token and type are disconnected
```

**@webiny/di** solves this by unifying tokens and types in the `Abstraction<T>` class:

```typescript
// ✅ Token and type are unified - impossible to mess up
const UserRepository = new Abstraction<IUserRepository>("UserRepository");

// ✅ Type is automatically enforced
const repo = container.resolve(UserRepository); // Always returns IUserRepository

// ✅ Wrong type assignment caught at compile-time
const wrong: IProductRepository = container.resolve(UserRepository);
// TypeScript error: Type 'IUserRepository' is not assignable to type 'IProductRepository'
```

**Key benefits:**

- No manual generic passing - types are automatic
- Compile-time verification of all dependencies
- Impossible to resolve with incorrect types
- Refactoring-safe - rename interfaces and all usages update

### First-Class Decorator Pattern

**@webiny/di** is the only DI container that implements true decoration of abstractions, making the Open/Closed Principle practical and natural.

> **"Software entities should be open for extension, but closed for modification."** - Bertrand Meyer

This library makes it the default way of working. Decorators are registered on the **abstraction**, not on concrete implementations:

```typescript
// ✅ Register base implementation - closed for modification
container.register(PageRepositoryImpl);

// ✅ Extend through decoration - open for extension
container.registerDecorator(CachingDecorator);
container.registerDecorator(LoggingDecorator);
container.registerDecorator(MetricsDecorator);

// ✅ All decorators automatically applied in order
const repo = container.resolve(PageRepository);
// Returns: MetricsDecorator -> LoggingDecorator -> CachingDecorator -> PageRepositoryImpl
```

**This is the Open/Closed Principle in practice:**

- Base implementation is **closed for modification** - it never changes
- Behavior is **open for extension** - add decorators without touching core code
- Decorators are registered separately from implementations
- Third-party code can extend behavior by simply registering decorators

#### Real-World Example: Extensible Systems

```typescript
// Core application - defines abstractions and base implementations
container.register(CreatePageUseCaseImpl);

// ✅ Team member adds validation - extends via decoration
container.registerDecorator(ValidationDecorator);

// ✅ Team member adds authorization - extends via decoration
container.registerDecorator(AuthorizationDecorator);

// ✅ DevOps adds metrics - extends via decoration
container.registerDecorator(MetricsDecorator);

// ✅ Customer adds custom business rules - extends via decoration
container.registerDecorator(CustomBusinessRulesDecorator);

// All decorators automatically compose!
const useCase = container.resolve(CreatePageUseCase);
// Execution flow:
// CustomBusinessRulesDecorator
//   -> MetricsDecorator
//     -> AuthorizationDecorator
//       -> ValidationDecorator
//         -> CreatePageUseCaseImpl

// Original CreatePageUseCaseImpl was NEVER modified - Open/Closed Principle achieved.
```

**This pattern is fundamental to:**

- **Clean Architecture** - Use cases decorated with cross-cutting concerns
- **Domain-Driven Design** - Domain services enhanced with infrastructure concerns
- **Hexagonal Architecture** - Ports decorated with adapters
- **CQRS** - Command handlers decorated with validation, authorization, auditing

Only **@webiny/di** makes this pattern first-class. In other containers, you're fighting the framework. Here, you're working with it.

## Comparison with Other Containers

**@webiny/di** isn't trying to be a general-purpose DI container. It's optimized for one thing: **making SOLID principles practical in TypeScript applications.**

Here's how it compares to other popular containers:

| Feature               | @webiny/di                                  | InversifyJS              | TSyringe                 |
| --------------------- | ------------------------------------------- | ------------------------ | ------------------------ |
| **Type Safety**       | ✅ **Enforced** (Token = Type)              | ⚠️ Manual (Token ≠ Type) | ⚠️ Manual (Token ≠ Type) |
| Wrong Type Resolution | ✅ **Compile error**                        | ❌ Runtime error         | ❌ Runtime error         |
| **Decorator Pattern** | ✅ **First-class** (abstraction decoration) | ❌ Manual chaining only  | ❌ Manual chaining only  |
| Open/Closed Principle | ✅ **Native support**                       | ⚠️ Manual implementation | ⚠️ Manual implementation |
| Composites            | ✅ Built-in                                 | ❌ No                    | ❌ No                    |
| Child Containers      | ✅ Yes                                      | ✅ Yes                   | ✅ Yes                   |
| Metadata              | ✅ reflect-metadata                         | ✅ reflect-metadata      | ✅ reflect-metadata      |
| Target Audience       | Professional architects                     | General purpose          | General purpose          |
| Learning Curve        | Low (if you know SOLID)                     | Medium                   | Low                      |

**Bottom line:** If you're building with SOLID principles, **@webiny/di** removes friction. If you're not, other containers might be more flexible for your use case.

## Philosophy

**@webiny/di** is opinionated by design. It embodies a specific philosophy about software architecture:

### There Are No "Plugins"

What people call "plugins" are simply:

- **Implementations** of abstractions defined by the core system
- **Decorations** of abstractions to extend behavior
- **Composites** that collect multiple implementations

### DI Containers Are Only Truly Useful with SOLID

A DI container without SOLID principles is like:

- A type system without types
- A database without queries
- A compiler without syntax checking

You can use it, but you're missing the entire point.

### Professional Tools for Professional Developers

This library doesn't try to be everything to everyone. It's a professional tool for developers who:

- Understand that **architecture matters**!
- Know that **maintainability** is more valuable than initial simplicity
- Accept that **good design** requires discipline and expertise

If you're building a throwaway prototype, use something simpler. If you're building a system that will live for years and be maintained by multiple teams, **@webiny/di** will pay dividends.

### We Choose Compile-Time Safety Over Runtime Flexibility

Some DI containers let you do anything at runtime. This library intentionally restricts you to compile-time verified operations.

**Why?** Because runtime errors in production are expensive. Compile-time errors are free.

We'd rather you hit a TypeScript error during development than a runtime error at 3 AM.


## Contributing

- 💬 Slack: [Join our community](https://webiny.com/slack)
- 🐛 Issues: [GitHub Issues](https://github.com/webiny/di/issues)
