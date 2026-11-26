import "./autoHideScrollbar.css";

const SCROLLBAR_LINGER_MS = 550;
const hideTimers = new WeakMap<HTMLElement, number>();

/** Shows the scrollbar of an element styled by autoHideScrollbar.css until it stops scrolling. */
export function flashScrollbar(element: HTMLElement | null | undefined) {
  if (!element) return;
  const pending = hideTimers.get(element);
  if (pending === undefined) element.toggleAttribute("data-scrolling", true);
  else window.clearTimeout(pending);
  hideTimers.set(
    element,
    window.setTimeout(() => {
      hideTimers.delete(element);
      element.toggleAttribute("data-scrolling", false);
    }, SCROLLBAR_LINGER_MS),
  );
}
