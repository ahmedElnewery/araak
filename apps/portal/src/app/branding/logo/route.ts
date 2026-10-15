import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@workspace/auth/server";
import { LOGO_BUCKET } from "@workspace/config";
import { resolveTenantFromHost } from "@workspace/tenancy/server";

// Passive: no session lookup, no activity write (CL-036). The tenant comes from the trusted host only, so a request
// on host A can never read B's object. Objects are private; bytes are streamed with the service role.
export async function GET() {
  const tenant = await resolveTenantFromHost();
  if (!tenant?.hasLogo) return new NextResponse(null, { status: 404 });
  const admin = getSupabaseAdmin();
  const { data: row } = await admin.from("tenants").select("logo_object_path").eq("id", tenant.id).maybeSingle();
  const path = row?.logo_object_path;
  // defence in depth: the stored path must live under this tenant's own folder
  if (!path?.startsWith(`${tenant.id}/`)) return new NextResponse(null, { status: 404 });
  const { data: blob, error } = await admin.storage.from(LOGO_BUCKET).download(path);
  if (error) return new NextResponse(null, { status: 404 });
  return new NextResponse(blob, {
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      // keyed by ?v=<logo_version>, so a replaced logo gets a new URL
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": "inline",
    },
  });
}
