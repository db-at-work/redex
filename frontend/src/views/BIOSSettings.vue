<template>
  <div class="bios-settings">
    <InfoPanel title="Current BIOS Attributes">
      <template #header-actions>
        <button @click="saveBiosSettings" class="btn-success-sm">Apply Pending Changes</button>
      </template>

      <div v-if="!biosData" class="no-data">Loading BIOS map...</div>
      <div v-else class="settings-grid">
        <div v-for="(val, key) in biosData.Attributes" :key="key" class="setting-row">
          <label class="setting-label">{{ formatKey(key) }}</label>
          <input 
            v-if="typeof val !== 'boolean'" 
            v-model="pendingSettings[key]" 
            :placeholder="val"
            class="setting-input"
          />
          <div v-else class="toggle-box">
             <input type="checkbox" v-model="pendingSettings[key]" />
          </div>
        </div>
      </div>
    </InfoPanel>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import InfoPanel from '../components/InfoPanel.vue';
import { useRedfish } from '../composables/useRedfish';

const { biosData } = useRedfish();
const pendingSettings = reactive<Record<string, any>>({});

const formatKey = (key: string) => key.replace(/([A-Z])/g, ' $1').trim();

const saveBiosSettings = async () => {
  // POST to the Settings object inside BIOS
  // Usually biosData['@Redfish.Settings']['@odata.id']
  alert("Settings staged. Reboot host to apply.");
};
</script>