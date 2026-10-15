import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, createSupabaseServerClient, getPlatformAdminContext, getSupabaseAdmin } from "@workspace/auth/server";
import { LOGO_BUCKET } from "@workspace/config";

// Preview for the platform intervention panel. Requires `tenants.manage`; only the logo object of the named tenant.
export async function GET(_req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!z.uuid().safeParse(tenantId).success) return new NextResponse(null, { status: 404 });
  try {
    const ctx = await getPlatformAdminContext(await createSupabaseServerClient("admin"));
    if (!ctx.capabilities.includes("tenants.manage")) return new NextResponse(null, { status: 403 });
  } catch (e) {
    if (e instanceof AuthError) return new NextResponse(null, { status: 401 });
    throw e;
  }
  const admin = getSupabaseAdmin();
  const { data: row } = await admin.from("tenants").select("logo_object_path").eq("id", tenantId).maybeSingle();
  const path = row?.logo_object_path;
  if (!path?.startsWith(`${tenantId}/`)) return new NextResponse(null, { status: 404 });
  const { data: blob, error } = await admin.storage.from(LOGO_BUCKET).download(path);
  if (error) return new NextResponse(null, { status: 404 });
  return new NextResponse(blob, {
    headers: { "Content-Type": blob.type || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
  });
}
