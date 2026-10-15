import { escapeHtml, layout, type Locale, type Rendered } from "./shared";

export function renderStaffInvitation(locale: Locale, p: { tenantName: string; link: string; validHours: number }): Rendered {
  const days = Math.round(p.validHours / 24);
  const t =
    locale === "ar"
      ? {
          subject: `دعوة للانضمام إلى ${p.tenantName}`,
          intro: `تمت دعوتك للانضمام إلى ${p.tenantName}.`,
          cta: "قبول الدعوة",
          valid: `الرابط صالح لمدة ${String(days)} أيام ولمرة واحدة فقط.`,
          ignore: "إذا لم تكن تتوقع هذه الدعوة فتجاهل هذه الرسالة.",
        }
      : {
          subject: `Invitation to join ${p.tenantName}`,
          intro: `You have been invited to join ${p.tenantName}.`,
          cta: "Accept invitation",
          valid: `This link is valid for ${String(days)} days and can be used once.`,
          ignore: "If you were not expecting this invitation, ignore this email.",
        };
  return {
    subject: t.subject,
    text: `${t.intro}\n\n${t.cta}: ${p.link}\n\n${t.valid}\n${t.ignore}`,
    html: layout(locale, `<p>${escapeHtml(t.intro)}</p><p><a href="${escapeHtml(p.link)}">${escapeHtml(t.cta)}</a></p><p>${escapeHtml(t.valid)}</p><p>${escapeHtml(t.ignore)}</p>`),
  };
}
