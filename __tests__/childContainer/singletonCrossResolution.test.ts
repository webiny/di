import { beforeEach, describe, expect, test } from "vitest";
import { Container } from "../../src/index.js";
import { NotificationService } from "./abstractions.js";
import {
  ConsoleLogger,
  ConsoleLoggerImpl,
  NotificationServiceImpl,
  NotificationServiceImplementation,
  NullAuditTrail,
  NullAuditTrailImpl,
  NullEmailClient,
  NullEmailClientImpl,
  NullLogger,
  NullLoggerImpl,
  NullTemplateEngine,
  NullTemplateEngineImpl,
  RealAuditTrail,
  RealAuditTrailImpl,
  SmtpEmailClient,
  SmtpEmailClientImpl
} from "./implementations.js";

const resolveService = (container: Container) =>
  container.resolve(NotificationService) as NotificationServiceImpl;

describe("Child Container - singleton cross-container resolution", () => {
  let parent: Container;

  beforeEach(() => {
    parent = new Container();
    parent.register(NullLoggerImpl);
    parent.register(NullEmailClientImpl);
    parent.register(NullTemplateEngineImpl);
    parent.register(NullAuditTrailImpl);
    parent.register(NotificationServiceImplementation).inSingletonScope();
  });

  test("parent singleton resolves all null implementations", () => {
    const service = resolveService(parent);
    expect(service.getLogger()).toBeInstanceOf(NullLogger);
    expect(service.getEmailClient()).toBeInstanceOf(NullEmailClient);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("child overrides some deps - child singleton uses child deps, parent is unaffected", () => {
    const child = parent.createChildContainer();
    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);

    const childService = resolveService(child);
    expect(childService.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(childService.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(childService.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(childService.getAuditTrail()).toBeInstanceOf(NullAuditTrail);

    const parentService = resolveService(parent);
    expect(parentService.getLogger()).toBeInstanceOf(NullLogger);
    expect(parentService.getEmailClient()).toBeInstanceOf(NullEmailClient);
    expect(parentService).not.toBe(childService);
  });

  test("child overrides all deps - child singleton uses all child deps", () => {
    const child = parent.createChildContainer();
    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);
    child.register(RealAuditTrailImpl);

    const service = resolveService(child);
    expect(service.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(service.getAuditTrail()).toBeInstanceOf(RealAuditTrail);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
  });

  test("child overrides no deps - child singleton uses all parent deps", () => {
    const child = parent.createChildContainer();

    const service = resolveService(child);
    expect(service.getLogger()).toBeInstanceOf(NullLogger);
    expect(service.getEmailClient()).toBeInstanceOf(NullEmailClient);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("grandchild inherits overrides through the chain", () => {
    const child = parent.createChildContainer();
    child.register(ConsoleLoggerImpl);
    const grandchild = child.createChildContainer();
    grandchild.register(SmtpEmailClientImpl);

    const service = resolveService(grandchild);
    expect(service.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("child resolves first - parent singleton still uses parent deps", () => {
    const child = parent.createChildContainer();
    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);

    const childService = resolveService(child);
    expect(childService.getLogger()).toBeInstanceOf(ConsoleLogger);

    const parentService = resolveService(parent);
    expect(parentService.getLogger()).toBeInstanceOf(NullLogger);
    expect(parentService.getEmailClient()).toBeInstanceOf(NullEmailClient);
    expect(parentService).not.toBe(childService);
  });

  test("two children with different overrides get different singletons", () => {
    const child1 = parent.createChildContainer();
    child1.register(ConsoleLoggerImpl);
    const child2 = parent.createChildContainer();
    child2.register(RealAuditTrailImpl);

    const service1 = resolveService(child1);
    const service2 = resolveService(child2);

    expect(service1.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service1.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
    expect(service2.getLogger()).toBeInstanceOf(NullLogger);
    expect(service2.getAuditTrail()).toBeInstanceOf(RealAuditTrail);
    expect(service1).not.toBe(service2);
  });

  test("parent resolves first - child override still reaches the child singleton", () => {
    const parentService = resolveService(parent);
    expect(parentService.getLogger()).toBeInstanceOf(NullLogger);

    const child = parent.createChildContainer();
    child.register(ConsoleLoggerImpl);

    const childService = resolveService(child);
    expect(childService.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(childService).not.toBe(parentService);
    expect(resolveService(parent)).toBe(parentService);
  });

  test("great-grandchild resolves overrides spread across 4 levels", () => {
    const child = parent.createChildContainer();
    child.register(ConsoleLoggerImpl);
    const grandchild = child.createChildContainer();
    grandchild.register(SmtpEmailClientImpl);
    const greatGrandchild = grandchild.createChildContainer();
    greatGrandchild.register(RealAuditTrailImpl);

    const service = resolveService(greatGrandchild);
    expect(service.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(service.getAuditTrail()).toBeInstanceOf(RealAuditTrail);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
  });
});
