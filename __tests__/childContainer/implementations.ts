import { createImplementation } from "../../src/index.js";
import {
  Logger,
  EmailClient,
  TemplateEngine,
  NotificationService,
  AuditTrail,
  type ILogger,
  type IEmailClient,
  type ITemplateEngine,
  type INotificationService,
  type IAuditTrail
} from "./abstractions.js";

// --- Null implementations (stubs that do nothing) ---

export class NullLogger implements ILogger {
  log(_message: string): string {
    return "NullLogger";
  }
}

export class NullEmailClient implements IEmailClient {
  send(_to: string, _body: string): string {
    return "NullEmailClient";
  }
}

export class NullTemplateEngine implements ITemplateEngine {
  render(_template: string, _data: Record<string, string>): string {
    return "NullTemplateEngine";
  }
}

export class NullAuditTrail implements IAuditTrail {
  record(_action: string): string {
    return "NullAuditTrail";
  }
}

// --- Real implementations ---

export class ConsoleLogger implements ILogger {
  log(message: string): string {
    return `ConsoleLogger:${message}`;
  }
}

export class SmtpEmailClient implements IEmailClient {
  send(to: string, body: string): string {
    return `SmtpEmailClient:${to}:${body}`;
  }
}

export class HandlebarsTemplateEngine implements ITemplateEngine {
  render(template: string, _data: Record<string, string>): string {
    return `HandlebarsTemplateEngine:${template}`;
  }
}

export class RealAuditTrail implements IAuditTrail {
  record(action: string): string {
    return `RealAuditTrail:${action}`;
  }
}

// --- Service that depends on other abstractions ---

export class NotificationServiceImpl implements INotificationService {
  constructor(
    private logger: ILogger,
    private emailClient: IEmailClient,
    private templateEngine: ITemplateEngine,
    private auditTrail: IAuditTrail
  ) {}

  notify(userId: string, message: string): string {
    const logResult = this.logger.log(message);
    const rendered = this.templateEngine.render(message, { userId });
    const sendResult = this.emailClient.send(userId, rendered);
    const auditResult = this.auditTrail.record(`notify:${userId}`);
    return `${logResult}|${sendResult}|${auditResult}`;
  }

  getLogger(): ILogger {
    return this.logger;
  }

  getEmailClient(): IEmailClient {
    return this.emailClient;
  }

  getTemplateEngine(): ITemplateEngine {
    return this.templateEngine;
  }

  getAuditTrail(): IAuditTrail {
    return this.auditTrail;
  }
}

// --- createImplementation registrations ---

export const NullLoggerImpl = createImplementation({
  abstraction: Logger,
  implementation: NullLogger,
  dependencies: []
});

export const NullEmailClientImpl = createImplementation({
  abstraction: EmailClient,
  implementation: NullEmailClient,
  dependencies: []
});

export const NullTemplateEngineImpl = createImplementation({
  abstraction: TemplateEngine,
  implementation: NullTemplateEngine,
  dependencies: []
});

export const NullAuditTrailImpl = createImplementation({
  abstraction: AuditTrail,
  implementation: NullAuditTrail,
  dependencies: []
});

export const ConsoleLoggerImpl = createImplementation({
  abstraction: Logger,
  implementation: ConsoleLogger,
  dependencies: []
});

export const SmtpEmailClientImpl = createImplementation({
  abstraction: EmailClient,
  implementation: SmtpEmailClient,
  dependencies: []
});

export const HandlebarsTemplateEngineImpl = createImplementation({
  abstraction: TemplateEngine,
  implementation: HandlebarsTemplateEngine,
  dependencies: []
});

export const RealAuditTrailImpl = createImplementation({
  abstraction: AuditTrail,
  implementation: RealAuditTrail,
  dependencies: []
});

export const NotificationServiceImplementation = createImplementation({
  abstraction: NotificationService,
  implementation: NotificationServiceImpl,
  dependencies: [Logger, EmailClient, TemplateEngine, AuditTrail]
});
