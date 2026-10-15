import nodemailer from "nodemailer";

export type MailMessage = { to: string; subject: string; text: string; html: string };

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Development/test transport (a local mail catcher or any SMTP URL). */
export class SmtpMailer implements Mailer {
  private readonly transport;
  constructor(smtpUrl: string, private readonly from = "no-reply@localhost") {
    this.transport = nodemailer.createTransport(smtpUrl);
  }
  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** Production stays disabled until GATE-OPS selects a transport (docs/decisions/operations.md). */
export class UnconfiguredProductionMailer implements Mailer {
  async send(_message: MailMessage): Promise<void> {
    throw new Error("MAIL_TRANSPORT_NOT_CONFIGURED");
  }
}

export function createMailer(env: { APP_ENV: "development" | "production" | "test"; SMTP_URL?: string | undefined }): Mailer {
  if (env.APP_ENV === "production") return new UnconfiguredProductionMailer();
  return new SmtpMailer(env.SMTP_URL ?? "smtp://127.0.0.1:54324");
}
