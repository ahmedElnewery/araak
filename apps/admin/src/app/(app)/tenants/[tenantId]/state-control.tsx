"use client";

import { useState, useTransition } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import type { ErrorCode } from "@/lib/rpc-error";
import { setTenantStateAction } from "@/features/tenants/update-tenant-actions";

type Props = { tenantId: string; state: "active" | "suspended"; t: Dictionary["admin"] };

export function StateControl({ tenantId, state, t }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<ErrorCode | undefined>();
  const target = state === "active" ? "suspended" : "active";
  const text =
    state === "active"
      ? { trigger: t.tenants.suspend, title: t.tenants.suspendTitle, body: t.tenants.suspendBody, confirm: t.tenants.confirmSuspend }
      : { trigger: t.tenants.reactivate, title: t.tenants.reactivateTitle, body: t.tenants.reactivateBody, confirm: t.tenants.confirmReactivate };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm">{t.common.state}:</span>
      <Badge variant={state === "active" ? "default" : "secondary"}>
        {state === "active" ? t.tenants.stateActive : t.tenants.stateSuspended}
      </Badge>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant={state === "active" ? "destructive" : "default"} loading={pending}>{text.trigger}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{text.title}</AlertDialogTitle>
            <AlertDialogDescription>{text.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                start(async () => {
                  const r = await setTenantStateAction(tenantId, target);
                  setError(r.error);
                });
              }}
            >
              {text.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <p role="alert" className="text-sm text-destructive">{t.errors[error]}</p> : null}
    </div>
  );
}
