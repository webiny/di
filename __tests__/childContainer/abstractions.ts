import { Abstraction } from "../../src/index.js";

export interface ILogger {
  log(message: string): string;
}

export interface IEmailClient {
  send(to: string, body: string): string;
}

export interface ITemplateEngine {
  render(template: string, data: Record<string, string>): string;
}

export interface INotificationService {
  notify(userId: string, message: string): string;
}

export interface IAuditTrail {
  record(action: string): string;
}

export const Logger = new Abstraction<ILogger>("Logger");
export const EmailClient = new Abstraction<IEmailClient>("EmailClient");
export const TemplateEngine = new Abstraction<ITemplateEngine>("TemplateEngine");
export const NotificationService = new Abstraction<INotificationService>("NotificationService");
export const AuditTrail = new Abstraction<IAuditTrail>("AuditTrail");
