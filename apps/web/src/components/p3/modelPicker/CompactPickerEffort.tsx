import { selectableProviderOptionChoices } from "@t3tools/client-runtime/model-traits";
import { useGT, useMessages } from "gt-react";

import {
  columnControls,
  EffortLevels,
  moveBetweenRows,
  NoEffortRow,
  OptionMenuRow,
  OptionSwitchRow,
  splitSpeed,
} from "../../chat/ComposerModelEffort";
import {
  type TraitsSelectionInput,
  ULTRATHINK_IN_BODY_NOTE,
  useTraitsSelection,
} from "../../chat/TraitsPicker";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import { cn } from "~/lib/utils";
import { EffortSlider } from "./EffortSlider";
import { FlashGlyph } from "./FlashGlyph";

type TraitsSelection = ReturnType<typeof useTraitsSelection>;

/** P3 hides Codex's Cyber Access (Daybreak); unset, the server sends the model's default program. */
const HIDDEN_OPTION_IDS = new Set(["cyberAccessProgram"]);

const ULTRA_EFFORT = "xhigh";
/** The slider's own id for Ultra, which no provider level can take. */
const ULTRA_LEVEL = "p3:ultra";

/** The compact picker's effort section: a slider for reasoning, other options folded below. */
export function CompactPickerEffort(props: { traits: TraitsSelectionInput | null }) {
  return props.traits ? <CompactPickerTraits traits={props.traits} /> : <NoEffortRow />;
}

function CompactPickerTraits(props: { traits: TraitsSelectionInput }) {
  const gt = useGT();
  const messages = useMessages();
  const traits = useTraitsSelection(props.traits);
  if (traits.modelIsUnavailable) return <EffortLevels traits={props.traits} />;
  const columns = columnControls(traits.selectDescriptors, traits.booleanDescriptors);
  const { effort } = columns;
  const others = columns.others.filter((control) => !HIDDEN_OPTION_IDS.has(control.descriptor.id));
  const speed = <SpeedBolt traits={traits} />;
  const fast = isFast(traits);
  if (!effort && others.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2">
        <NoEffortRow />
        {speed}
      </div>
    );
  }
  const locked =
    effort?.descriptor.id === traits.primarySelectDescriptor?.id && traits.ultrathinkInBodyText;
  const note = locked ? messages(ULTRATHINK_IN_BODY_NOTE) : null;

  let slider = null;
  if (effort?.kind === "boolean") {
    const { descriptor } = effort;
    slider = (
      <EffortSlider
        key={descriptor.id}
        label={descriptor.label}
        options={[
          { id: false, label: gt("Off", { $context: "option state" }) },
          { id: true, label: gt("On", { $context: "option state" }) },
        ]}
        selection={descriptor.currentValue === true}
        onCommit={(value) => traits.changeBoolean(descriptor.id, value)}
        locked={locked}
        note={note}
        accessory={speed}
        fast={fast}
      />
    );
  } else if (effort) {
    const { descriptor } = effort;
    const { ultracodeToggle } = splitSpeed(traits.selectDescriptors, traits.booleanDescriptors);
    const levels = selectableProviderOptionChoices(descriptor);
    // Ultracode tops the levels as Ultra: it runs at Extra High, the level the server split it from.
    const ultra =
      ultracodeToggle && levels.some((option) => option.id === ULTRA_EFFORT)
        ? ultracodeToggle
        : null;
    const ultracodeOn = ultra?.currentValue === true;
    const current = traits.selectValue(descriptor);
    // Ultracode set beside another level (older builds, mobile) shows that level, so Ultra can fix it.
    const ultraOn = ultracodeOn && current === ULTRA_EFFORT;
    const options = ultra
      ? [
          ...levels,
          {
            id: ULTRA_LEVEL,
            label: gt("Ultra", { $context: "top reasoning level, which runs Ultracode" }),
          },
        ]
      : levels;
    const commit = (value: string) => {
      if (!ultra) return traits.changeSelect(descriptor, value);
      if (value === ULTRA_LEVEL) {
        return traits.changeSelect(descriptor, ULTRA_EFFORT, [[ultra.id, true]]);
      }
      traits.changeSelect(descriptor, value, ultracodeOn ? [[ultra.id, false]] : []);
    };
    slider =
      options.length > 0 ? (
        <EffortSlider
          // A model with other levels starts a fresh slider, so no drag preview carries over.
          key={`${descriptor.id}:${options.map((option) => option.id).join(",")}`}
          label={descriptor.label}
          options={options}
          selection={ultraOn ? ULTRA_LEVEL : current}
          onCommit={commit}
          locked={locked}
          note={note}
          accessory={speed}
          fast={fast}
        />
      ) : null;
  }

  return (
    <>
      {slider}
      {others.length > 0 ? (
        <details open={!slider || undefined}>
          <summary className="cursor-pointer py-1 text-2xs text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground">
            {gt("Options", { $context: "heading for model options" })}
          </summary>
          <div
            className="flex max-h-32 flex-col gap-0.5 overflow-y-auto overscroll-contain pb-1"
            // Capture, so Up and Down on an option row move rows instead of opening its menu.
            onKeyDownCapture={moveBetweenRows}
          >
            {others.map((control, index) =>
              control.kind === "boolean" ? (
                <OptionSwitchRow
                  key={control.descriptor.id}
                  descriptor={control.descriptor}
                  traits={traits}
                  tabStop={index === 0}
                />
              ) : (
                <OptionMenuRow
                  key={control.descriptor.id}
                  descriptor={control.descriptor}
                  traits={traits}
                  tabStop={index === 0}
                />
              ),
            )}
          </div>
        </details>
      ) : null}
    </>
  );
}

