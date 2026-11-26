import * as NodeURL from "node:url";

import type { Plugin } from "vite";

const BRANDED_GT_REACT = NodeURL.fileURLToPath(new URL("./gtReactBranded.tsx", import.meta.url));

/**
 * Routes app imports of "gt-react" through gtReactBranded.tsx so English copy shows P3 Code.
 * Off under Vitest, where tests assert upstream's English.
 */
export function p3BrandPlugin(): Plugin {
  return {
    name: "p3-brand-copy",
    enforce: "pre",
    resolveId(source, importer) {
      if (source !== "gt-react" || process.env.VITEST || importer === BRANDED_GT_REACT) return null;
      return BRANDED_GT_REACT;
    },
  };
}
