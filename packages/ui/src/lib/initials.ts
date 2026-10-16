const graphemes = (s: string): string[] =>
  Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s), (part) => part.segment);

/**
 * Up to two letters for an avatar: the first letter of the first and last name (an Arabic family name's leading
 * definite article «ال» is skipped, so «أحمد النويري» gives «أن»), else the first two letters of the fallback.
 */
export function initials(firstName: string | null | undefined, lastName: string | null | undefined, fallback: string): string {
  const first = firstName?.trim();
  const last = lastName?.trim().replace(/^ال(?=\p{L}{2})/u, "");
  if (first && last) return `${graphemes(first)[0] ?? ""}${graphemes(last)[0] ?? ""}`;
  return graphemes(fallback.trim()).slice(0, 2).join("").toUpperCase();
}
