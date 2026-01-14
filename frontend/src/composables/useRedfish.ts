import axios from 'axios';
import { computed, reactive, ref } from 'vue';

interface RedfishCache {
  [path: string]: any;
}

// Singleton state
const bmcUrl = ref('');
const username = ref('');
const password = ref('');
const isAuthenticated = ref(false);
const cache = reactive<RedfishCache>({});
const fetchQueue = ref<string[]>([]);
const activeFetches = ref(0);
const isScanning = ref(true);
const statusMessage = ref('Idle');

// Global Axios Instance
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  }
});

export function useRedfish() {

  /**
   * RECOVERY LOGIC: Axios Interceptor
   * Catches 401 errors globally and attempts a transparent re-login
   */
  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      
      // If 401 occurs and we haven't already tried to retry this specific request
      if (error.response?.status === 401 && !originalRequest._retry && isAuthenticated.value) {
        originalRequest._retry = true;
        statusMessage.value = 'Session expired, refreshing...';
        
        // Attempt to re-login with stored credentials
        const success = await login(bmcUrl.value, username.value, password.value);
        
        if (success) {
          // Update the header of the original failed request and replay it
          originalRequest.headers['X-Auth-Token'] = api.defaults.headers.common['X-Auth-Token'];
          return api(originalRequest);
        } else {
          logout(); // Force to login screen if re-auth fails
        }
      }
      return Promise.reject(error);
    }
  );

  async function login(ip: string, user: string, pass: string) {
    try {
      const response = await api.post('/login', {
        ip,
        username: user,
        password: pass
      });
      
      const token = response.data.token;
      api.defaults.headers.common['X-Auth-Token'] = token;
      
      // Persist credentials for the auto-retry logic
      bmcUrl.value = ip;
      username.value = user;
      password.value = pass;
      isAuthenticated.value = true;
      
      await fetchWithCache('/redfish/v1/', true);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  function logout() {
    isAuthenticated.value = false;
    bmcUrl.value = '';
    username.value = '';
    password.value = '';
    Object.keys(cache).forEach(key => delete cache[key]);
    fetchQueue.value = [];
    api.defaults.headers.common['X-Auth-Token'] = '';
    statusMessage.value = 'Logged out';
  }

  /**
   * Enhanced fetch with retry and backoff for non-auth errors
   */
  async function fetchWithCache(path: string, priority = false, retryCount = 0) {
    if (cache[path] && !cache[path].error) return cache[path];
    
    activeFetches.value++;
    statusMessage.value = `Fetching ${path}`;
    
    try {
      const response = await api.get(`/proxy?path=${encodeURIComponent(path)}`);
      cache[path] = response.data;
      findLinksToQueue(response.data);
      return response.data;
    } catch (error: any) {
      // 401s are handled by the interceptor above. 
      // Other errors (503, timeouts) get a limited retry with backoff.
      if (retryCount < 2 && error.response?.status !== 401) {
        const backoff = (retryCount + 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoff));
        activeFetches.value--; // Decr before retrying to avoid double counting
        return fetchWithCache(path, priority, retryCount + 1);
      }

      console.error(`Failed to fetch ${path}:`, error);
      cache[path] = { error: 'Failed to fetch', message: error.message };
      return null;
    } finally {
      activeFetches.value--;
      if (activeFetches.value === 0) {
        statusMessage.value = isScanning.value ? 'Complete' : 'Paused';
      }
      if (isScanning.value) {
        setTimeout(processQueue, 100);
      }
    }
  }

  function findLinksToQueue(data: any) {
    if (!data || typeof data !== 'object' || !isScanning.value) return;
    
    Object.entries(data).forEach(([key, val]) => {
      if (key === '@odata.id' && typeof val === 'string') {
        const isNavigable = !val.includes('$metadata') && !val.includes('#');
        if (isNavigable && !cache[val] && !fetchQueue.value.includes(val)) {
          fetchQueue.value.push(val);
        }
      } else if (typeof val === 'object' && !key.startsWith('#')) {
        findLinksToQueue(val);
      }
    });
  }

  async function processQueue() {
    if (!isScanning.value || fetchQueue.value.length === 0 || activeFetches.value >= 3) return;
    const nextPath = fetchQueue.value.shift();
    if (nextPath) await fetchWithCache(nextPath);
  }

  function toggleScanning() {
    isScanning.value = !isScanning.value;
    if (isScanning.value) processQueue();
  }

  function prioritizeFetch(path: string | undefined) {
    if (!path || cache[path]) return;
    const index = fetchQueue.value.indexOf(path);
    if (index > -1) fetchQueue.value.splice(index, 1);
    fetchQueue.value.unshift(path);
    if (activeFetches.value < 3) processQueue();
  }

  function downloadCache() {
    const blob = new Blob([JSON.stringify(cache, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redfish_cache_${bmcUrl.value}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getCollectionItems(collectionPath: string | undefined) {
    if (!collectionPath) return [];
    const collection = cache[collectionPath];
    if (!collection?.Members) return [];
    return collection.Members.map((m: any) => cache[m['@odata.id']]).filter(Boolean);
  }

  // Computed data extractors
  const systemData = computed(() => {
    const systemsPath = cache['/redfish/v1/']?.Systems?.['@odata.id'];
    if (!systemsPath) return null;
    const collection = cache[systemsPath];
    const firstSystem = collection?.Members?.[0]?.['@odata.id'];
    return firstSystem ? cache[firstSystem] : null;
  });

  const chassisData = computed(() => {
    const chassisPath = cache['/redfish/v1/']?.Chassis?.['@odata.id'];
    if (!chassisPath) return null;
    const collection = cache[chassisPath];
    const firstChassis = collection?.Members?.[0]?.['@odata.id'];
    return firstChassis ? cache[firstChassis] : null;
  });

  const managerData = computed(() => {
    const managerPath = cache['/redfish/v1/']?.Managers?.['@odata.id'];
    if (!managerPath) return null;
    const collection = cache[managerPath];
    const firstManager = collection?.Members?.[0]?.['@odata.id'];
    return firstManager ? cache[firstManager] : null;
  });

  const processors = computed(() => getCollectionItems(systemData.value?.Processors?.['@odata.id']));
  const memory = computed(() => getCollectionItems(systemData.value?.Memory?.['@odata.id']));
  
  const storage = computed(() => {
    const controllers = getCollectionItems(systemData.value?.Storage?.['@odata.id']);
    const drives: any[] = [];
    controllers.forEach(ctrl => {
      ctrl?.Drives?.forEach((d: any) => {
        const driveData = cache[d['@odata.id']];
        if (driveData) drives.push(driveData);
      });
    });
    return drives;
  });

  const networkInterfaces = computed(() => getCollectionItems(systemData.value?.EthernetInterfaces?.['@odata.id']));
  const thermalData = computed(() => cache[chassisData.value?.Thermal?.['@odata.id']]);
  const powerData = computed(() => cache[chassisData.value?.Power?.['@odata.id']]);
  
  const accountServiceData = computed(() => {
    const accountPath = cache['/redfish/v1/']?.AccountService?.['@odata.id'];
    return accountPath ? cache[accountPath] : null;
  });

  const accounts = computed(() => getCollectionItems(accountServiceData.value?.Accounts?.['@odata.id']));
  const biosData = computed(() => cache[systemData.value?.Bios?.['@odata.id']]);
  const virtualMedia = computed(() => getCollectionItems(managerData.value?.VirtualMedia?.['@odata.id']));
  const serialInterfaces = computed(() => getCollectionItems(managerData.value?.SerialInterfaces?.['@odata.id']));

  const logServiceData = computed(() => {
    const logPath = managerData.value?.LogServices?.['@odata.id'];
    if (!logPath) return null;
    const logCollection = cache[logPath];
    const firstLog = logCollection?.Members?.[0]?.['@odata.id'];
    if (!firstLog) return null;
    const logService = cache[firstLog];
    const entriesPath = logService?.Entries?.['@odata.id'];
    return entriesPath ? cache[entriesPath] : null;
  });

  return {
    login, logout, isAuthenticated, bmcUrl,
    fetchWithCache, cache, fetchQueue, activeFetches, isScanning,
    statusMessage, toggleScanning, prioritizeFetch, downloadCache,
    systemData, chassisData, managerData, processors, memory, storage,
    networkInterfaces, thermalData, powerData, accountServiceData,
    accounts, biosData, virtualMedia, serialInterfaces, logServiceData,
  };
}