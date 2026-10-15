"use client";

import { useState, useTransition } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { disableStaffAction, enableStaffAction } from "@/features/staff/actions";
import type { FormState } from "@/features/form-state";

/** Disable / enable with an explicit confirmation. The server re-checks authority, self and last-manager rules. */
export function StatusControl({ staffId, enabled, t }: { staffId: string; enabled: boolean; t: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<(FormState & { acted: "disabled" | "enabled" }) | null>(null);
  const [pending, start] = useTransition();
  const s = t.portal.staff;
  return (
    <div className="space-y-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant={enabled ? "destructive" : "outline"}>{enabled ? s.disable : s.enable}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{enabled ? s.disableTitle : s.enableTitle}</AlertDialogTitle>
            <AlertDialogDescription>{enabled ? s.disableBody : s.enableBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{s.cancel}</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() => {
                start(async () => {
                  const acted = enabled ? "disabled" : "enabled";
                  setResult({ ...(await (enabled ? disableStaffAction(staffId) : enableStaffAction(staffId))), acted });
                  setOpen(false);
                });
              }}
            >
              {s.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {result?.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[result.error]}</p> : null}
      {result?.ok ? <p role="status" className="text-sm">{result.acted === "disabled" ? s.disabled : s.enabled}</p> : null}
    </div>
  );
}
