<template>
  <div class="raw-data">
    <!-- Fixed toolbar - doesn't scroll -->
    <div class="toolbar-fixed">
      <div class="toolbar">
        <!-- Row 1 -->
        <div class="toolbar-row-1">
          <button
            @click="toggleScanning"
            :class="['btn-scan', isScanning ? 'scanning' : 'stopped']"
          >
            <span v-if="isScanning">⏸ Stop Scanning</span>
            <span v-else>▶️ Start Deep Scan</span>
          </button>
          
          <input 
            v-model="search" 
            class="search-bar" 
            placeholder="🔍 Search strings, keys, or paths (e.g. 'SerialNumber')..." 
          />
          
          <button @click="downloadCache" class="btn-export">
            💾 Export JSON
          </button>
        </div>
        
        <!-- Row 2 -->
        <div class="toolbar-row-2">
          <div class="queue-info">
            <span class="pulse" :class="{ active: activeFetches > 0 }"></span>
            <span class="queue-text">Queue:</span>
            <span class="queue-number">{{ queueDisplay }}</span>
          </div>

          <div class="current-path" :title="currentPath">
            {{ displayPath }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Scrollable tree viewer -->
    <div class="tree-viewer-container">
      <div class="tree-viewer">
        <TreeView :search="search" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TreeView from '../components/TreeView.vue';
import { useRedfish } from '../composables/useRedfish';

const {
  fetchQueue,
  activeFetches,
  downloadCache,
  isScanning,
  toggleScanning,
  statusMessage
} = useRedfish();

const search = ref('');

// Format queue count with fixed width (pad with spaces)
const queueDisplay = computed(() => {
  const count = fetchQueue.value.length.toString();
  return count.padStart(4, '\u00A0'); // Use non-breaking space for padding
});

// Extract current path from status message
const currentPath = computed(() => {
  const msg = statusMessage.value;
  if (msg.startsWith('Fetching ')) {
    return msg.substring(9); // Remove "Fetching " prefix
  }
  return msg;
});

// Truncate path from the left to show deepest parts
const displayPath = computed(() => {
  const path = currentPath.value;
  const maxLength = 100; // Adjust based on your layout
  
  if (path.length <= maxLength) {
    return path;
  }
  
  // Show end of path (deepest part)
  return '...' + path.substring(path.length - maxLength);
});
</script>

<style scoped>
.raw-data {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.toolbar-fixed {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background: #1a1a1a;
  padding: 1rem;
  padding-bottom: 0;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: #2a2a2a;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.toolbar-row-1 {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.75rem;
  align-items: center;
}

.toolbar-row-2 {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.75rem;
  align-items: center;
}

.search-bar {
  padding: 0.75rem 1rem;
  background: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 0.95rem;
  transition: all 0.2s;
  width: 100%;
}

.search-bar:focus {
  outline: none;
  border-color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
}

.search-bar::placeholder {
  color: #666;
}

.btn-scan,
.btn-export {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-scan.stopped {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.btn-scan.stopped:hover:not(:disabled) {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-scan.scanning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.btn-scan.scanning:hover {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.btn-scan:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-export {
  background: #374151;
  color: #e0e0e0;
  border: 1px solid #4b5563;
}

.btn-export:hover {
  background: #4b5563;
  border-color: #6b7280;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.queue-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 6px;
  white-space: nowrap;
  min-width: 140px;
}

.pulse {
  width: 12px;
  height: 12px;
  background: #404040;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.pulse.active {
  background: #f59e0b;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
}

.queue-text {
  color: #9ca3af;
  font-weight: 500;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.queue-number {
  color: #60a5fa;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-width: 3ch;
  text-align: right;
  flex-shrink: 0;
}

.current-path {
  padding: 0.5rem 1rem;
  background: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 0.9rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

.info-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  margin-top: 1rem;
  background: #1e3a5f;
  border: 1px solid #2563eb;
  border-radius: 8px;
  color: #93c5fd;
  font-size: 0.95rem;
}

.loading-icon,
.info-icon {
  font-size: 1.25rem;
}

.tree-viewer-container {
  flex: 1;
  overflow: hidden;
  padding: 0 1rem 1rem 1rem;
}

.tree-viewer {
  height: 100%;
  overflow: auto;
  background: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 8px;
  padding: 1rem;
}

/* Scrollbar styling */
.tree-viewer::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.tree-viewer::-webkit-scrollbar-track {
  background: #1a1a1a;
  border-radius: 6px;
}

.tree-viewer::-webkit-scrollbar-thumb {
  background: #404040;
  border-radius: 6px;
}

.tree-viewer::-webkit-scrollbar-thumb:hover {
  background: #505050;
}
</style>