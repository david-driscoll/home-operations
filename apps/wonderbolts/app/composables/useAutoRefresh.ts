/**
 * Calls `refresh` every `intervalMs` while the tab is visible, and once when
 * it becomes visible again, so a page left open shows the region exits as
 * they are rather than as they were.
 */
export function useAutoRefresh(refresh: () => Promise<unknown>, intervalMs: number, paused: () => boolean = () => false): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  const visible = () => document.visibilityState === "visible";
  const tick = () => {
    if (visible() && !paused()) void refresh();
  };
  onMounted(() => {
    timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", tick);
  });
}
