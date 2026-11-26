import { useEffect } from "react";
import { create } from "zustand";

/** How many thread details cards are on screen. The quota rail lives outside the chat canvas. */
export const useThreadDetailsOnScreen = create<{ readonly count: number }>(() => ({ count: 0 }));

export function useReportThreadDetailsOnScreen(onScreen: boolean) {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes whether the card is shown to the quota rail, which renders outside the chat canvas
  useEffect(() => {
    if (!onScreen) return;
    useThreadDetailsOnScreen.setState((state) => ({ count: state.count + 1 }));
    return () => useThreadDetailsOnScreen.setState((state) => ({ count: state.count - 1 }));
  }, [onScreen]);
}
