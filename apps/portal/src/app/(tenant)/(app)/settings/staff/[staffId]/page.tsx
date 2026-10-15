import { z } from "zod";
import { notFound } from "next/navigation";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { requireManager } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { ResetPasswordDialog } from "./reset-password-dialog";

// Minimal staff detail for the manager-assisted reset entry point; the full staff screens arrive with the staff story.
export default async function StaffDetailPage({ params }: { params: Promise<{ staffId: string }> }) {
  const ctx = await requireManager();
  const { staffId } = await params;
  if (!z.uuid().safeParse(staffId).success) notFound();
  const { t } = await getI18n();
  const { data } = await ctx.supabase.from("tenant_staff").select("id, username, email, enabled").eq("id", staffId).maybeSingle();
  if (!data) notFound();
  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold"><LtrText>{data.username}</LtrText></h1>
      <p><LtrText>{data.email}</LtrText></p>
      {data.enabled && data.id !== ctx.staffId ? <ResetPasswordDialog staffId={data.id} t={t} /> : null}
    </section>
  );
}
