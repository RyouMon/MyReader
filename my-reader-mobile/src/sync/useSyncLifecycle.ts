import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useAppStore } from "../store/app-store";

import { runSync } from "./scheduler";

/**
 * Wire the foreground-triggered sync scheduler to app lifecycle events.
 *
 * - Fires `startup` once after store hydration completes.
 * - Fires `foreground` whenever the OS transitions active again from the
 *   background / inactive state.
 * - Respects `settings.syncEnabled`; the scheduler itself short-circuits
 *   disabled auto runs, this hook just avoids unnecessary work.
 */
export function useSyncLifecycle(): void {
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const hasRunStartup = useRef(false);
  const lastStateRef = useRef<AppStateStatus>(AppState.currentState ?? "active");

  useEffect(() => {
    if (!hasHydrated || hasRunStartup.current) return;
    hasRunStartup.current = true;
    void runSync("startup").catch((err) => {
      console.warn("[MyReader] startup sync failed", err);
    });
  }, [hasHydrated]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const prev = lastStateRef.current;
      lastStateRef.current = next;
      if (prev !== "active" && next === "active" && hasRunStartup.current) {
        void runSync("foreground").catch((err) => {
          console.warn("[MyReader] foreground sync failed", err);
        });
      }
    });
    return () => subscription.remove();
  }, []);
}
