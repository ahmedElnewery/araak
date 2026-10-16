import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { can } from "@workspace/authorization";
import { LtrText } from "@workspace/ui/components/ltr-text";
import { PageContainer, PageHeader } from "@workspace/ui/components/page-header";
import { SettingsSection, SettingsSections, settingsCard } from "@workspace/ui/components/settings-section";
import { StaffName, staffName } from "@workspace/ui/components/staff-name";
import { StatusBadge, Tag } from "@workspace/ui/components/status-badge";
import { settingsCrumb } from "@/lib/breadcrumbs";
import { requirePermission } from "@/lib/guards";
import { getI18n } from "@/lib/locale";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { RolesEditor } from "./roles-editor";
import { StatusControl } from "./status-control";

type StaffDetail = {
  id: string; username: string; firstName: string | null; lastName: string | null; email: string; enabled: boolean; isManager: boolean;
  roles: { id: string; name: string; canGrant: boolean }[];
};

export default async function StaffDetailPage({ params }: { params: Promise<{ staffId: string }> }) {
  const ctx = await requirePermission("staff.view");
  const { staffId } = await params;
  if (!z.uuid().safeParse(staffId).success) notFound();
  const { t } = await getI18n();
  const { data, error } = await ctx.supabase.rpc("get_staff", { p_staff_id: staffId });
  if (error || !data) notFound();
  const person = data as StaffDetail;
  const isSelf = person.id === ctx.staffId;

  // Own record: no role editor and no disable control at all (CL-044); the server denies a forged request regardless.
  const canAssign = can(ctx.permissions, "staff.roles.assign") && !isSelf;
  let assignable: { id: string; name: string }[] = [];
  if (canAssign) {
    const { data: g } = await ctx.supabase.rpc("list_grantable_roles");
    assignable = (g ?? []) as { id: string; name: string }[];
  }
  const held = person.roles.filter((r) => r.canGrant);
  const options = [...assignable, ...held.filter((h) => !assignable.some((a) => a.id === h.id)).map(({ id, name }) => ({ id, name }))]
    .sort((a, b) => a.name.localeCompare(b.name));
  const canToggle = !isSelf && (person.enabled ? can(ctx.permissions, "staff.disable") : can(ctx.permissions, "staff.enable"));

  const canReset = ctx.isManager && person.enabled && !isSelf;
  const st = t.portal.staff;

  return (
    <PageContainer labelledBy="staff-name" width="narrow">
      <PageHeader
        titleId="staff-name" title={<StaffName staff={person} />} link={Link}
        breadcrumb={{
          label: t.common.breadcrumb,
          items: [settingsCrumb(ctx.permissions, t), { label: st.directoryTitle, href: "/settings/staff" }, { label: staffName(person) }],
        }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={person.enabled ? "success" : "neutral"} dot>{person.enabled ? st.stateEnabled : st.stateDisabled}</StatusBadge>
            {person.isManager ? <StatusBadge tone="accent">{st.managerBadge}</StatusBadge> : null}
          </span>
        }
      />
      <div className={settingsCard}>
        <SettingsSections>
          <SettingsSection id="staff-account" title={st.accountTitle} description={st.accountIntro}>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
              <dt className="text-muted-foreground">{st.username}</dt>
              <dd className="min-w-0 font-semibold"><LtrText>{person.username}</LtrText></dd>
              <dt className="text-muted-foreground">{st.email}</dt>
              <dd className="min-w-0 break-words font-semibold"><LtrText>{person.email}</LtrText></dd>
            </dl>
          </SettingsSection>
          <SettingsSection id="staff-roles" title={st.rolesEditorTitle} description={canAssign ? st.rolesEditorIntro : undefined}>
            {canAssign ? <RolesEditor staffId={person.id} options={options} selected={held.map((r) => r.id)} t={t} /> : (
              <>
                {person.roles.length ? (
                  <div className="flex flex-wrap gap-1.5">{person.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>)}</div>
                ) : <p className="text-sm text-muted-foreground">{st.noRolesAssigned}</p>}
                {isSelf ? <p className="text-sm text-muted-foreground">{st.ownRolesNote}</p> : null}
              </>
            )}
          </SettingsSection>
          {canToggle || canReset ? (
            <SettingsSection id="staff-access" title={st.accessTitle} description={st.accessIntro}>
              <div className="flex flex-wrap items-start gap-2">
                {canReset ? <ResetPasswordDialog staffId={person.id} t={t} /> : null}
                {canToggle ? <StatusControl staffId={person.id} enabled={person.enabled} t={t} /> : null}
              </div>
            </SettingsSection>
          ) : null}
        </SettingsSections>
      </div>
    </PageContainer>
  );
}
