<script
  setup
  lang="ts">
import type { Region } from "#shared/types/regionExit";

/** Asked when people are on the region exit: moving it moves them. */
const props = defineProps<{ name: string; region: Region | null; activeClients: number | null; moving: boolean }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ confirm: [] }>();
const title = computed(() => `Move ${props.name} to ${describeRegion(props.region)}?`);
const cancel = () => {
  open.value = false;
};
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title">
    <template #body>
      <p>{{ describePeople(name, activeClients) }} Everyone using it moves with it.</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          label="Cancel"
          @click="cancel" />
        <UButton
          color="warning"
          label="Move anyway"
          :loading="moving"
          @click="emit('confirm')" />
      </div>
    </template>
  </UModal>
</template>
