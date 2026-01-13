<template>
  <div class="dashboard">
    <div class="status-grid">
      <StatusCard 
        icon="⚡"
        label="System Power"
        :value="systemData?.PowerState"
        status="success"
      />
      <StatusCard 
        icon="🌡️"
        label="Avg Temperature"
        :value="avgTemp"
        status="success"
      />
      <StatusCard 
        icon="🌀"
        label="Fan Health"
        :value="fanStatus"
        :status="fanStatus === 'Normal' ? 'success' : 'warning'"
      />
      <StatusCard 
        icon="⚡"
        label="Power Usage"
        :value="powerUsage"
        status="info"
      />
    </div>

    <div class="panel-grid">
      <InfoPanel title="System Information">
        <InfoRow label="Model" :value="systemData?.Model" />
        <InfoRow label="Manufacturer" :value="systemData?.Manufacturer" />
        <InfoRow label="Serial Number" :value="systemData?.SerialNumber" />
        <InfoRow label="BIOS Version" :value="systemData?.BiosVersion" />
        <InfoRow label="BMC Version" :value="managerData?.FirmwareVersion" />
        <InfoRow 
          label="Health Status" 
          :value="systemData?.Status?.Health" 
          :badge="systemData?.Status?.Health === 'OK' ? 'success' : 'warning'"
        />
      </InfoPanel>

      <InfoPanel title="Recent Events">
        <div v-if="!logServiceData || !logServiceData.Members" class="no-data">
          Loading events...
        </div>
        <div v-else class="events-list">
          <div v-for="(event, idx) in logServiceData.Members.slice(0, 5)" :key="idx" class="event-item">
            <div class="event-severity">ℹ️</div>
            <div class="event-content">
              <div class="event-message">{{ event.Message || event.Name }}</div>
              <div class="event-time">{{ event.Created || 'Unknown time' }}</div>
            </div>
          </div>
        </div>
      </InfoPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import InfoPanel from '../components/InfoPanel.vue';
import { useRedfish } from '../composables/useRedfish';

const { systemData, managerData, thermalData, powerData, logServiceData } = useRedfish();

const avgTemp = computed(() => {
  if (!thermalData.value?.Temperatures) return 'N/A';
  const temps = thermalData.value.Temperatures
    .filter((t: any) => t.ReadingCelsius)
    .map((t: any) => t.ReadingCelsius);
  if (temps.length === 0) return 'N/A';
  const avg = temps.reduce((a: number, b: number) => a + b) / temps.length;
  return Math.round(avg) + '°C';
});

const fanStatus = computed(() => {
  if (!thermalData.value?.Fans) return 'Unknown';
  const allHealthy = thermalData.value.Fans.every((f: any) => 
    f.Status?.Health === 'OK' || f.Status?.State === 'Enabled'
  );
  return allHealthy ? 'Normal' : 'Warning';
});

const powerUsage = computed(() => {
  if (!powerData.value?.PowerControl?.[0]?.PowerConsumedWatts) return 'N/A';
  return powerData.value.PowerControl[0].PowerConsumedWatts + 'W';
});
</script>
