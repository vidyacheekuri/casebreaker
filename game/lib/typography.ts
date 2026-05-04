/**
 * Semantic typography tokens → Tailwind utilities (see app/tailwind.config.ts).
 * Prefer these class strings for consistent, themeable text sizing.
 */
export const FONT_SIZES = {
  heading: "text-h1",
  subheading: "text-h2",
  body: "text-body",
  caption: "text-caption",
  label: "text-label",
  detail: "text-detail",
} as const;

export type FontSizeToken = keyof typeof FONT_SIZES;
