<template>
  <header class="console-header">
    <div class="header-content">
      <div class="header-left">
        <svg class="icon-server-small" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
        </svg>
        <div>
          <h1 class="header-title">Redfish Explorer</h1>
          <p class="header-subtitle">{{ bmcUrl }}</p>
        </div>
      </div>
      <div class="header-right">
        <div class="scan-indicator" :class="{ 'is-active': activeFetches > 0 }">
          <span class="spinner" v-if="activeFetches > 0"></span>
          <span class="status-text">{{ statusMessage }}</span>
        </div>
        <button @click="handleLogout" class="btn-disconnect">Disconnect</button>
      </div>
    </div>

    <nav class="tab-nav">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        @click="$emit('change-tab', tab.id)"
        :class="['tab', { active: activeTab === tab.id }]"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        {{ tab.label }}
      </button>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { useRedfish } from '../composables/useRedfish';

defineProps<{
  activeTab: string;
}>();

defineEmits<{
  'change-tab': [tab: string];
}>();

const { logout, bmcUrl } = useRedfish();

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'hardware', label: 'Hardware', icon: '🖥️' },
  { id: 'fru', label: 'FRU Info', icon: '💾' },
  { id: 'remote', label: 'Remote Access', icon: '📺' },
  { id: 'users', label: 'Users', icon: '👤' },
  { id: 'bios', label: 'BIOS', icon: '⚙️' },
  { id: 'raw', label: 'Raw Data', icon: '🔍' },
];

function handleLogout() {
  if (confirm("Disconnect from BMC?")) {
    logout();
  }
}
</script>

