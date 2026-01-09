<script setup lang="ts">
import axios from 'axios';
import { onUnmounted, reactive, ref } from 'vue';

const ip = ref('');
const username = ref('Administrator');
const password = ref('');
const token = ref('');
const jsonData = ref<any>(null);

// --- State & Crawler ---
const cache = reactive<Record<string, any>>({});
const fetchQueue = ref<string[]>([]);
const activeFetches = ref(0);
const statusMessage = ref('Idle');
const isScanning = ref(true);
const searchQuery = ref('');
let keepAliveTimer: any = null;

async function login() {
  try {
    const res = await axios.post('/api/login', {
      ip: ip.value, username: username.value, password: password.value
    });
    token.value = res.data.token;
    isScanning.value = true;
    
    // Start Keep-Alive: Poke the BMC every 2 minutes
    startKeepAlive();
    
    const rootRes = await fetchWithCache('/redfish/v1/', true);
    jsonData.value = rootRes;
  } catch (e) {
    alert("Login failed. Check credentials/connectivity.");
  }
}

function startKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = setInterval(async () => {
    if (!token.value) return;
    try {
      // Smallest possible request to keep session active
      await axios.get(`/api/proxy?path=/redfish/v1/`, {
        headers: { 'X-Auth-Token': token.value }
      });
      console.log("Session keep-alive successful");
    } catch (e) {
      console.warn("Keep-alive failed, attempting silent re-login...");
      await login(); 
    }
  }, 120000); // 2 minutes
}

async function fetchWithCache(path: string, isPriority = false) {
  if (cache[path] && !cache[path].error) return cache[path];
  
  activeFetches.value++;
  try {
    const res = await axios.get(`/api/proxy?path=${path}`, {
      headers: { 'X-Auth-Token': token.value }
    });
    cache[path] = res.data;
    findLinksToQueue(res.data);
    return res.data;
  } catch (e) {
    // Handle Session Expiry / Access Denied
    if (e.response?.status === 401 || e.message.includes('AccessDenied')) {
        statusMessage.value = "Session expired. Reconnecting...";
        await login(); // Refresh token
        return fetchWithCache(path, isPriority); // Retry original request
    }
    
    const errObj = { error: "Fetch Failed", message: e.message, path };
    cache[path] = errObj;
    return errObj;
  } finally {
    activeFetches.value--;
    if (isScanning.value) processQueue();
  }
}

// Ensure timer is cleared if component unmounts
onUnmounted(() => clearInterval(keepAliveTimer));

function findLinksToQueue(data: any) {
  if (!data || typeof data !== 'object' || !isScanning.value) return;
  Object.entries(data).forEach(([key, val]) => {
    // Check for @odata.id but SKIP Actions (keys starting with #)
    if (key === '@odata.id' && typeof val === 'string' && !cache[val] && !fetchQueue.value.includes(val)) {
      if (!val.includes('$metadata')) fetchQueue.value.push(val);
    } else if (typeof val === 'object' && !key.startsWith('#')) {
      findLinksToQueue(val);
    }
  });
}

async function processQueue() {
  if (!isScanning.value || fetchQueue.value.length === 0 || activeFetches.value >= 3) {
    if (activeFetches.value === 0) statusMessage.value = isScanning.value ? 'Complete' : 'Paused';
    return;
  }
  const nextPath = fetchQueue.value.shift();
  if (nextPath) {
    statusMessage.value = `${nextPath}`;
    await fetchWithCache(nextPath);
  }
}

function toggleScanning() {
  isScanning.value = !isScanning.value;
  if (isScanning.value) processQueue();
}

