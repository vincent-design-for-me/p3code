import {
  ServerNpmReleaseError,
  ServerNpmReleaseInput,
  type ServerNpmRelease,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

const decodeInput = Schema.decodeUnknownEffect(ServerNpmReleaseInput);

export class NpmRelease extends Context.Service<
  NpmRelease,
  {
    readonly get: (
      input: ServerNpmReleaseInput,
    ) => Effect.Effect<ServerNpmRelease | null, ServerNpmReleaseError>;
  }
>()("t3/cloud/npmRelease") {}

// The npm `t3` package is the official T3 Code build, so this fork never looks it up or installs it.
export const make = () =>
  Effect.succeed(
    NpmRelease.of({
      get: Effect.fn("NpmRelease.get")(function* (input) {
        yield* decodeInput(input).pipe(
          Effect.mapError(
            () => new ServerNpmReleaseError({ reason: "Invalid release version or track." }),
          ),
        );
        return yield* new ServerNpmReleaseError({
          reason: "P3 Code is not published to npm. Update it by building from source.",
        });
      }),
    }),
  );

export const layer = Layer.effect(NpmRelease, make());
