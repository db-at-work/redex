<template>
  <header class="console-header">
    <div class="header-content">
      <div class="header-left">
        <svg class="icon-server-small" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="7" rx="2" ry="2"></rect>
          <rect x="2" y="14" width="20" height="7" rx="2" ry="2"></rect>
        </svg>
        <h1 class="header-title">Redfish Explorer</h1>
        <p class="header-subtitle">{{ bmcUrl }}</p>
      </div>

      <div class="header-right">
        <div class="scan-indicator" :class="{ 'is-active': activeFetches > 0 }">
          <span class="spinner" v-if="activeFetches > 0"></span>
          <span class="status-text">{{ statusMessage }}</span>
        </div>

        <div class="session-status" :class="sessionHealthy ? 'healthy' : 'unhealthy'" :title="sessionHealthy ? 'Session Active' : 'Session Reconnecting'">
          <span class="status-dot"></span>
          <span class="status-label">{{ sessionHealthy ? 'Connected' : 'Reconnecting' }}</span>
        </div>

        <button @click="handleLogout" class="btn-disconnect">Disconnect</button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRedfish } from '../composables/useRedfish';

const { logout, bmcUrl, activeFetches, statusMessage, sessionHealthy } = useRedfish();

function handleLogout() {
  if (confirm("Disconnect from BMC?")) {
    logout();
  }
}
</script>

