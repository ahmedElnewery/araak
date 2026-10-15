"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/guards";
import { unwrapRpc } from "../rpc-result";
import { type FormState } from "../form-state";

type StaffRole = { id: string; name: string; canGrant: boolean };

/**
 * Applies the role checkboxes of the staff page. Only roles the actor may assign (the rendered ones) are compared,
 * so roles above the actor's ceiling that the person already holds are neither shown nor removed. The database
 * re-checks the ceiling and refuses self-changes (CL-044) whatever this form sends.
 */
export async function setStaffRolesAction(staffId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("staff.roles.assign");
  const selected = z.array(z.uuid()).max(100).safeParse(formData.getAll("roles").map(String));
  if (!selected.success) return { error: "roles_invalid" };
  const [grantable, current] = await Promise.all([
    ctx.supabase.rpc("list_grantable_roles"),
    ctx.supabase.rpc("get_staff", { p_staff_id: staffId }),
  ]);
  if (grantable.error || current.error) return { error: "generic" };
  const have = ((current.data as { roles: StaffRole[] }).roles).filter((r) => r.canGrant).map((r) => r.id);
  const managed = new Set([...(grantable.data as { id: string }[]).map((r) => r.id), ...have]);
  const want = new Set(selected.data.filter((id) => managed.has(id)));
  const add = [...want].filter((id) => !have.includes(id));
  const remove = have.filter((id) => !want.has(id));
  if (add.length === 0 && remove.length === 0) return { ok: true };
  const r = unwrapRpc(await ctx.supabase.rpc("set_staff_roles", { p_staff_id: staffId, p_add: add, p_remove: remove }));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/settings/staff/${staffId}`);
  return { ok: true };
}

export async function disableStaffAction(staffId: string): Promise<FormState> {
  const ctx = await requirePermission("staff.disable");
  const r = unwrapRpc(await ctx.supabase.rpc("disable_staff", { p_staff_id: staffId }));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/settings/staff/${staffId}`);
  revalidatePath("/settings/staff");
  return { ok: true };
}

export async function enableStaffAction(staffId: string): Promise<FormState> {
  const ctx = await requirePermission("staff.enable");
  const r = unwrapRpc(await ctx.supabase.rpc("enable_staff", { p_staff_id: staffId }));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/settings/staff/${staffId}`);
  revalidatePath("/settings/staff");
  return { ok: true };
}
