/**
 * Per-client white-label branding applied to the A4 PDF/Markdown exports.
 * Fail-closed: one validated brand per invitation, bounded strings, no
 * HTML or URLs (prevents injection into PDF text or metadata) and no metric
 * aggregation: the branded export is always exactly ONE saved snapshot
 * rendered in ONE language.
 */

export interface WhiteLabelBrand {
  name: string;
  tagline: string | null;
  accentColor: string | null;
}

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,&'’\-]*$/u;
const clean = (value: string): string => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const MAX_BRAND_JSON_CHARS = 300;

/**
 * Parses and validates a client brand, or returns null. Unknown keys are
 * rejected so a brand can never smuggle extra export options.
 */
export function parseBrand(input: unknown): WhiteLabelBrand | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  if (JSON.stringify(input).length > MAX_BRAND_JSON_CHARS) return null;
  const record = input as Record<string, unknown>;
  if (!("name" in record) || typeof record.name !== "string") return null;
  const name = clean(record.name);
  if (name.length < 2 || name.length > 60 || !NAME_PATTERN.test(name)) return null;
  let tagline: string | null = null;
  if (record.tagline !== undefined && record.tagline !== null) {
    if (typeof record.tagline !== "string") return null;
    tagline = clean(record.tagline);
    if (tagline.length < 1 || tagline.length > 140) return null;
  }
  let accentColor: string | null = null;
  if (record.accentColor !== undefined && record.accentColor !== null) {
    if (typeof record.accentColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(record.accentColor)) return null;
    accentColor = record.accentColor.toLowerCase();
  }
  const allowed = new Set(["name", "tagline", "accentColor"]);
  if (Object.keys(record).some(key => !allowed.has(key))) return null;
  return { name, tagline, accentColor };
}

/** Readable ink on a brand band: white on dark, dark ink on light. */
export function readableOn(background: string): string {
  const hex = background.replace("#", "");
  const [r, g, b] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.45 ? "#FFFFFF" : "#262144";
}

/** Slug for a branded download filename; always lowercase ASCII. */
export function brandSlug(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "marque";
}
