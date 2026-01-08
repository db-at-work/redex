<script setup lang="ts">
import axios from 'axios';
import { reactive, ref } from 'vue';

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

async function login() {
  try {
    const res = await axios.post('/api/login', {
      ip: ip.value, username: username.value, password: password.value
    });
    token.value = res.data.token;
    isScanning.value = true;
    const rootRes = await fetchWithCache('/redfish/v1/', true);
    jsonData.value = rootRes;
  } catch (e) {
    alert("Login failed.");
  }
}

async function fetchWithCache(path: string, isPriority = false) {
  if (cache[path]) return cache[path];
  activeFetches.value++;
  try {
    const res = await axios.get(`/api/proxy?path=${path}`, {
      headers: { 'X-Auth-Token': token.value }
    });
    cache[path] = res.data;
    findLinksToQueue(res.data);
    return res.data;
  } finally {
    activeFetches.value--;
    if (isScanning.value) processQueue();
  }
}

function findLinksToQueue(data: any) {
  if (!data || typeof data !== 'object' || !isScanning.value) return;
  Object.entries(data).forEach(([key, val]) => {
    if (key === '@odata.id' && typeof val === 'string' && !cache[val] && !fetchQueue.value.includes(val)) {
      if (!val.includes('$metadata')) fetchQueue.value.push(val);
    } else if (typeof val === 'object') {
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
    statusMessage.value = `Crawling: ${nextPath}`;
    await fetchWithCache(nextPath);
  }
}

function toggleScanning() {
  isScanning.value = !isScanning.value;
  if (isScanning.value) processQueue();
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
      <header class="top-nav">
        <div class="nav-left">
          <div class="indicator" :class="{ 'active': activeFetches > 0 }"></div>
          <span class="status-txt">{{ statusMessage }}</span>
          <button @click="toggleScanning" class="btn-toggle" :class="{ 'is-paused': !isScanning }">
            {{ isScanning ? 'Stop Scanning' : 'Resume Scanning' }}
          </button>
        </div>
        <div class="nav-right">
          <span class="cache-count">Nodes: {{ Object.keys(cache).length }}</span>
          <button @click="token = ''" class="btn-logout">Logout</button>
        </div>
      </header>

      <div class="main-view">
        <tree-node :node-data="jsonData" :fetch-fn="fetchWithCache" :cache="cache" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, h } from 'vue';

const TreeNode = defineComponent({
  name: 'tree-node',
  props: ['nodeData', 'fetchFn', 'cache'],
  setup(props) {
    const localExpanded = ref<Record<string, boolean>>({});
    const priorityLoading = ref<Record<string, boolean>>({});

    const handleExpand = async (key: string, path: string) => {
      if (localExpanded.value[key]) {
        localExpanded.value[key] = false;
        return;
      }
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
        if (typeof val === 'string' && val.startsWith('/redfish/v1') && !val.includes('$metadata')) {
          path = val;
        } else if (val && typeof val === 'object' && val['@odata.id']) {
          path = val['@odata.id'];
        }

        const isLocal = val !== null && typeof val === 'object' && !path;
        const expanded = !!this.localExpanded[key];
        const loading = !!this.priorityLoading[key];
        const cached = path ? this.cache[path] : null;

        return h('div', { class: 'tree-line', key: key }, [
          h('div', { class: 'line-core' }, [
            h('span', { class: 'tree-key' }, `"${key}": `),
            (path || isLocal)
              ? h('span', { 
                  class: path ? 'tree-link' : 'tree-local', 
                  onClick: () => this.handleExpand(key, path) 
                }, [
                  h('span', { class: 'tree-val-str' }, path ? `"${path}"` : '{ ... }'),
                  h('span', { class: 'arrow' }, expanded ? ' ▾' : ' ▸'),
                ])
              : h('span', { class: typeof val === 'string' ? 'tree-val-str' : 'tree-val-num' }, JSON.stringify(val)),
            h('span', { class: 'punct' }, ',')
          ]),
          loading ? h('div', { class: 'prio-msg' }, '⚡ Fetching...') : null,
          expanded ? h('div', { class: 'indent-box' }, [
             h(TreeNode, { 
               nodeData: path ? (cached || { "State": "Waiting..." }) : val, 
               fetchFn: this.fetchFn,
               cache: this.cache 
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
/* Reset & Shell */
body { background: #0d1117; color: #c9d1d9; font-family: 'Consolas', monospace; margin: 0; }
.app-shell { padding: 20px; }

/* Top Navigation */
.top-nav { display: flex; justify-content: space-between; align-items: center; background: #161b22; padding: 12px 20px; border-radius: 6px; border-bottom: 1px solid #30363d; margin-bottom: 20px; }
.nav-left, .nav-right { display: flex; align-items: center; gap: 15px; }
.indicator { width: 10px; height: 10px; border-radius: 50%; background: #444; }
.indicator.active { background: #ffd600; box-shadow: 0 0 8px #ffd600; }
.status-txt { font-size: 12px; color: #8b949e; }
.cache-count { color: #7ee787; font-weight: bold; font-size: 12px; }

/* Tree Logic Styles */
.main-view { background: #0d1117; padding: 10px; border-radius: 6px; overflow-x: auto; }
.tree-line { margin: 2px 0; }
.line-core { display: flex; align-items: center; white-space: nowrap; }
.tree-key { color: #79c0ff; }
.tree-val-str { color: #ffa657; }
.tree-val-num { color: #79c0ff; }
.punct { color: #8b949e; margin-left: 2px; }

/* Interactive Elements */
.tree-link, .tree-local { cursor: pointer; padding: 0 4px; border-radius: 3px; display: inline-flex; align-items: center; }
.tree-link:hover { background: #238636; }
.tree-local:hover { background: #30363d; }
.arrow { color: #7ee787; font-weight: bold; margin-left: 5px; }
.indent-box { margin-left: 15px; border-left: 1px solid #30363d; padding-left: 20px; margin-top: 4px; }
.prio-msg { color: #ffd600; font-size: 11px; margin-left: 30px; font-style: italic; }

/* Login/Buttons */
.login-screen { max-width: 320px; margin: 100px auto; background: #161b22; padding: 30px; border-radius: 8px; border: 1px solid #30363d; display: flex; flex-direction: column; gap: 12px; }
input { background: #0d1117; border: 1px solid #30363d; color: white; padding: 10px; border-radius: 4px; }
button { padding: 8px 15px; border-radius: 4px; border: none; font-weight: bold; cursor: pointer; }
.btn-toggle { background: #30363d; color: #fff; border: 1px solid #444; }
.btn-toggle.is-paused { color: #ffd600; border-color: #ffd600; }
.btn-logout { background: #da3633; color: white; }
</style>