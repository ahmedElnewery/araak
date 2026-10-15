import { describe, expect, it } from "vitest";
import { createMailer, SmtpMailer, UnconfiguredProductionMailer } from "./mailer";

describe("createMailer", () => {
  it("production throws MAIL_TRANSPORT_NOT_CONFIGURED until a transport is approved", async () => {
    const m = createMailer({ APP_ENV: "production", SMTP_URL: "smtp://x" });
    expect(m).toBeInstanceOf(UnconfiguredProductionMailer);
    await expect(m.send({ to: "a@b.c", subject: "s", text: "t", html: "h" })).rejects.toThrow("MAIL_TRANSPORT_NOT_CONFIGURED");
  });
  it("development and test use SMTP (local mail catcher by default)", () => {
    expect(createMailer({ APP_ENV: "development" })).toBeInstanceOf(SmtpMailer);
    expect(createMailer({ APP_ENV: "test", SMTP_URL: "smtp://127.0.0.1:1025" })).toBeInstanceOf(SmtpMailer);
  });
});
