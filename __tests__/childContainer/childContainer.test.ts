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

describe("Child Container - cross-container resolution", () => {
  let parentContainer: Container;

  beforeEach(() => {
    parentContainer = new Container();

    // Parent registers all abstractions with null/stub implementations.
    // NotificationService depends on Logger, EmailClient, TemplateEngine, AuditTrail.
    parentContainer.register(NullLoggerImpl);
    parentContainer.register(NullEmailClientImpl);
    parentContainer.register(NullTemplateEngineImpl);
    parentContainer.register(NullAuditTrailImpl);
    parentContainer.register(NotificationServiceImplementation);
  });

  test("parent container resolves all null implementations", () => {
    const service = parentContainer.resolve(NotificationService) as NotificationServiceImpl;
    expect(service.getLogger()).toBeInstanceOf(NullLogger);
    expect(service.getEmailClient()).toBeInstanceOf(NullEmailClient);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("child overrides some deps - parent service should resolve child deps", () => {
    const child = parentContainer.createChildContainer();

    // Override only Logger and EmailClient in the child; leave TemplateEngine and AuditTrail
    // to be resolved from the parent.
    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);

    // NotificationService is NOT registered in the child — it comes from the parent.
    // But its dependencies (Logger, EmailClient) SHOULD be resolved from the child first.
    const service = child.resolve(NotificationService) as NotificationServiceImpl;

    // These should come from the child container.
    expect(service.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service.getEmailClient()).toBeInstanceOf(SmtpEmailClient);

    // These should fall back to the parent container (null implementations).
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("child overrides all deps - parent service should resolve all from child", () => {
    const child = parentContainer.createChildContainer();

    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);
    child.register(RealAuditTrailImpl);

    // TemplateEngine still comes from parent.
    const service = child.resolve(NotificationService) as NotificationServiceImpl;

    expect(service.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(service.getAuditTrail()).toBeInstanceOf(RealAuditTrail);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
  });

  test("child overrides no deps - parent service should use all parent deps", () => {
    const child = parentContainer.createChildContainer();

    // No overrides — everything should come from the parent.
    const service = child.resolve(NotificationService) as NotificationServiceImpl;

    expect(service.getLogger()).toBeInstanceOf(NullLogger);
    expect(service.getEmailClient()).toBeInstanceOf(NullEmailClient);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("grandchild inherits overrides through the chain", () => {
    const child = parentContainer.createChildContainer();
    child.register(ConsoleLoggerImpl);

    const grandchild = child.createChildContainer();
    grandchild.register(SmtpEmailClientImpl);

    // NotificationService comes from parent.
    // Logger should resolve from child, EmailClient from grandchild, rest from parent.
    const service = grandchild.resolve(NotificationService) as NotificationServiceImpl;

    expect(service.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(service.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
    expect(service.getTemplateEngine()).toBeInstanceOf(NullTemplateEngine);
    expect(service.getAuditTrail()).toBeInstanceOf(NullAuditTrail);
  });

  test("child override does not affect parent resolution", () => {
    const child = parentContainer.createChildContainer();
    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);

    // Parent should still resolve its own null implementations.
    const parentService = parentContainer.resolve(NotificationService) as NotificationServiceImpl;
    expect(parentService.getLogger()).toBeInstanceOf(NullLogger);
    expect(parentService.getEmailClient()).toBeInstanceOf(NullEmailClient);

    // Child should use overrides.
    const childService = child.resolve(NotificationService) as NotificationServiceImpl;
    expect(childService.getLogger()).toBeInstanceOf(ConsoleLogger);
    expect(childService.getEmailClient()).toBeInstanceOf(SmtpEmailClient);
  });

  test("notify output reflects which implementations were resolved", () => {
    const child = parentContainer.createChildContainer();
    child.register(ConsoleLoggerImpl);
    child.register(SmtpEmailClientImpl);
    child.register(RealAuditTrailImpl);

    const service = child.resolve(NotificationService) as NotificationServiceImpl;
    const result = service.notify("user-1", "hello");

    // Logger → ConsoleLogger, EmailClient → SmtpEmailClient, AuditTrail → RealAuditTrail
    expect(result).toContain("ConsoleLogger:");
    expect(result).toContain("SmtpEmailClient:");
    expect(result).toContain("RealAuditTrail:");

    // TemplateEngine → NullTemplateEngine (falls back to parent)
    // The rendered output is "NullTemplateEngine" which gets passed to emailClient.send as body
    expect(result).toContain("NullTemplateEngine");
  });
});
