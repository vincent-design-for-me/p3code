// P3 builds alias "gt-react" to this module (see brandVitePlugin.ts). English renders source
// text without a catalog, so its product name is rewritten here; other locales rewrite their
// catalogs on load. Lookups still hash the original English, so catalog keys keep matching.
import {
  Currency,
  DateTime,
  Num,
  RelativeTime,
  T as GtT,
  Var,
  decodeMsg as gtDecodeMsg,
  gtFallback as gtGtFallback,
  useDefaultLocale,
  useGT as gtUseGT,
  useLocale,
  useMessages as gtUseMessages,
} from "gt-react";
import {
  cloneElement,
  createElement,
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from "react";

import { brandCopy } from "./brandCopy";

export * from "gt-react";

const VARIABLE_COMPONENTS = new Set<unknown>([Var, Num, Currency, DateTime, RelativeTime]);

function brandNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return brandCopy(node);
  if (Array.isArray(node)) return node.map(brandNode);
  if (!isValidElement<Record<string, unknown>>(node) || VARIABLE_COMPONENTS.has(node.type)) {
    return node;
  }
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.props)) {
    // Plural and Branch carry copy in props as well as children.
    if (key !== "key" && key !== "ref" && (typeof value === "string" || isValidElement(value))) {
      props[key] = brandNode(value as ReactNode);
    }
  }
  const children = node.props.children as ReactNode;
  // Spread arrays back as separate children so React does not treat them as a keyed list.
  return children === undefined
    ? cloneElement(node, props)
    : cloneElement(node, props, ...spreadChildren(brandNode(children)));
}

function spreadChildren(node: ReactNode): ReactNode[] {
  return Array.isArray(node) ? node : [node];
}

function useIsSourceLocale(): boolean {
  return useLocale() === useDefaultLocale();
}

export function T(props: ComponentProps<typeof GtT>) {
  const sourceLocale = useIsSourceLocale();
  if (!sourceLocale) return <GtT {...props} />;
  const { children, ...rest } = props;
  return createElement(
    GtT,
    rest as ComponentProps<typeof GtT>,
    ...spreadChildren(brandNode(children)),
  );
}

export const useGT: typeof gtUseGT = () => {
  const gt = gtUseGT();
  const sourceLocale = useIsSourceLocale();
  if (!sourceLocale) return gt;
  // Reflect.apply keeps the GT scanner from reading this pass-through as a source string.
  return ((message: string, options?: Parameters<typeof gt>[1]) =>
    Reflect.apply(gt, undefined, [brandCopy(message), options])) as typeof gt;
};

export const useMessages: typeof gtUseMessages = () => {
  const resolve = gtUseMessages();
  const sourceLocale = useIsSourceLocale();
  if (!sourceLocale) return resolve;
  return ((...args: Parameters<typeof resolve>) => {
    const resolved = resolve(...args);
    return typeof resolved === "string" ? brandCopy(resolved) : resolved;
  }) as typeof resolve;
};

export const gtFallback: typeof gtGtFallback = (message, ...rest) =>
  gtGtFallback(typeof message === "string" ? brandCopy(message) : message, ...rest);

export const decodeMsg = ((encodedMsg: string | null | undefined) => {
  const decoded = gtDecodeMsg(encodedMsg);
  return typeof decoded === "string" ? brandCopy(decoded) : decoded;
}) as typeof gtDecodeMsg;
