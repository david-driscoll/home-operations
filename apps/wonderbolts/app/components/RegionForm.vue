<script
  setup
  lang="ts">
import type { MoveDone, MoveNeedsConfirm, MoveRequest, Region, RegionChoice } from "#shared/types/regionExit";

/**
 * Moving a region exit: one-click countries, or a country and an optional
 * city. Shown to family and admins only; the server refuses anyone else
 * whatever this shows (server/api/region-exits/[name]/region.post.ts).
 */
const props = defineProps<{ name: string; current: Region | null; regions: RegionChoice[]; activeClients: number | null; disabled?: boolean }>();
const emit = defineEmits<{ moved: [region: Region] }>();

/** The city select's "no city" item: Reka's Select cannot hold an empty-string value. */
const ANY_CITY = "__any__";

const quickCountries = computed(() =>
  String(useRuntimeConfig().public.quickCountries)
    .split(",")
    .map(country => country.trim())
    .filter(country => props.regions.some(r => r.country === country)),
);

const offered = (country: string | undefined) => props.regions.find(r => r.country === country);
const country = ref<string | undefined>(offered(props.current?.country)?.country ?? props.regions[0]?.country);
const city = ref<string>(offered(props.current?.country) && props.current?.city ? props.current.city : ANY_CITY);

const countryItems = computed(() => props.regions.map(r => r.country));
const cityItems = computed(() => [{ label: "Any city", value: ANY_CITY }, ...(offered(country.value)?.cities ?? []).map(c => ({ label: c, value: c }))]);

watch(country, value => {
  // Back on the current country, its city again; anywhere else, any city.
  city.value = value === props.current?.country && props.current?.city ? props.current.city : ANY_CITY;
});

const moving = ref(false);
const confirming = ref<{ move: MoveRequest; activeClients: number | null } | null>(null);
const confirmOpen = computed({
  get: () => confirming.value !== null,
  set: open => {
    if (!open) confirming.value = null;
  },
});
const toast = useToast();

async function move(request: MoveRequest): Promise<void> {
  moving.value = true;
  try {
    const done = await $fetch<MoveDone>(`/api/region-exits/${props.name}/region`, { method: "POST", body: request });
    confirming.value = null;
    toast.add({ title: `Moving ${props.name} to ${describeRegion(done.region)}`, color: "success", icon: "i-lucide-plane" });
    emit("moved", done.region);
  } catch (error) {
    const reply = error as { status?: number; data?: Partial<MoveNeedsConfirm> & { statusMessage?: string; message?: string } };
    if (reply.status === 409 && reply.data?.confirm) {
      confirming.value = { move: { ...request, confirm: true }, activeClients: reply.data.activeClients ?? null };
    } else {
      confirming.value = null;
      toast.add({ title: `Could not move ${props.name}`, description: reply.data?.error ?? reply.data?.statusMessage ?? reply.data?.message ?? "Try again in a moment.", color: "error", icon: "i-lucide-triangle-alert" });
    }
  } finally {
    moving.value = false;
  }
}

const picked = (): MoveRequest => ({ country: country.value ?? "", city: city.value === ANY_CITY ? null : city.value });
const pickedRegion = computed<Region | null>(() => (confirming.value ? { country: confirming.value.move.country, city: confirming.value.move.city ?? null } : null));
</script>

<template>
  <section
    class="space-y-4"
    aria-labelledby="move-heading">
    <h2
      id="move-heading"
      class="text-lg font-semibold">
      Move {{ name }}
    </h2>

    <div
      v-if="quickCountries.length"
      class="flex flex-wrap gap-2">
      <UButton
        v-for="quick in quickCountries"
        :key="quick"
        :label="quick === current?.country ? `${quick} (current)` : quick"
        :variant="quick === current?.country ? 'solid' : 'outline'"
        :disabled="disabled || moving || quick === current?.country"
        :aria-current="quick === current?.country ? 'true' : undefined"
        @click="move({ country: quick, city: null })" />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField label="Country">
        <USelectMenu
          v-model="country"
          :items="countryItems"
          class="w-full"
          :disabled="disabled || moving" />
      </UFormField>
      <UFormField
        label="City"
        hint="Optional">
        <USelect
          v-model="city"
          :items="cityItems"
          class="w-full"
          :disabled="disabled || moving" />
      </UFormField>
    </div>

    <UButton
      :label="`Move ${name}`"
      :loading="moving"
      :disabled="disabled || !country"
      block
      @click="move(picked())" />
    <p class="text-sm text-muted">{{ describePeople(name, activeClients) }} Everyone using it moves with it.</p>

    <MoveConfirm
      v-model:open="confirmOpen"
      :name="name"
      :region="pickedRegion"
      :active-clients="confirming?.activeClients ?? null"
      :moving="moving"
      @confirm="confirming && move(confirming.move)" />
  </section>
</template>
