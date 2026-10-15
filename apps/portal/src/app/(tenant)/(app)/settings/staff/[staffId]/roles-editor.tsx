"use client";

import { useActionState } from "react";
import type { Dictionary } from "@workspace/i18n";
import { Button } from "@workspace/ui/components/button";
import { initialFormState, type FormState } from "@/features/form-state";
import { setStaffRolesAction } from "@/features/staff/actions";

/** Offers only roles the actor may assign; the database re-checks the ceiling and the self-change ban. */
export function RolesEditor({ staffId, options, selected, t }: { staffId: string; options: { id: string; name: string }[]; selected: string[]; t: Dictionary }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setStaffRolesAction.bind(null, staffId), initialFormState);
  if (options.length === 0) return <p className="text-sm text-muted-foreground">{t.portal.staff.noAssignableRoles}</p>;
  return (
    <form action={action} className="space-y-3" noValidate>
      <p className="text-sm text-muted-foreground">{t.portal.staff.rolesEditorIntro}</p>
      <fieldset className="grid gap-2">
        <legend className="sr-only">{t.portal.staff.rolesEditorTitle}</legend>
        {options.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="roles" value={r.id} defaultChecked={selected.includes(r.id)} className="size-4" />
            <span dir="auto">{r.name}</span>
          </label>
        ))}
      </fieldset>
      {state.error ? <p role="alert" className="text-sm text-destructive">{t.portal.errors[state.error]}</p> : null}
      {state.ok ? <p role="status" className="text-sm">{t.portal.staff.rolesSaved}</p> : null}
      <Button type="submit" disabled={pending}>{t.portal.staff.saveRoles}</Button>
    </form>
  );
}
