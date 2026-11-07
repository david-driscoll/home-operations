<script
  setup
  lang="ts">
import type { RegionExitView } from "#shared/types/regionExit";

/** The overview: every region exit, how it is, where it leaves from, who is on it and who last moved it. */
const { data, refresh } = await useFetch<{ checkedAt: string; regionExits: RegionExitView[] }>("/api/region-exits", { key: "overview" });
useAutoRefresh(refresh, 30000);
useHead({ title: "Region exits" });
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold">Region exits</h1>
      <p class="text-muted">Pick a region exit to see it, or to see what still works when it is offline. Everyone using a region exit moves with it.</p>
    </header>

    <ul class="grid gap-3">
      <li
        v-for="exit in data?.regionExits ?? []"
        :key="exit.name"
        :data-region-exit="exit.name">
        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <NuxtLink
              :to="`/${exit.name}`"
              class="text-lg font-medium text-primary hover:underline"
              >{{ exit.name }}</NuxtLink
            >
            <AvailabilityBadge
              :name="exit.name"
              :availability="exit.availability" />
          </div>
          <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt class="text-muted">Region</dt>
            <dd>{{ exit.availability.state === "unreachable" ? "unknown" : describeRegion(exit.region) }}</dd>
            <dt class="text-muted">People on it</dt>
            <dd>{{ exit.activeClients === null ? "unknown" : peopleCount(exit.activeClients) }}</dd>
            <dt class="text-muted">Last moved</dt>
            <dd><LastMoved :last-move="exit.lastMove" /></dd>
          </dl>
        </UCard>
      </li>
    </ul>

    <p
      v-if="data"
      class="text-sm text-muted">
      Last checked <time :datetime="data.checkedAt">{{ easternTime(data.checkedAt) }}</time>. This page checks again every 30 seconds.
    </p>
  </div>
</template>
