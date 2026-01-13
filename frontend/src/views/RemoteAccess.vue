<template>
  <div class="remote-access">
    <InfoPanel title="Remote Console (vKVM)">
      <div class="remote-actions">
        <p>Access the host video and keyboard/mouse stream directly.</p>
        <div class="btn-group">
          <button @click="launchKVM" class="btn-action">Launch H5 Viewer</button>
          <button @click="downloadJNLP" class="btn-secondary">Download Java JNLP</button>
        </div>
      </div>
    </InfoPanel>

    <InfoPanel title="Virtual Media">
      <div v-if="virtualMedia.length === 0" class="no-data">No media slots available.</div>
      <div v-for="(drive, idx) in virtualMedia" :key="idx" class="media-slot">
        <div class="hw-header">
          <span class="hw-name">{{ drive.Id }}</span>
          <span :class="['badge', drive.Inserted ? 'badge-success' : 'badge-info']">
            {{ drive.Inserted ? 'Mounted' : 'Empty' }}
          </span>
        </div>
        <div class="media-details" v-if="drive.Inserted">
          <p class="hw-specs">Image: {{ drive.Image }}</p>
          <button @click="ejectMedia(drive['@odata.id'])" class="btn-error-sm">Eject</button>
        </div>
        <div class="media-details" v-else>
          <input v-model="isoUrl" placeholder="http://server/image.iso" class="url-input" />
          <button @click="mountMedia(drive['@odata.id'])" class="btn-action-sm">Mount Image</button>
        </div>
      </div>
    </InfoPanel>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import InfoPanel from '../components/InfoPanel.vue';
import { useRedfish } from '../composables/useRedfish';

const { virtualMedia, bmcUrl } = useRedfish();
const isoUrl = ref('');

const launchKVM = () => window.open(`https://${bmcUrl.value}/#kvm`, '_blank');
const downloadJNLP = () => window.location.href = `https://${bmcUrl.value}/viewer.jnlp`;

const mountMedia = async (path: string) => {
  // Logic to call InsertMedia action via proxy
  console.log(`Mounting ${isoUrl.value} to ${path}`);
};
</script>