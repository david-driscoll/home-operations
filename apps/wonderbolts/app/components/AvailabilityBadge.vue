<script
  setup
  lang="ts">
import type { Availability } from "#shared/types/regionExit";

const props = defineProps<{ name: string; availability: Availability }>();
const label = computed(() => describeAvailability(props.name, props.availability).label);
const color = computed(() => availabilityColor(props.availability));
</script>

<template>
  <UBadge
    :color="color"
    variant="subtle"
    size="lg"
    :data-availability="availability.state"
    >{{ label }}</UBadge
  >
</template>
