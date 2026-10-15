import type { Dictionary } from "./types";

export const ar = {
  common: {
    skipToContent: "تخطَّ إلى المحتوى",
    language: "اللغة",
    theme: "المظهر",
    themeSystem: "حسب النظام",
    themeLight: "فاتح",
    themeDark: "داكن",
    loading: "جارٍ التحميل",
    retry: "إعادة المحاولة",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة",
    logoAlt: "شعار المؤسسة",
  },
  errors: {
    notFoundTitle: "الصفحة غير موجودة",
    notFoundBody: "تعذّر العثور على ما تبحث عنه.",
    genericTitle: "حدث خطأ",
    genericBody: "تعذّر إكمال الطلب. حاول مرة أخرى.",
    forbiddenTitle: "غير مصرّح",
    forbiddenBody: "لا تملك صلاحية الوصول إلى هذه الصفحة.",
    sessionExpiredTitle: "انتهت الجلسة",
    sessionExpiredBody: "سجّل الدخول مرة أخرى للمتابعة.",
    suspendedTitle: "الخدمة غير متاحة",
    suspendedBody: "هذه المؤسسة غير متاحة حاليًا.",
  },
  nav: { home: "الرئيسية" },
} satisfies Dictionary;
