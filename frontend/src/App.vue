<template>
  <div class="app">
    <LoginForm v-if="!isAuthenticated" />
    
    <div v-else class="console">
      <ConsoleHeader :active-tab="activeTab" @change-tab="activeTab = $event" />
      
      <main class="console-content">
        <component :is="currentView" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ConsoleHeader from './components/ConsoleHeader.vue';
import LoginForm from './components/LoginForm.vue';
import { useRedfish } from './composables/useRedfish';
import BIOSSettings from './views/BIOSSettings.vue';
import Dashboard from './views/Dashboard.vue';
import FRU from './views/FRU.vue';
import Hardware from './views/Hardware.vue';
import RawData from './views/RawData.vue';
import RemoteAccess from './views/RemoteAccess.vue';
import UserManagement from './views/UserManagement.vue';

// Destructure all required reactive properties and methods
const { 
  isAuthenticated, 
  prioritizeFetch, 
  systemData, 
  managerData, 
  chassisData, 
  cache 
} = useRedfish();

const activeTab = ref('dashboard');

const views: Record<string, any> = {
  dashboard: Dashboard,
  hardware: Hardware,
  fru: FRU,
  remote: RemoteAccess,
  users: UserManagement,
  bios: BIOSSettings,
  raw: RawData,
};

const currentView = computed(() => views[activeTab.value] || Dashboard);

/**
 * Watcher to handle "Priority Crawling". 
 * It reacts to tab changes OR the arrival of parent data (sys, mgr, chas).
 */
watch([activeTab, systemData, managerData, chassisData, isAuthenticated], ([newTab, sys, mgr, chas, auth]) => {
  // Don't attempt to prioritize if not logged in
  if (!auth) return;

  switch(newTab) {
    case 'dashboard':
      prioritizeFetch(chas?.Thermal?.['@odata.id']);
      prioritizeFetch(chas?.Power?.['@odata.id']);
      prioritizeFetch(mgr?.LogServices?.['@odata.id']);
      break;
      
    case 'hardware':
      prioritizeFetch(sys?.Processors?.['@odata.id']);
      prioritizeFetch(sys?.Memory?.['@odata.id']);
      prioritizeFetch(sys?.Storage?.['@odata.id']);
      prioritizeFetch(sys?.EthernetInterfaces?.['@odata.id']);
      break;

    case 'fru':
      // Ensure base objects are fetched for manufacturer/serial info
      prioritizeFetch(sys?.['@odata.id']);
      prioritizeFetch(chas?.['@odata.id']);
      prioritizeFetch(chas?.Power?.['@odata.id']);
      break;

    case 'remote':
      prioritizeFetch(mgr?.VirtualMedia?.['@odata.id']);
      prioritizeFetch(mgr?.SerialInterfaces?.['@odata.id']);
      prioritizeFetch(mgr?.NetworkProtocol?.['@odata.id']);
      break;

    case 'users':
      // AccountService is often a direct child of the Service Root
      const accountServicePath = cache['/redfish/v1/']?.AccountService?.['@odata.id'];
      if (accountServicePath) prioritizeFetch(accountServicePath);
      break;

    case 'bios':
      prioritizeFetch(sys?.Bios?.['@odata.id']);
      break;
  }
}, { immediate: true });

</script>