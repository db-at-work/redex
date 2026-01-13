<template>
  <div class="raw-data">
    <div class="toolbar">
      <input 
        v-model="search" 
        class="search-bar" 
        placeholder="🔍 Search strings, keys, or paths (e.g. 'SerialNumber')..." 
      />
      <button @click="downloadCache" class="btn-secondary">💾 Export JSON</button>
      <div class="scan-status">
        <span class="pulse" v-if="activeFetches > 0"></span>
        Queue: {{ fetchQueue.length }}
      </div>
    </div>
    
    <div class="tree-viewer">
      <TreeView :search="search" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import TreeView from '../components/TreeView.vue';
import { useRedfish } from '../composables/useRedfish';

const { fetchQueue, activeFetches, downloadCache } = useRedfish();
const search = ref('');
</script>