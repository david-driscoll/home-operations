import type { Region, RegionExitView } from "#shared/types/regionExit";

/** How often a moved region exit is asked whether it has reconnected. */
export const RECONNECT_POLL_MS = 4000;
/** After this long without reconnecting, the page says so and stops asking. */
export const RECONNECT_WARN_MS = 60000;

export type ReconnectState = { phase: "idle" } | { phase: "reconnecting"; to: Region } | { phase: "done"; to: Region } | { phase: "slow"; to: Region };

/**
 * After a move: asks the region exit every few seconds until its tunnel is up
 * and traffic leaves from the new country (isConnectedTo), or a minute has
 * gone by.
 */
export function useReconnect(view: () => RegionExitView | undefined, refresh: () => Promise<unknown>) {
  const state = ref<ReconnectState>({ phase: "idle" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  async function check(to: Region, since: number): Promise<void> {
    await refresh();
    if (isConnectedTo(view(), to)) {
      state.value = { phase: "done", to };
      return;
    }
    if (Date.now() - since >= RECONNECT_WARN_MS) {
      state.value = { phase: "slow", to };
      return;
    }
    timer = setTimeout(() => void check(to, since), RECONNECT_POLL_MS);
  }

  function start(to: Region): void {
    stop();
    state.value = { phase: "reconnecting", to };
    const since = Date.now();
    timer = setTimeout(() => void check(to, since), RECONNECT_POLL_MS);
  }

  onBeforeUnmount(stop);
  return { state, start, busy: computed(() => state.value.phase === "reconnecting") };
}
