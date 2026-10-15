import { ImageResponse } from "next/og";
import { getSupabaseAdmin } from "@workspace/auth/server";
import { LOGO_BUCKET } from "@workspace/config";
import { resolveTenantFromHost } from "@workspace/tenancy/server";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";
// Depends on the request host, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

// Tenant favicon: the tenant's own logo, otherwise a neutral generated glyph. Never a provider mark (FR-035, FR-037).
export default async function Icon() {
  const tenant = await resolveTenantFromHost();
  if (tenant?.hasLogo) {
    const admin = getSupabaseAdmin();
    const { data: row } = await admin.from("tenants").select("logo_object_path").eq("id", tenant.id).maybeSingle();
    const path = row?.logo_object_path;
    if (path?.startsWith(`${tenant.id}/`)) {
      const { data: blob } = await admin.storage.from(LOGO_BUCKET).download(path);
      if (blob) {
        const src = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
        return new ImageResponse(
          <img src={src} alt="" width={64} height={64} style={{ objectFit: "contain" }} />,
          size,
        );
      }
    }
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#087e89", borderRadius: 14 }}>
        <div style={{ width: 28, height: 28, border: "5px solid #ffffff", borderRadius: 6 }} />
      </div>
    ),
    size,
  );
}
