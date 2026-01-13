<template>
  <div class="info-row">
    <span class="label">{{ label }}</span>
    <span :class="['value', badgeClass]">{{ value || 'N/A' }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  value?: string;
  badge?: 'success' | 'warning' | 'error';
}>();

const badgeClass = computed(() => props.badge ? `badge badge-${props.badge}` : '');
</script>
