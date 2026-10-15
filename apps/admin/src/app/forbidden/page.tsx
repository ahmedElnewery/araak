import { StatusPage } from "@workspace/ui/components/status-page";
import { getI18n } from "@/lib/locale";

export default async function Forbidden() {
  const { t } = await getI18n();
  return <StatusPage title={t.errors.forbiddenTitle} body={t.errors.forbiddenBody} />;
}
