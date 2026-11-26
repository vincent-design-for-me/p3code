/**
 * Upstream copy names the product "T3" or "T3 Code"; P3 Code shows its own name instead.
 * T3 Chat, T3 Connect and T3 Tools are other products and keep their names.
 */
const UPSTREAM_PRODUCT_NAME = /\bT3\b(?! Chat\b| Connect\b| Tools\b)/g;

export function brandCopy(text: string): string {
  return text.replace(UPSTREAM_PRODUCT_NAME, "P3");
}

/** Rewrites every string inside a GT catalog entry; keys and ICU structure are untouched. */
function brandCatalogValue(value: unknown): unknown {
  if (typeof value === "string") return brandCopy(value);
  if (Array.isArray(value)) return value.map(brandCatalogValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, brandCatalogValue(entry)]),
    );
  }
  return value;
}

export function brandCatalog(catalog: unknown): unknown {
  if (catalog === null || typeof catalog !== "object") return catalog;
  return Object.fromEntries(
    Object.entries(catalog).map(([key, value]) => [key, brandCatalogValue(value)]),
  );
}
