import { z } from "zod";
import { isAcceptableEmail } from "@workspace/auth";
import { validateSubdomain } from "@workspace/tenancy";
import type { ErrorCode } from "@/lib/rpc-error";

/** Shared by the client (pre-check) and the server action; the database re-validates everything. */
const name = z.string().trim().min(1, "name_required").max(120, "name_required");
const subdomain = z.string().superRefine((v, ctx) => {
  const r = validateSubdomain(v);
  if (!r.ok) ctx.addIssue({ code: "custom", message: r.reason === "reserved" ? "subdomain_reserved" : "subdomain_invalid" });
});
const email = z.string().refine(isAcceptableEmail, "email_invalid");

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
