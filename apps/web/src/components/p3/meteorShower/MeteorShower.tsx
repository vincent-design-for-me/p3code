import "./meteorShower.css";

import type { CSSProperties } from "react";

import { useQuietThreadShells } from "../../../state/entities";
import { countWorkingThreads, meteorShowerFor } from "./meteorShower.logic";

/** Meteors over the sidebar header art while any thread works; more work, faster shower. */
export function MeteorShower() {
  const shower = meteorShowerFor(countWorkingThreads(useQuietThreadShells()));
  if (shower === null) return null;
  return (
    <div
      // A new level restarts the fall so meteors never jump mid-flight when the speed changes.
      key={shower.level}
      aria-hidden
      data-p3-meteor-shower=""
      style={{ "--p3-meteor-fall": `${shower.fallSeconds}s` } as CSSProperties}
    >
      {shower.meteors.map((meteor) => (
        <span
          key={meteor.x}
          data-p3-meteor=""
          style={
            {
              "--p3-meteor-x": `${meteor.x}%`,
              "--p3-meteor-delay": `${meteor.delaySeconds}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
