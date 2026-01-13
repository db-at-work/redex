<template>
  <div :class="['status-card', statusClass]">
    <div class="status-icon">{{ icon }}</div>
    <div class="status-label">{{ label }}</div>
    <div class="status-value">{{ value || 'Loading...' }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  icon: string;
  label: string;
  value?: string;
  status?: 'success' | 'warning' | 'error' | 'info';
}>();

const statusClass = computed(() => props.status || 'info');
</script>
