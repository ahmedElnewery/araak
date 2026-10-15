/** research.md R-02: at least 8 characters with lowercase, uppercase and digits (mirrors the Supabase Auth setting). */
export function checkPasswordPolicy(p: string): boolean {
  return p.length >= 8 && p.length <= 256 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p);
}
