<script
  setup
  lang="ts">
import type { RegionChoice, RegionExitView } from "#shared/types/regionExit";

/** One region exit: how it is, what still works, who last moved it, and (family and admins) moving it. */
const route = useRoute();
const name = String(route.params.name);

const { data: viewer } = await useViewer();
const { data, refresh, error } = await useFetch<{ checkedAt: string; view: RegionExitView }>(`/api/region-exits/${name}`, { key: `region-exit-${name}` });
if (error.value) throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true });
const { data: regions } = await useFetch<RegionChoice[]>(`/api/region-exits/${name}/regions`, { key: `regions-${name}`, default: () => [] });

const view = computed(() => data.value?.view);
const availability = computed(() => (view.value ? describeAvailability(name, view.value.availability) : null));
const reconnect = useReconnect(() => view.value, refresh);
useAutoRefresh(refresh, 30000, () => reconnect.busy.value);
useHead({ title: `${name} region` });

const tunnel = computed(() => {
  const t = view.value?.tunnel;
  if (!t) return "unknown";
  return t.up ? "connected" : `not connected${t.status ? ` (${t.status})` : ""}`;
});
const egress = computed(() => {
  const e = view.value?.egress;
  if (!e) return "unknown";
  return (e.city ? `${e.city}, ` : "") + (e.country ?? "an unknown country");
});
</script>

<template>
  <div
    v-if="view && availability"
    class="space-y-6">
    <NuxtLink
      to="/"
      class="text-sm text-muted hover:underline"
      >&larr; All region exits</NuxtLink
    >
    <h1 class="text-2xl font-semibold">{{ name }}</h1>

    <UAlert
      :color="availabilityColor(view.availability)"
      variant="subtle"
      :title="availability.label"
      :description="availability.detail"
      data-testid="availability" />

    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt class="text-muted">Region</dt>
      <dd class="font-medium">{{ describeRegion(view.region) }}</dd>
      <dt class="text-muted">Tunnel</dt>
      <dd>{{ tunnel }}</dd>
      <dt class="text-muted">Traffic leaves from</dt>
      <dd>{{ egress }}</dd>
      <dt class="text-muted">People on it</dt>
      <dd>{{ describePeople(name, view.activeClients) }}</dd>
      <dt class="text-muted">Last moved</dt>
      <dd><LastMoved :last-move="view.lastMove" /></dd>
    </dl>

    <UAlert
      v-if="reconnect.state.value.phase === 'reconnecting'"
      color="info"
      variant="soft"
      icon="i-lucide-loader-circle"
      :title="`Reconnecting ${name} in ${describeRegion(reconnect.state.value.to)}`"
      description="This usually takes a few seconds." />
    <UAlert
      v-else-if="reconnect.state.value.phase === 'done'"
      color="success"
      variant="soft"
      icon="i-lucide-check"
      :title="`${name} now leaves from ${describeRegion(reconnect.state.value.to)}`" />
    <UAlert
      v-else-if="reconnect.state.value.phase === 'slow'"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="`${name} has not reconnected in ${describeRegion(reconnect.state.value.to)} yet`"
      description="It has been a minute. Reload to check again, or tell David if it stays like this." />

    <RegionForm
      v-if="viewer.canMove"
      :name="name"
      :current="view.region"
      :regions="regions"
      :active-clients="view.activeClients"
      :disabled="reconnect.busy.value"
      @moved="reconnect.start" />
    <UAlert
      v-else
      color="neutral"
      variant="soft"
      icon="i-lucide-lock"
      title="Only family can move region exits."
      description="Ask David or family to move this one."
      data-testid="friend-note" />
  </div>
</template>
