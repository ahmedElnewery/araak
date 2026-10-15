// WCAG 2.2 AA contrast check for the fixed palette in packages/ui/src/styles/globals.css (docs/decisions/branding.md).
import { readFileSync } from "node:fs";

const css = readFileSync("packages/ui/src/styles/globals.css", "utf8");
const block = (selector) => {
  const m = new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`block ${selector} not found`);
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
};
const themes = { light: block(":root"), dark: { ...block(":root"), ...block(".dark") } };

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum ratio, description]
const pairs = [
  ["text", "bg", 4.5, "body text on page"], ["text", "card", 4.5, "body text on card"], ["text", "sidebar", 4.5, "text on sidebar"],
  ["text", "secondary-bg", 4.5, "text on secondary surface"], ["muted", "bg", 4.5, "muted text on page"], ["muted", "card", 4.5, "muted text on card"],
  ["subtle", "bg", 4.5, "subtle text on page"], ["subtle", "card", 4.5, "subtle text on card"], ["accent", "card", 4.5, "accent text/link on card"],
  ["accent-strong", "card", 4.5, "strong accent on card"], ["on-accent", "accent", 4.5, "button text on accent"], ["on-danger", "danger", 4.5, "text on danger"],
  ["danger", "card", 4.5, "danger text on card"], ["input-border", "card", 3, "input border vs card (non-text)"], ["input-border", "bg", 3, "input border vs page (non-text)"],
  ["focus-ring", "bg", 3, "focus ring vs page"], ["focus-ring", "card", 3, "focus ring vs card"],
];

let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  const resolve = (k) => {
    let v = t[k];
    while (v?.startsWith("var(")) v = t[v.slice(6, -1)];
    return v;
  };
  for (const [fg, bg, min, what] of pairs) {
    const r = ratio(resolve(fg), resolve(bg));
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(5)} ${what.padEnd(36)} ${r.toFixed(2)} (min ${min})`);
  }
}
process.exit(failed ? 1 : 0);
