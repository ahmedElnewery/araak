import { PageLoader } from "@workspace/ui/components/page-loader";
import { getI18n } from "@/lib/locale";

export default async function Loading() {
  const { t } = await getI18n();
  return <PageLoader label={t.common.loading} />;
}
