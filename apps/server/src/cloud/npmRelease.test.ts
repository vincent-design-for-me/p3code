import { expect, it } from "@effect/vitest";
import { ServerNpmReleaseError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as NpmRelease from "./npmRelease.ts";

// `make` needs no HttpClient or process runner, so the lookup cannot reach npm.
it.effect("never looks up the official npm package", () =>
  Effect.gen(function* () {
    const releases = yield* NpmRelease.make();
    const error = yield* releases.get({ spec: "latest" }).pipe(Effect.flip);
    expect(error).toBeInstanceOf(ServerNpmReleaseError);
    expect(error.reason).toContain("not published to npm");
  }),
);
