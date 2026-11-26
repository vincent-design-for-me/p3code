import { brandCopy } from "./brandCopy";

/**
 * The boot failure page renders before GT, so its copy is rebranded after it mounts. P3 has no
 * triage: `t3 triage` would file reports into upstream's tracker, so that step is removed.
 */
export function brandBootErrorPage() {
  if (typeof document === "undefined") return;
  const page = document.getElementById("boot-error");
  if (!page) return;
  document.getElementById("boot-error-command")?.parentElement?.remove();
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    node.textContent = brandCopy(node.textContent ?? "");
  }
  for (const link of page.querySelectorAll("a")) link.href = brandCopy(link.href);
}
