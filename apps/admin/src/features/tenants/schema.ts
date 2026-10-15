import { z } from "zod";
import { isAcceptableEmail } from "@workspace/auth";
import { validateDisplayName } from "@workspace/config";
import { validateSubdomain } from "@workspace/tenancy";
import type { ErrorCode } from "@/lib/rpc-error";

/**
 * Shared by the client (pre-check) and the server action; the database re-validates everything. The name rule is the
 * one the manager's branding form applies (docs/decisions/branding.md §3), so a name set here can always be saved there.
 */
const name = z.string().transform((v, ctx) => {
  const r = validateDisplayName(v);
  if (r.ok) return r.value;
  ctx.addIssue({ code: "custom", message: r.code });
  return z.NEVER;
});
const subdomain = z.string().superRefine((v, ctx) => {
  const r = validateSubdomain(v);
  if (!r.ok) ctx.addIssue({ code: "custom", message: r.reason === "reserved" ? "subdomain_reserved" : "subdomain_invalid" });
});
// edge whitespace (String.prototype.trim: the same set as private.normalize_email, NBSP included) is removed before the
// address is stored or mailed
const email = z.string().refine(isAcceptableEmail, "email_invalid").transform((v) => v.trim());

export const createTenantSchema = z.object({
  displayName: name,
  subdomain,
  initialState: z.enum(["active", "suspended"]),
  managerEmail: email,
});
export const renameTenantSchema = z.object({ displayName: name });
export const inviteEmailSchema = z.object({ email });

export function fieldErrors(error: z.ZodError): Partial<Record<string, ErrorCode>> {
  const out: Partial<Record<string, ErrorCode>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message as ErrorCode;
  }
  return out;
}
