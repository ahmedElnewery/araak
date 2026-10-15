"use client";

import { useEffect, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { StatusPage } from "@workspace/ui/components/status-page";
import { getDictionary, isLocale, type Locale } from "@workspace/i18n";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<Locale>("ar");
  useEffect(() => {
    const lang = document.documentElement.lang;
    if (isLocale(lang)) setLocale(lang);
  }, []);
  const t = getDictionary(locale);
  // The error object is never rendered: it could contain internal details.
  return <StatusPage title={t.errors.genericTitle} body={t.errors.genericBody} action={<Button onClick={reset}>{t.common.retry}</Button>} />;
}
