import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRealtimeStore } from "../stores/realtimeStore";
import { ensureRealtimeListener } from "../services/realtimeListener";
import type { ConnectionStatus } from "../types/app";

/**
 * Manages the realtime ECU data stream lifecycle.
 *
 * Architecture: The Tauri event listener is registered ONCE at module level
 * (ensureRealtimeListener) and never unregistered. This eliminates all race
 * conditions that plagued the previous approach where listen()/unlisten() was
 * done inside useEffect — React 18 StrictMode's mount→cleanup→mount cycle
 * caused two concurrent stop_realtime_stream IPC calls that non-deterministically
 * killed the freshly started stream.
 *
 * The effect's only job is to start the backend stream (which always replaces any
 * existing task) and clear channels on cleanup.
 */
export function useRealtimeStream(
  status: ConnectionStatus,
  fetchRealtimeData: () => Promise<void>,
): void {
  useEffect(() => {
    console.log(`[Stream effect] status.state=${status.state} has_definition=${status.has_definition}`);
    let pollIntervalHandle: NodeJS.Timeout | null = null;
    let heartbeatHandle: NodeJS.Timeout | null = null;
    let cancelled = false;

    if (status.state === "Connected" && status.has_definition) {
      console.log("[Stream effect] Condition met, starting IIFE");
      (async () => {
        console.log("[Stream effect] Registering listener...");
        await ensureRealtimeListener();
        if (cancelled) {
          console.log("[Stream effect] cancelled after listener");
          return;
        }

        try {
          console.log("[Stream effect] Calling start_realtime_stream...");
          await invoke("start_realtime_stream", { intervalMs: 50 });
          console.log("[Stream effect] Stream started successfully");
        } catch (e) {
          console.warn("Realtime stream failed, falling back to polling with backoff:", e);
          if (cancelled) return;
          let pollInterval = 500;
          let failureCount = 0;
          const maxInterval = 2000;

          const startPolling = () => {
            pollIntervalHandle = setInterval(async () => {
              try {
                await fetchRealtimeData();
                if (pollInterval > 100) {
                  pollInterval = Math.max(100, pollInterval / 1.5);
                  if (pollIntervalHandle) clearInterval(pollIntervalHandle);
                  startPolling();
                }
                failureCount = 0;
              } catch {
                failureCount++;
                if (failureCount >= 3) {
                  pollInterval = Math.min(maxInterval, pollInterval * 1.5);
                  if (pollIntervalHandle) clearInterval(pollIntervalHandle);
                  startPolling();
                  failureCount = 0;
                }
              }
            }, pollInterval);
          };

          startPolling();
        }

        // Heartbeat: if no store update arrives for 2 seconds, restart the stream.
        // Add cooldown to prevent thundering herd (max one restart per 10 seconds).
        let lastRestartTime = 0;
        heartbeatHandle = setInterval(() => {
          if (cancelled) return;
          const lastUpdate = useRealtimeStore.getState().lastUpdateTime;
          const now = Date.now();
          if (lastUpdate > 0 && now - lastUpdate > 2000 && now - lastRestartTime > 10000) {
            console.warn("[Heartbeat] No realtime update for 2s, restarting stream (cooldown 10s)");
            lastRestartTime = now;
            invoke("start_realtime_stream", { intervalMs: 50 }).catch(() => {});
          }
        }, 2000);
      })();
    }

    return () => {
      console.log("[Stream effect] CLEANUP running");
      cancelled = true;
      if (pollIntervalHandle) clearInterval(pollIntervalHandle);
      if (heartbeatHandle) clearInterval(heartbeatHandle);
      useRealtimeStore.getState().clearChannels();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.state, status.has_definition]);
}