function downloadCache() {
  const blob = new Blob([JSON.stringify(cache, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `redfish_cache_${ip.value}.json`;
  a.click();
}
</script>

<template>
  <div class="app-shell">
    <div v-if="!token" class="login-screen">
      <h1>Redfish Explorer</h1>
      <input v-model="ip" placeholder="BMC IP" />
      <input v-model="username" placeholder="User" />
      <input v-model="password" type="password" placeholder="Pass" />
      <button @click="login">Connect</button>
    </div>

    <div v-else class="explorer">
      <header class="sticky-header">
        <div class="header-top">
          <div class="controls-left">
            <button @click="toggleScanning" class="btn-scan" :class="{ 'paused': !isScanning }">
              {{ isScanning ? 'Stop Scanning' : 'Resume Scanning' }}
            </button>
            <div class="indicator" :class="{ 'active': activeFetches > 0 }"></div>
            <span class="status-txt">{{ statusMessage }}</span>
          </div>
          
          <div class="controls-right">
            <input v-model="searchQuery" class="search-input" placeholder="Search tree..." />
            <button @click="downloadCache" class="btn-download">💾 Download JSON</button>
            <button @click="token = ''" class="btn-logout">Logout</button>
          </div>
        </div>
        <div class="header-stats">
          Cached: <span class="highlight">{{ Object.keys(cache).length }}</span> nodes | 
          Queue: <span class="highlight">{{ fetchQueue.length }}</span> remaining
        </div>
      </header>

      <div class="main-content">
        <tree-node 
          :node-data="jsonData" 
          :fetch-fn="fetchWithCache" 
          :cache="cache" 
          :search="searchQuery"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, h } from 'vue';
const TreeNode = defineComponent({
  name: 'tree-node',
  props: ['nodeData', 'fetchFn', 'cache', 'search'],
  setup(props) {
    const localExpanded = ref<Record<string, boolean>>({});
    const priorityLoading = ref<Record<string, boolean>>({});

    const handleExpand = async (key: string, path: string) => {
      // Toggle if already expanded
      if (localExpanded.value[key]) {
        localExpanded.value[key] = false;
        return;
      }

      // If it's a remote path and not in cache, fetch it now
      if (path && !props.cache[path]) {
        priorityLoading.value[key] = true;
        await props.fetchFn(path, true);
        priorityLoading.value[key] = false;
      }
      
      localExpanded.value[key] = true;
    };
    return { localExpanded, priorityLoading, handleExpand };
  },
  render() {
    if (!this.nodeData || typeof this.nodeData !== 'object') {
      return h('span', { class: 'val-p' }, JSON.stringify(this.nodeData));
    }

    return h('div', { class: 'node-box' }, 
      Object.entries(this.nodeData).map(([key, val]) => {
        let path = null;
        if (!key.startsWith('#')) {
           if (typeof val === 'string' && val.startsWith('/redfish/v1') && !val.includes('$metadata')) {
             path = val;
           } else if (val && typeof val === 'object' && val['@odata.id']) {
             path = val['@odata.id'];
           }
        }

        const isLocal = val !== null && typeof val === 'object' && !path;
        const expanded = !!this.localExpanded[key];
        const loading = !!this.priorityLoading[key];
        const cached = path ? this.cache[path] : null;

        const isMatch = this.search && (
          key.toLowerCase().includes(this.search.toLowerCase()) || 
          JSON.stringify(val).toLowerCase().includes(this.search.toLowerCase())
        );

        return h('div', { class: ['tree-line', isMatch ? 'search-match' : ''], key: key }, [
          // The line-core is now the main click target for expandable rows
          h('div', { 
            class: ['line-core', (path || isLocal) ? 'clickable-row' : ''],
            onClick: (path || isLocal) ? () => this.handleExpand(key, path) : undefined
          }, [
            h('span', { class: 'tree-key' }, `"${key}": `),
            
            path 
              ? h('span', { class: 'tree-val-str' }, `"${path}"`)
              : isLocal 
                ? h('span', { class: 'obj-placeholder' }, Array.isArray(val) ? '[ ... ]' : '{ ... }')
                : h('span', { class: typeof val === 'string' ? 'tree-val-str' : 'tree-val-num' }, JSON.stringify(val)),
            
            // Arrows now indicate scan status
            (path || isLocal) ? h('span', { 
              class: ['arrow', path ? (cached ? 'scanned' : 'unscanned') : 'local'] 
            }, expanded ? ' ▾' : ' ▸') : null,

            h('span', { class: 'punct' }, ',')
          ]),

          loading ? h('div', { class: 'prio-msg' }, '⚡ Priority Fetching...') : null,

          expanded ? h('div', { class: 'indent-box' }, [
             h(TreeNode, { 
               // If the cached data is an error, display it with a specific class
               nodeData: path ? (cached || { "State": "Waiting..." }) : val, 
               fetchFn: this.fetchFn,
               cache: this.cache,
               search: this.search
             })
          ]) : null
        ]);
      })
    );
  }
});
export default { components: { TreeNode } }
</script>

<style>
/* Reset & Layout */
body { background: #0d1117; color: #c9d1d9; font-family: 'Consolas', monospace; margin: 0; padding: 0; }
.app-shell { height: 100vh; display: flex; flex-direction: column; }

/* Ensure the row looks and behaves like a button */
.clickable-row {
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.1s ease;
}

.clickable-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* Specific hover for remote links to distinguish from local objects */
.clickable-row:has(.scanned):hover,
.clickable-row:has(.unscanned):hover {
  background: rgba(35, 134, 54, 0.2); /* Subtle green tint for Redfish links */
}

/* Highlighting the active/loading state */
.prio-msg {
  color: #ffd600;
  font-size: 10px;
  margin-left: 20px;
  padding: 4px 0;
  font-family: sans-serif;
}

/* Ensure arrows are clearly visible */
.arrow {
  margin-left: 10px;
  font-size: 14px;
  display: inline-block;
  width: 12px;
  text-align: center;
}

/* Style for nodes that contain an "error" key */
.tree-line:has(.tree-key:contains("error")) {
  background: rgba(218, 54, 51, 0.1);
  border-left: 2px solid #da3633;
  margin-left: -2px;
}

/* Red text for error messages */
.tree-line:has(.tree-key:contains("message")) .tree-val-str {
  color: #ff7b72;
}

/* Keep-alive status subtle indicator */
.nav-right::before {
  content: "●";
  color: #7ee787;
  margin-right: 5px;
  font-size: 8px;
  vertical-align: middle;
}

/* Sticky Header */
.sticky-header { 
  position: sticky; top: 0; z-index: 100;
  background: #161b22; border-bottom: 2px solid #30363d;
  padding: 10px 20px;
}
.header-top { display: flex; justify-content: space-between; align-items: center; }
.header-stats { font-size: 11px; color: #8b949e; margin-top: 5px; }
.highlight { color: #7ee787; }

/* Controls */
.controls-left, .controls-right { display: flex; align-items: center; gap: 15px; }
.search-input { background: #0d1117; border: 1px solid #444; color: #fff; padding: 5px 10px; border-radius: 4px; width: 200px; }
.indicator { width: 12px; height: 12px; border-radius: 50%; background: #444; }
.indicator.active { background: #ffd600; box-shadow: 0 0 10px #ffd600; animation: pulse 1s infinite; }
@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
.status-txt { font-size: 11px; color: #8b949e; max-width: 250px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

/* Buttons */
button { cursor: pointer; border-radius: 4px; border: none; font-weight: bold; padding: 6px 12px; font-size: 12px; }
.btn-scan { background: #ffd600; color: #000; }
.btn-scan.paused { background: #30363d; color: #fff; border: 1px solid #ffd600; }
.btn-download { background: #238636; color: white; }
.btn-logout { background: #da3633; color: white; }

/* Tree Styling */
.main-content { padding: 20px; }
.tree-line { padding: 2px 4px; border-radius: 2px; }
.search-match { background: rgba(255, 255, 0, 0.15); border: 1px solid rgba(255, 255, 0, 0.3); }
.line-core { display: flex; align-items: center; white-space: nowrap; }
.tree-key { color: #79c0ff; }
.tree-val-str { color: #ffa657; }
.tree-val-num { color: #79c0ff; }

/* Arrow Logic */
.arrow { margin-left: 8px; font-weight: bold; }
.arrow.unscanned { color: #ffd600; } /* Yellow for pending */
.arrow.scanned { color: #7ee787; }   /* Green for cached */
.arrow.local { color: #8b949e; }

.indent-box { margin-left: 15px; border-left: 1px solid #30363d; padding-left: 20px; }
.prio-msg { color: #ffd600; font-size: 10px; margin-left: 30px; }

/* Login */
.login-screen { max-width: 320px; margin: 100px auto; background: #161b22; padding: 30px; border-radius: 8px; border: 1px solid #30363d; display: flex; flex-direction: column; gap: 12px; }
input { background: #0d1117; border: 1px solid #30363d; color: white; padding: 10px; border-radius: 4px; }
</style>