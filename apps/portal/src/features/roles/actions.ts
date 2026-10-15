"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ROLE_SWITCHES, switchesToGrants } from "@workspace/authorization";
import { requirePermission } from "@/lib/guards";
import { unwrapRpc } from "../rpc-result";
import { field, type FormState } from "../form-state";

const switches = z.array(z.enum(ROLE_SWITCHES));

/** Creates (no roleId) or updates a role from the four plain switches. The database enforces the grant ceiling. */
export async function saveRoleAction(roleId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission(roleId ? "roles.update" : "roles.create");
  const name = field(formData, "name").trim();
  const description = field(formData, "description").trim();
  const on = switches.safeParse(formData.getAll("switches").map(String));
  if (!on.success) return { error: "grants_invalid" };
  if (name.length < 1 || name.length > 80) return { fieldErrors: { name: "role_name_invalid" } };
  const grants = switchesToGrants(on.data);
  const res = roleId
    ? await ctx.supabase.rpc("update_role", { p_role_id: roleId, p_name: name, p_description: description, p_grants: grants })
    : await ctx.supabase.rpc("create_role", { p_name: name, p_description: description, p_grants: grants });
  const r = unwrapRpc<{ roleId: string }>(res);
  if (!r.ok) {
    if (r.error === "role_name_conflict" || r.error === "role_name_invalid") return { fieldErrors: { name: r.error } };
    return { error: r.error };
  }
  revalidatePath("/settings/roles");
  if (!roleId) redirect("/settings/roles");
  return { ok: true };
}

export async function archiveRoleAction(roleId: string): Promise<FormState> {
  const ctx = await requirePermission("roles.archive");
  const r = unwrapRpc(await ctx.supabase.rpc("archive_role", { p_role_id: roleId }));
  if (!r.ok) return { error: r.error };
  revalidatePath("/settings/roles");
  return { ok: true };
}

export async function restoreRoleAction(roleId: string): Promise<FormState> {
  const ctx = await requirePermission("roles.restore");
  const r = unwrapRpc(await ctx.supabase.rpc("restore_role", { p_role_id: roleId }));
  if (!r.ok) return { error: r.error };
  revalidatePath("/settings/roles");
  return { ok: true };
}
