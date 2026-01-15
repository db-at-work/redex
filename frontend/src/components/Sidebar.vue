<template>
  <nav class="sidebar">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      @click="$emit('change-tab', tab.id)"
      :class="['sidebar-tab', { active: activeTab === tab.id }]"
      :title="tab.label"
    >
      <span class="tab-icon">{{ tab.icon }}</span>
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
defineProps<{
  activeTab: string;
}>();

defineEmits<{
  'change-tab': [tab: string];
}>();

const tabs = [
  { id: 'raw', label: 'Raw Data', icon: '🔍' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'hardware', label: 'Hardware', icon: '🖥️' },
  { id: 'fru', label: 'FRU Info', icon: '💾' },
  { id: 'remote', label: 'Remote Access', icon: '📺' },
  { id: 'users', label: 'Users', icon: '👤' },
  { id: 'bios', label: 'BIOS', icon: '⚙️' },
];
</script>
