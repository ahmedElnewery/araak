// Mirrors private.reserved_subdomains (seed in supabase/migrations/*_foundation_base.sql, changed by
// *_reserved_subdomains_platform_hosts.sql). `portal` is NOT reserved: it is the Araak organization's label.
export const RESERVED_SUBDOMAINS: readonly string[] = [
  "admin", "www", "api", "app", "mail", "smtp", "auth", "static", "assets", "status", "support",
  "araak", "send", "email", "docs", "help", "blog", "dev", "staging", "test", "preview",
  "cdn", "id", "login", "account", "dashboard", "billing",
];
