<script
  setup
  lang="ts">
import type { LastMove } from "#shared/types/regionExit";

/** "Moved by Jamie, 2 hours ago", the Eastern time on hover; "Moved by unknown" when nobody is recorded. */
defineProps<{ lastMove: LastMove | null }>();
</script>

<template>
  <span data-testid="last-moved">
    {{ describeMover(lastMove?.by) }}
    <template v-if="lastMove"
      >,
      <NuxtTime
        :datetime="lastMove.at"
        relative
        :title="easternDateTime(lastMove.at)" /></template
    >
  </span>
</template>
