import { useCallback, useEffect, useState } from "react";
import {
  currentPushState,
  disablePush,
  enablePush,
  pushUnsupportedReason,
  type PushApp,
  type PushState,
} from "@/lib/push";

/** State + actions for an "Enable notifications" control. */
export function usePush(app: PushApp) {
  const [state, setState] = useState<PushState>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState(currentPushState());
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await enablePush(app);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications.");
    } finally {
      setState(currentPushState());
      setBusy(false);
    }
  }, [app]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await disablePush();
    } finally {
      setState(currentPushState());
      setBusy(false);
    }
  }, []);

  return {
    state,
    busy,
    error,
    enable,
    disable,
    unsupportedReason: state === "unsupported" ? pushUnsupportedReason() : null,
  };
}
