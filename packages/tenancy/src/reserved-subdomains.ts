// Mirrors private.reserved_subdomains (seed in supabase/migrations/*_foundation_base.sql, changed by
// *_reserved_subdomains_platform_hosts.sql). `portal` is NOT reserved: the Araak organization holds it (seeded by
// *_araak_portal_tenant.sql), and the host classifier rejects reserved labels, so reserving it would 404 portal.<domain>.
export const RESERVED_SUBDOMAINS: readonly string[] = [
  "admin", "www", "api", "app", "mail", "smtp", "auth", "static", "assets", "status", "support",
  "araak", "send", "email", "docs", "help", "blog", "dev", "staging", "test", "preview",
  "cdn", "id", "login", "account", "dashboard", "billing",
];
