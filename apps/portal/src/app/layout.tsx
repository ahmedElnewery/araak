import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { resolveTenantFromHost } from "@workspace/tenancy/server";

import { Providers } from "@/components/providers";
import { getI18n } from "@/lib/locale";

import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-arabic", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });

// Title is the tenant's own display name; icon and manifest come from app/icon.tsx and app/manifest.ts. Unknown hosts
// get a neutral, tenant-less title. No provider or product name appears anywhere (FR-035, FR-037, Constitution IX).
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenantFromHost();
  if (tenant) return { title: tenant.displayName };
  const { t } = await getI18n();
  return { title: t.errors.notFoundTitle };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, dir, theme } = await getI18n();
  return (
    <html lang={locale} dir={dir} className={`${cairo.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        <Providers theme={theme} dir={dir}>{children}</Providers>
      </body>
    </html>
  );
}
