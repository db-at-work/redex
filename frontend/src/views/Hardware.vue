<template>
  <div class="hardware">
    <InfoPanel title="Processors">
      <div v-if="processors.length === 0" class="no-data">Loading processor information...</div>
      <div v-for="(cpu, idx) in processors" :key="idx" class="hardware-item">
        <div class="hw-header">
          <span class="hw-name">{{ cpu.Name || cpu.Id }}</span>
          <span class="badge badge-success">{{ cpu.Status?.State || 'Present' }}</span>
        </div>
        <div class="hw-details">
          <div>{{ cpu.Model }}</div>
          <div class="hw-specs">{{ cpu.TotalCores }} Cores @ {{ cpu.MaxSpeedMHz }}MHz</div>
        </div>
      </div>
    </InfoPanel>

    <InfoPanel title="Memory">
      <div v-if="memory.length === 0" class="no-data">Loading memory information...</div>
      <div class="memory-grid">
        <div v-for="(dimm, idx) in memory" :key="idx" class="memory-slot">
          <div class="mem-name">{{ dimm.Name || dimm.Id }}</div>
          <div class="mem-size">{{ dimm.CapacityMiB ? (dimm.CapacityMiB / 1024) + 'GB' : 'Empty' }}</div>
          <div class="mem-speed" v-if="dimm.OperatingSpeedMhz">@ {{ dimm.OperatingSpeedMhz }}MHz</div>
        </div>
      </div>
    </InfoPanel>

    <InfoPanel title="Storage Devices">
      <div v-if="storage.length === 0" class="no-data">Loading storage information...</div>
      <div v-for="(drive, idx) in storage" :key="idx" class="hardware-item">
        <div class="hw-header">
          <span class="hw-name">{{ drive.Name || drive.Id }}</span>
          <span :class="['badge', drive.Status?.Health === 'OK' ? 'badge-success' : 'badge-warning']">
            {{ drive.Status?.Health || 'Unknown' }}
          </span>
        </div>
        <div class="hw-details">
          <div>{{ drive.Model || 'Unknown Model' }}</div>
          <div class="hw-specs">
            {{ drive.CapacityBytes ? (drive.CapacityBytes / 1e12).toFixed(2) + 'TB' : 'Unknown' }}
          </div>
        </div>
      </div>
    </InfoPanel>

    <InfoPanel title="Network Adapters">
      <div v-if="networkInterfaces.length === 0" class="no-data">Loading network information...</div>
      <div v-for="(nic, idx) in networkInterfaces" :key="idx" class="hardware-item">
        <div class="hw-header">
          <span class="hw-name">{{ nic.Name || nic.Id }}</span>
          <span :class="['badge', nic.LinkStatus === 'LinkUp' ? 'badge-success' : 'badge-error']">
            {{ nic.LinkStatus || 'No Link' }}
          </span>
        </div>
        <div class="hw-details">
          <div class="hw-specs">MAC: {{ nic.MACAddress }}</div>
          <div v-if="nic.SpeedMbps" class="hw-specs">Speed: {{ nic.SpeedMbps }} Mbps</div>
          <div v-if="nic.IPv4Addresses?.length" class="hw-specs">
            IP: {{ nic.IPv4Addresses[0].Address }}
          </div>
        </div>
      </div>
    </InfoPanel>
  </div>
</template>
