import { selectableProviderOptionChoices } from "@t3tools/client-runtime/model-traits";
import { useGT, useMessages } from "gt-react";

import {
  columnControls,
  EffortLevels,
  moveBetweenRows,
  NoEffortRow,
  OptionMenuRow,
  OptionSwitchRow,
} from "../../chat/ComposerModelEffort";
import {
  type TraitsSelectionInput,
  ULTRATHINK_IN_BODY_NOTE,
  useTraitsSelection,
} from "../../chat/TraitsPicker";
import { EffortSlider } from "./EffortSlider";

/** The compact picker's effort section: a slider for reasoning, other options folded below. */
export function CompactPickerEffort(props: { traits: TraitsSelectionInput | null }) {
  return props.traits ? <CompactPickerTraits traits={props.traits} /> : <NoEffortRow />;
}

function CompactPickerTraits(props: { traits: TraitsSelectionInput }) {
  const gt = useGT();
  const messages = useMessages();
  const traits = useTraitsSelection(props.traits);
  if (traits.modelIsUnavailable) return <EffortLevels traits={props.traits} />;
  const { effort, others } = columnControls(traits.selectDescriptors, traits.booleanDescriptors);
  if (!effort && others.length === 0) return <NoEffortRow />;
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
      />
    );
  } else if (effort) {
    const { descriptor } = effort;
    const options = selectableProviderOptionChoices(descriptor);
    slider =
      options.length > 0 ? (
        <EffortSlider
          // A model with other levels starts a fresh slider, so no drag preview carries over.
          key={`${descriptor.id}:${options.map((option) => option.id).join(",")}`}
          label={descriptor.label}
          options={options}
          selection={traits.selectValue(descriptor)}
          onCommit={(value) => traits.changeSelect(descriptor, value)}
          locked={locked}
          note={note}
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
