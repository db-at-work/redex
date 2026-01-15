<template>
  <div class="tree-view">
    <!-- Loading state -->
    <div v-if="cacheKeys.length === 0" class="loading-state">
      <span class="loading-icon">⏳</span>
      <p>Loading data...</p>
      <p class="loading-hint">Please wait while data is being fetched</p>
    </div>
    
    <!-- Tree content -->
    <div v-else>
      <div 
        v-for="key in displayedKeys" 
        :key="key"
        class="tree-root"
      >
        <div 
          class="path-header" 
          :class="{ 'has-error': cache[key]?.error }"
          @click="togglePath(key)"
        >
          <span class="expand-icon">{{ expandedPaths.has(key) ? '▼' : '▶' }}</span>
          <span class="path-name">{{ key }}</span>
          <span v-if="cache[key]?.error" class="error-badge" :title="cache[key].message">
            ⚠️ {{ cache[key].error }}
          </span>
          <span v-else-if="getObjectSize(cache[key])" class="item-count">
            {{ getObjectSize(cache[key]) }} items
          </span>
        </div>
        
        <div v-if="expandedPaths.has(key)" class="tree-content">
          <TreeNode 
            v-if="cache[key]"
            :data="cache[key]" 
            :path="key"
            :search="search"
            :level="0"
          />
        </div>
      </div>
    </div>
    
    <!-- Empty search results -->
    <div v-if="cacheKeys.length > 0 && displayedKeys.length === 0" class="empty-state">
      <span class="empty-icon">🔍</span>
      <p>No results found</p>
      <p class="empty-hint">Try a different search term</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRedfish } from '../composables/useRedfish';
import TreeNode from './TreeNode.vue';

const props = defineProps<{
  search: string;
}>();

const { cache } = useRedfish();
const expandedPaths = ref(new Set<string>());

// Get all cache keys as a computed array
const cacheKeys = computed(() => {
  // Only show /redfish/v1/ as the single root
  const keys = Object.keys(cache);
  return keys.filter(key => key === '/redfish/v1/').sort();
});

// Filter displayed keys based on search
const displayedKeys = computed(() => {
  const keys = cacheKeys.value;
  
  if (!props.search.trim()) {
    return keys;
  }
  
  const searchLower = props.search.toLowerCase();
  return keys.filter(key => {
    // Search in path
    if (key.toLowerCase().includes(searchLower)) {
      return true;
    }
    
    // Search in data content
    const data = cache[key];
    if (data) {
      const dataStr = JSON.stringify(data).toLowerCase();
      return dataStr.includes(searchLower);
    }
    
    return false;
  });
});

function togglePath(path: string) {
  if (expandedPaths.value.has(path)) {
    expandedPaths.value.delete(path);
  } else {
    expandedPaths.value.add(path);
  }
}

function getObjectSize(obj: any): number {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.keys(obj).length;
}
</script>
