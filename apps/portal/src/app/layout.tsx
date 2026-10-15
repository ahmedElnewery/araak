import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { getI18n } from "@/lib/locale";

import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-arabic", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });

// Neutral metadata: no provider name, no default icons.
export const metadata: Metadata = { title: "Portal", icons: { icon: [] } };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, dir } = await getI18n();
  return (
    <html lang={locale} dir={dir} className={`${cairo.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
