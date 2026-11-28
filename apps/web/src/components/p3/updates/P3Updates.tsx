import { msg, T, useGT } from "gt-react";
import { DownloadIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { APP_VERSION } from "~/branding";
import { m } from "~/i18n/messages";
import { SettingsRow } from "../../settings/settingsLayout";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { toastManager } from "../../ui/toast";
import {
  checkForP3Release,
  type P3ReleaseCheck,
  readLaunchCheckPreference,
  useP3ReleaseCheck,
  writeLaunchCheckPreference,
} from "./releaseCheck";

async function openRelease(url: string) {
  try {
    if (await window.desktopBridge?.openExternal(url)) return;
  } catch {}
  toastManager.add({ type: "error", title: m(msg("Unable to open the download page")) });
}

function failureMessage(check: P3ReleaseCheck) {
  if (check.status !== "failed") return null;
  return check.reason === "rate-limited"
    ? m(msg("GitHub is limiting update checks for now. Try again later."))
    : m(msg("Could not reach GitHub to check for updates."));
}

/** The version row's button: checks GitHub, then downloads the newer DMG it found. */
export function P3UpdateButton(props: { onCheck: () => void }) {
  const gt = useGT();
  const check = useP3ReleaseCheck();
  if (check.status === "available") {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => void openRelease(check.release.downloadUrl)}
      >
        <DownloadIcon aria-hidden />
        {gt("Download {version}", { version: check.release.version })}
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={check.status === "checking"}
      onClick={() => {
        props.onCheck();
        void checkForP3Release(APP_VERSION).then((result) => {
          const message = failureMessage(result);
          if (message) {
            toastManager.add({
              type: "error",
              title: gt("Could not check for updates"),
              description: message,
            });
          }
        });
      }}
    >
      {check.status === "checking"
        ? gt("Checking…")
        : check.status === "up-to-date"
          ? gt("Up to Date")
          : gt("Check for Updates")}
    </Button>
  );
}

export function P3UpdateDescription() {
  const gt = useGT();
  const check = useP3ReleaseCheck();
  if (check.status !== "available") return gt("Current version of the application.");
  const { version, notesUrl } = check.release;
  return (
    <>
      {gt("P3 Code {version} is available.", { version })}{" "}
      {gt("Download it, then drag it into Applications to replace this one.")}{" "}
      <button
        type="button"
        className="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-foreground"
        onClick={() => void openRelease(notesUrl)}
      >
        {gt("What's new")}
      </button>
    </>
  );
}

export function P3LaunchCheckRow() {
  const gt = useGT();
  const [enabled, setEnabled] = useState(readLaunchCheckPreference);
  return (
    <SettingsRow
      title={gt("Check for updates on launch")}
      description={<T>Asks GitHub for the latest P3 Code release once each time the app starts.</T>}
      control={
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            writeLaunchCheckPreference(checked);
            setEnabled(checked);
          }}
          aria-label={gt("Check for updates on launch")}
        />
      }
    />
  );
}

let launchChecked = false;

/** Checks once per app start when the user turned that on, and offers a newer DMG. */
export function P3ReleaseLaunchCheck() {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- one GitHub request at startup, never repeated
  useEffect(() => {
    if (launchChecked || !window.desktopBridge || !readLaunchCheckPreference()) return;
    launchChecked = true;
    void checkForP3Release(APP_VERSION).then((result) => {
      if (result.status !== "available") return;
      const { version, downloadUrl, notesUrl } = result.release;
      const id = toastManager.add({
        title: m(msg("P3 Code {version} is available", { version })),
        description: m(msg("Download it, then drag it into Applications to replace this one.")),
        timeout: 0,
        actionProps: {
          children: m(msg("Download")),
          onClick: () => {
            void openRelease(downloadUrl);
            toastManager.close(id);
          },
        },
        data: {
          actionLayout: "stacked-end",
          leadingIcon: <DownloadIcon aria-hidden className="size-4 text-muted-foreground" />,
          secondaryActionProps: {
            children: m(msg("What's new")),
            onClick: () => void openRelease(notesUrl),
          },
          secondaryActionVariant: "ghost",
        },
      });
    });
  }, []);
  return null;
}
