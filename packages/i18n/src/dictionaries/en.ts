import type { Dictionary } from "./types";

export const en = {
  common: {
    skipToContent: "Skip to content",
    language: "Language",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    loading: "Loading",
    retry: "Try again",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    logoAlt: "Organization logo",
  },
  errors: {
    notFoundTitle: "Page not found",
    notFoundBody: "We could not find what you were looking for.",
    genericTitle: "Something went wrong",
    genericBody: "The request could not be completed. Please try again.",
    forbiddenTitle: "Not authorized",
    forbiddenBody: "You do not have access to this page.",
    sessionExpiredTitle: "Session ended",
    sessionExpiredBody: "Sign in again to continue.",
    suspendedTitle: "Service unavailable",
    suspendedBody: "This organization is currently unavailable.",
  },
  nav: { home: "Home" },
} satisfies Dictionary;
