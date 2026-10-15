"use client";

import { useState, useTransition } from "react";
import { formatDateTime, type Dictionary, type Locale } from "@workspace/i18n";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { revokeOtherSessionsAction, revokeSessionAction, type SessionActionResult } from "@/features/account/sessions-actions";

export type SessionRow = {
  id: string; device_type: string | null; browser: string | null; created_at: string; verified_activity_at: string; is_current: boolean;
};

// No password field and no IP/location anywhere: confirmation is enough (CL-037..CL-039).
export function SessionsTable({ rows, t, locale }: { rows: SessionRow[]; t: Dictionary; locale: Locale }) {
  const s = t.portal.sessions;
  const [result, setResult] = useState<{ kind: "one" | "all"; r: SessionActionResult } | null>(null);
  const [pending, start] = useTransition();
  const run = (kind: "one" | "all", work: () => Promise<SessionActionResult>) => { start(async () => { setResult({ kind, r: await work() }); }); };
  const hasOthers = rows.some((r) => !r.is_current);
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{s.colDevice}</TableHead>
            <TableHead scope="col">{s.colBrowser}</TableHead>
            <TableHead scope="col">{s.colSignedIn}</TableHead>
            <TableHead scope="col">{s.colActivity}</TableHead>
            <TableHead scope="col"><span className="sr-only">{s.logout}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                {(row.device_type && s.deviceTypes[row.device_type]) || s.unknownDevice}{" "}
                {row.is_current ? <Badge>{s.current}</Badge> : null}
              </TableCell>
              <TableCell>{row.browser ?? s.unknownBrowser}</TableCell>
              <TableCell>{formatDateTime(row.created_at, locale)}</TableCell>
              <TableCell>{formatDateTime(row.verified_activity_at, locale)}</TableCell>
              <TableCell>
                {row.is_current ? null : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={pending}>{s.logout}</Button>
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
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hasOthers ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={pending}>{s.logoutAll}</Button>
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
      ) : (
        <p className="text-sm text-muted-foreground">{s.empty}</p>
      )}
      {result?.r.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[result.r.error]}</p> : null}
      {result?.r.ok ? <p role="status" className="text-sm">{result.kind === "all" ? s.allRevoked : s.revoked}</p> : null}
    </div>
  );
}
