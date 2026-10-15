"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import type { ThemeMode } from "@workspace/i18n";

/**
 * The stored/cookie theme is authoritative: an explicit Light/Dark is forced, System follows the OS. The storage key
 * is per mode so a stale browser-local value can never override the server-stored preference (FR-039).
 */
export function Providers({ theme, children }: { theme: ThemeMode; children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange
      forcedTheme={theme === "system" ? undefined : theme} storageKey={`theme-${theme}`}
    >
      {children}
    </ThemeProvider>
  );
}
