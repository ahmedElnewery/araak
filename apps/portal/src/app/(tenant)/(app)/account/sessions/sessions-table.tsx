"use client";

import { LogOut, Monitor, MonitorSmartphone, Smartphone, Tablet } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { formatDateTime, type Dictionary, type Locale } from "@workspace/i18n";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { DataTable, type DataColumn } from "@workspace/ui/components/data-table";
import { PageHeader, type Crumb } from "@workspace/ui/components/page-header";
import { StatusBadge } from "@workspace/ui/components/status-badge";
import { useTimeZone } from "@workspace/ui/hooks/use-time-zone";
import { revokeOtherSessionsAction, revokeSessionAction, type SessionActionResult } from "@/features/account/sessions-actions";

export type SessionRow = {
  id: string; device_type: string | null; browser: string | null; created_at: string; verified_activity_at: string; is_current: boolean;
};

const DEVICE_ICONS: Record<string, typeof Monitor> = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };

/**
 * The sessions page below its breadcrumb: "sign out everywhere else" is the page's action, so the header lives with the
 * table that shares its pending state and result. No password field and no IP/location anywhere (CL-037..CL-039).
 */
export function SessionsView({ rows, t, locale, accountCrumb }: { rows: SessionRow[]; t: Dictionary; locale: Locale; accountCrumb: Crumb }) {
  const s = t.portal.sessions;
  const timeZone = useTimeZone();
  const [result, setResult] = useState<{ kind: "one" | "all"; r: SessionActionResult } | null>(null);
  const [pending, start] = useTransition();
  const run = (kind: "one" | "all", work: () => Promise<SessionActionResult>) => { start(async () => { setResult({ kind, r: await work() }); }); };
  const hasOthers = rows.some((r) => !r.is_current);

  const columns: DataColumn<SessionRow>[] = [
    {
      id: "device", header: s.colDevice, primary: true,
      cell: (row) => {
        const Icon = (row.device_type && DEVICE_ICONS[row.device_type]) || MonitorSmartphone;
        return (
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-foreground">
              <Icon className="size-[1.125rem]" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-bold">
                {(row.device_type && s.deviceTypes[row.device_type]) || s.unknownDevice}
                {row.is_current ? <StatusBadge tone="accent">{s.current}</StatusBadge> : null}
              </div>
              <div className="text-xs text-subtle">{row.browser ? <bdi dir="ltr">{row.browser}</bdi> : s.unknownBrowser}</div>
            </div>
          </div>
        );
      },
    },
    { id: "signedIn", header: s.colSignedIn, label: s.colSignedIn, cell: (row) => formatDateTime(row.created_at, locale, timeZone) },
    { id: "activity", header: s.colActivity, label: s.colActivity, cell: (row) => formatDateTime(row.verified_activity_at, locale, timeZone) },
    {
      id: "logout", header: s.logout, srOnlyHeader: true, align: "end",
      cell: (row) => row.is_current ? null : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" loading={pending}>{s.logout}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{s.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{s.confirmBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{s.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={() => { run("one", () => revokeSessionAction(row.id)); }}>{s.confirm}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
    },
  ];

  const logoutAll = hasOthers ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="h-10 rounded-[10px]" loading={pending}>
          <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
          {s.logoutAll}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{s.confirmAllTitle}</AlertDialogTitle>
          <AlertDialogDescription>{s.confirmAllBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{s.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { run("all", () => revokeOtherSessionsAction()); }}>{s.confirmAll}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return (
    <>
      <PageHeader
        titleId="sessions-title" title={s.title} description={s.intro} actions={logoutAll} link={Link}
        breadcrumb={{ label: t.common.breadcrumb, items: [accountCrumb, { label: s.title }] }}
      />
      {result?.r.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[result.r.error]}</p> : null}
      {result?.r.ok ? <p role="status" className="text-sm">{result.kind === "all" ? s.allRevoked : s.revoked}</p> : null}
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={s.title} />
      {hasOthers ? null : <p className="text-sm text-muted-foreground">{s.empty}</p>}
    </>
  );
}
