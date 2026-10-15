import { escapeHtml, layout, type Locale, type Rendered } from "./shared";

/** Neutral wording: names no organization and no product. */
export function renderPlatformInvitation(locale: Locale, p: { link: string; validHours: number }): Rendered {
  const t =
    locale === "ar"
      ? { subject: "دعوة إلى لوحة الإدارة", intro: "تمت دعوتك للانضمام إلى لوحة الإدارة.", cta: "قبول الدعوة", valid: `الرابط صالح لمدة ${String(p.validHours)} ساعة ولمرة واحدة فقط.` }
      : { subject: "Invitation to the administration console", intro: "You have been invited to the administration console.", cta: "Accept invitation", valid: `This link is valid for ${String(p.validHours)} hours and can be used once.` };
  return {
    subject: t.subject,
    text: `${t.intro}\n\n${t.cta}: ${p.link}\n\n${t.valid}`,
    html: layout(locale, `<p>${escapeHtml(t.intro)}</p><p><a href="${escapeHtml(p.link)}">${escapeHtml(t.cta)}</a></p><p>${escapeHtml(t.valid)}</p>`),
  };
}
