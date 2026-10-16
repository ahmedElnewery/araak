import "server-only";
import type { EffectivePermissions } from "@workspace/authorization";
import type { Dictionary } from "@workspace/i18n";
import type { Crumb } from "@workspace/ui/components/page-header";
import { buildNavigation, sectionHref } from "./navigation";

/** Settings as a breadcrumb ancestor. It has no page of its own, so it leads where the sidebar's Settings does. */
export function settingsCrumb(perms: EffectivePermissions, t: Dictionary): Crumb {
  return { label: t.portal.nav.settings, href: sectionHref(buildNavigation(perms, t.portal.nav), "settings") };
}

export function accountCrumb(t: Dictionary): Crumb {
  return { label: t.portal.nav.account, href: "/account" };
}
