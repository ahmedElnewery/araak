import { escapeHtml, layout, type Locale, type Rendered } from "./shared";

export function renderPasswordReset(locale: Locale, p: { tenantName: string; link: string; validMinutes: number }): Rendered {
  const t =
    locale === "ar"
      ? { subject: `إعادة تعيين كلمة المرور - ${p.tenantName}`, intro: `تم طلب إعادة تعيين كلمة المرور لحسابك في ${p.tenantName}.`, cta: "اختيار كلمة مرور جديدة", valid: `الرابط صالح لمدة ${String(p.validMinutes)} دقيقة ولمرة واحدة فقط.`, ignore: "إذا لم تطلب ذلك فتجاهل هذه الرسالة." }
      : { subject: `Password reset - ${p.tenantName}`, intro: `A password reset was requested for your ${p.tenantName} account.`, cta: "Choose a new password", valid: `This link is valid for ${String(p.validMinutes)} minutes and can be used once.`, ignore: "If you did not request this, ignore this email." };
  return {
    subject: t.subject,
    text: `${t.intro}\n\n${t.cta}: ${p.link}\n\n${t.valid}\n${t.ignore}`,
    html: layout(locale, `<p>${escapeHtml(t.intro)}</p><p><a href="${escapeHtml(p.link)}">${escapeHtml(t.cta)}</a></p><p>${escapeHtml(t.valid)}</p><p>${escapeHtml(t.ignore)}</p>`),
  };
}
