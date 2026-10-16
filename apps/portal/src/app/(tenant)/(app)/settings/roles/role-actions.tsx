"use client";

import { useState, useTransition } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { archiveRoleAction, restoreRoleAction } from "@/features/roles/actions";
import type { FormState } from "@/features/form-state";

/** Archive (active role) or Restore (archived role) with confirmation; failures show a localized message. */
export function RoleActions({ roleId, archived, canArchive, canRestore, t }: { roleId: string; archived: boolean; canArchive: boolean; canRestore: boolean; t: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<(FormState & { acted: "archived" | "restored" }) | null>(null);
  const [pending, start] = useTransition();
  const r = t.portal.roles;
  if (archived ? !canRestore : !canArchive) return null;
  return (
    <div className="space-y-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild><Button size="sm" variant="outline">{archived ? r.restore : r.archive}</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{archived ? r.restoreTitle : r.archiveTitle}</AlertDialogTitle>
            <AlertDialogDescription>{archived ? r.restoreBody : r.archiveBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.portal.staff.cancel}</AlertDialogCancel>
            <Button
              loading={pending}
              onClick={() => {
                start(async () => {
                  const acted = archived ? "restored" : "archived";
                  setResult({ ...(await (archived ? restoreRoleAction(roleId) : archiveRoleAction(roleId))), acted });
                  setOpen(false);
                });
              }}
            >
              {t.portal.staff.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {result?.error ? <p role="alert" className="text-xs text-destructive">{t.portal.errors[result.error]}</p> : null}
      {result?.ok ? <p role="status" className="text-xs">{result.acted === "archived" ? r.archived : r.restored}</p> : null}
    </div>
  );
}
