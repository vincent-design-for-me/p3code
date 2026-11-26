// Same rule as apps/web/src/components/p3/branding/brandCopy.ts, for the main process's own copy.
const UPSTREAM_PRODUCT_NAME = /\bT3\b(?! Chat\b| Connect\b| Tools\b)/g;

// Off under Vitest, where tests assert upstream's English.
const enabled = process.env.VITEST === undefined;

export function brandCopy(text: string): string {
  return enabled ? text.replace(UPSTREAM_PRODUCT_NAME, "P3") : text;
}
