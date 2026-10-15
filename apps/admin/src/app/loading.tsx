import { getI18n } from "@/lib/locale";

export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div role="status" aria-live="polite" className="flex min-h-svh items-center justify-center text-muted-foreground">
      {t.common.loading}
    </div>
  );
}