const FAST_SPEEDS = new Set(["Fast", "Ultrafast"]);

/** Whether a fast service tier or Claude's Fast mode is on. */
function isFast(traits: TraitsSelection) {
  const { speedSelect, fastToggle } = splitSpeed(
    traits.selectDescriptors,
    traits.booleanDescriptors,
  );
  if (!speedSelect) return fastToggle?.currentValue === true;
  const options = selectableProviderOptionChoices(speedSelect);
  const current =
    options.find((option) => option.id === traits.selectValue(speedSelect)) ?? options[0];
  return current !== undefined && FAST_SPEEDS.has(current.label);
}

/**
 * The model's speed as one bolt beside the effort: each press moves to the next tier, or flips
 * Claude's Fast mode. Filled while a fast tier is on.
 */
function SpeedBolt(props: { traits: TraitsSelection }) {
  const gt = useGT();
  const { traits } = props;
  const { speedSelect, fastToggle } = splitSpeed(
    traits.selectDescriptors,
    traits.booleanDescriptors,
  );
  if (speedSelect) {
    const options = selectableProviderOptionChoices(speedSelect);
    if (options.length < 2) return null;
    const current = Math.max(
      0,
      options.findIndex((option) => option.id === traits.selectValue(speedSelect)),
    );
    const option = options[current]!;
    const next = options[(current + 1) % options.length]!;
    return (
      <BoltButton
        label={speedSelect.label}
        value={option.label}
        // Tier names come from the provider untranslated, as the footer's bolt also assumes.
        speed={option.label}
        description={option.description}
        onPress={() => traits.changeSelect(speedSelect, next.id)}
      />
    );
  }
  if (fastToggle) {
    const on = fastToggle.currentValue === true;
    return (
      <BoltButton
        label={fastToggle.label}
        value={
          on
            ? gt("Fast", { $context: "response speed" })
            : gt("Standard", { $context: "response speed" })
        }
        speed={on ? "Fast" : "Standard"}
        onPress={() => traits.changeBoolean(fastToggle.id, !on)}
      />
    );
  }
  return null;
}

function BoltButton(props: {
  label: string;
  value: string;
  speed: string;
  description?: string | undefined;
  onPress: () => void;
}) {
  const fast = FAST_SPEEDS.has(props.speed);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-compact-picker-speed
            aria-label={`${props.label}: ${props.value}`}
            aria-pressed={fast}
            data-on={fast || undefined}
            className={cn(
              "relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              !fast && "text-muted-foreground hover:bg-foreground/8 hover:text-foreground",
            )}
            onClick={props.onPress}
          />
        }
      >
        {fast ? <span aria-hidden="true" data-flash-glow className="absolute inset-0" /> : null}
        <FlashGlyph ultra={props.speed === "Ultrafast"} />
      </TooltipTrigger>
      <TooltipPopup side="top">
        <span className="font-medium">{props.value}</span>
        {props.description ? ` · ${props.description}` : null}
      </TooltipPopup>
    </Tooltip>
  );
}
