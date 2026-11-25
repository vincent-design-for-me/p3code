import Constants from "expo-constants";
import { relayClerkTokenOptions } from "@t3tools/shared/relayAuth";
import { normalizeSecureRelayUrl } from "@t3tools/shared/relayUrl";
import * as Schema from "effect/Schema";

export class CloudPublicConfigMissingError extends Schema.TaggedError<CloudPublicConfigMissingError>()(
  "CloudPublicConfigMissingError",
  {
    key: Schema.Literal("T3CODE_CLERK_JWT_TEMPLATE"),
  },
) {
  override get message(): string {
    return `${this.key} is not configured.`;
  }
}

export interface CloudPublicConfig {
  readonly clerk: {
    readonly publishableKey: string | null;
    readonly jwtTemplate: string | null;
  };
  readonly relay: {
    readonly url: string | null;
  };
}

type UntrustedSection<T> = {
  readonly [Key in keyof T]?: unknown;
};

type ExpoExtra =
  | {
      readonly [Section in keyof CloudPublicConfig]?: UntrustedSection<CloudPublicConfig[Section]>;
    }
  | undefined;

function trimNonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveCloudPublicConfig(extra: ExpoExtra = Constants.expoConfig?.extra) {
  return {
    clerk: {
      publishableKey: trimNonEmpty(extra?.clerk?.publishableKey),
      jwtTemplate: trimNonEmpty(extra?.clerk?.jwtTemplate),
    },
    relay: {
      url: normalizeSecureRelayUrl(trimNonEmpty(extra?.relay?.url) ?? ""),
    },
  } satisfies CloudPublicConfig;
}

/** T3 Connect needs Clerk sign-in, which this build does not include, so it is never configured. */
export function hasCloudPublicConfig(): boolean {
  return false;
}

export function resolveRelayClerkTokenOptions() {
  const { jwtTemplate } = resolveCloudPublicConfig().clerk;
  if (!jwtTemplate) {
    throw new CloudPublicConfigMissingError({ key: "T3CODE_CLERK_JWT_TEMPLATE" });
  }
  return relayClerkTokenOptions(jwtTemplate);
}
