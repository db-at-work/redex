<template>
  <div class="fru-view">
    <InfoPanel title="Inventory (FRU) Manifest">
      <div v-if="!chassisData" class="no-data">Scanning for inventory...</div>
      <table v-else class="fru-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Manufacturer</th>
            <th>Model</th>
            <th>Part Number</th>
            <th>Serial Number</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Main System</td>
            <td>{{ systemData?.Manufacturer }}</td>
            <td>{{ systemData?.Model }}</td>
            <td>{{ systemData?.SKU || 'N/A' }}</td>
            <td>{{ systemData?.SerialNumber }}</td>
          </tr>
          <tr>
            <td>Chassis</td>
            <td>{{ chassisData?.Manufacturer }}</td>
            <td>{{ chassisData?.Model }}</td>
            <td>{{ chassisData?.PartNumber || 'N/A' }}</td>
            <td>{{ chassisData?.SerialNumber }}</td>
          </tr>
          <tr v-for="psu in powerData?.PowerSupplies" :key="psu.MemberId">
            <td>Power Supply {{ psu.MemberId }}</td>
            <td>{{ psu.Manufacturer }}</td>
            <td>{{ psu.Model }}</td>
            <td>{{ psu.PartNumber }}</td>
            <td>{{ psu.SerialNumber }}</td>
          </tr>
        </tbody>
      </table>
    </InfoPanel>
  </div>
</template>

<script setup lang="ts">
import InfoPanel from '../components/InfoPanel.vue';
import { useRedfish } from '../composables/useRedfish';

const { systemData, chassisData, powerData } = useRedfish();
</script>

<style scoped>
.fru-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
.fru-table th { text-align: left; padding: 12px; border-bottom: 2px solid var(--border); color: var(--accent); }
.fru-table td { padding: 12px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
</style>