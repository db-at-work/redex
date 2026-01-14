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
import InfoRow from '../components/InfoRow.vue';
import StatusCard from '../components/StatusCard.vue';
import { useRedfish } from '../composables/useRedfish';

const { systemData, managerData, thermalData, powerData, logServiceData } = useRedfish();

const avgTemp = computed(() => {
  // Use optional chaining on Temperatures array
  const temps = thermalData.value?.Temperatures;
  if (!temps || !Array.isArray(temps) || temps.length === 0) return 'N/A';
  
  const validReadings = temps
    .filter((t: any) => t.ReadingCelsius !== undefined)
    .map((t: any) => t.ReadingCelsius);
    
  if (validReadings.length === 0) return 'N/A';
  
  const avg = validReadings.reduce((a: number, b: number) => a + b, 0) / validReadings.length;
  return Math.round(avg) + '°C';
});

const fanStatus = computed(() => {
  const fans = thermalData.value?.Fans;
  // Check if fans exist and is an array before calling .every()
  if (!fans || !Array.isArray(fans) || fans.length === 0) return 'Unknown';
  
  const allHealthy = fans.every((f: any) => 
    f.Status?.Health === 'OK' || f.Status?.State === 'Enabled'
  );
  return allHealthy ? 'Normal' : 'Warning';
});

const powerUsage = computed(() => {
  // Deep optional chaining for power control
  const watts = powerData.value?.PowerControl?.[0]?.PowerConsumedWatts;
  return watts ? watts + 'W' : 'N/A';
});
</script>
