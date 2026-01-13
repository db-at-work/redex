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


const { isAuthenticated, prioritizeFetch, systemData, managerData } = useRedfish();
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


// Prioritize data fetching based on active tab
watch(activeTab, (newTab) => {
  switch(newTab) {
    case 'hardware':
      prioritizeFetch(systemData.value?.Processors?.['@odata.id']);
      prioritizeFetch(systemData.value?.Memory?.['@odata.id']);
      prioritizeFetch(systemData.value?.Storage?.['@odata.id']);
      prioritizeFetch(systemData.value?.EthernetInterfaces?.['@odata.id']);
      break;
    case 'remote':
      prioritizeFetch(managerData.value?.VirtualMedia?.['@odata.id']);
      prioritizeFetch(managerData.value?.SerialInterfaces?.['@odata.id']);
      break;
  }
});
</script>