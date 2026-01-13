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


export function useRedfish() {
  // Use existing backend proxy
  const api = axios.create({
    baseURL: '/api',
    headers: {
      'Content-Type': 'application/json',
    }
  });


  async function login(ip: string, user: string, pass: string) {
    try {
      // Call your existing backend login endpoint
      const response = await api.post('/login', {
        ip,
        username: user,
        password: pass
      });
      
      const token = response.data.token;
      
      // Set auth header for future requests
      api.defaults.headers.common['X-Auth-Token'] = token;
      
      bmcUrl.value = ip;
      username.value = user;
      password.value = pass;
      isAuthenticated.value = true;
      
      // Fetch root
      const rootData = await fetchWithCache('/redfish/v1/', true);
      
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
  }


  async function fetchWithCache(path: string, priority = false) {
    if (cache[path] && !cache[path].error) return cache[path];
    
    activeFetches.value++;
    statusMessage.value = `Fetching ${path}`;
    
    try {
      // Use your existing backend proxy endpoint
      const response = await api.get(`/proxy?path=${encodeURIComponent(path)}`);
      cache[path] = response.data;
      findLinksToQueue(response.data);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch ${path}:`, error);
      
      // Handle auth errors
      if (error.response?.status === 401) {
        console.warn('Session expired, please re-login');
        logout();
      }
      
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
        const isNavigable = !val.includes('$metadata') && 
                            !val.includes('#') && 
                            !key.startsWith('#');
        if (isNavigable && !cache[val] && !fetchQueue.value.includes(val)) {
          fetchQueue.value.push(val);
        }
      } else if (typeof val === 'object' && !key.startsWith('#')) {
        findLinksToQueue(val);
      }
    });
  }


  async function processQueue() {
    if (!isScanning.value || fetchQueue.value.length === 0 || activeFetches.value >= 3) {
      return;
    }
    const nextPath = fetchQueue.value.shift();
    if (nextPath) {
      await fetchWithCache(nextPath);
    }
  }


  function toggleScanning() {
    isScanning.value = !isScanning.value;
    if (isScanning.value) {
      processQueue();
    }
  }


  function prioritizeFetch(path: string | undefined) {
    if (!path || cache[path]) return;
    
    const index = fetchQueue.value.indexOf(path);
    if (index > -1) {
      fetchQueue.value.splice(index, 1);
    }
    fetchQueue.value.unshift(path);
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


  // Helper to get collection items
  function getCollectionItems(collectionPath: string | undefined) {
    if (!collectionPath) return [];
    
    const collection = cache[collectionPath];
    if (!collection?.Members) return [];
    
    return collection.Members.map((member: any) => 
      cache[member['@odata.id']]
    ).filter(Boolean);
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


  const processors = computed(() => 
    getCollectionItems(systemData.value?.Processors?.['@odata.id'])
  );


  const memory = computed(() => 
    getCollectionItems(systemData.value?.Memory?.['@odata.id'])
  );


  const storage = computed(() => {
    const controllers = getCollectionItems(systemData.value?.Storage?.['@odata.id']);
    const drives: any[] = [];
    
    controllers.forEach(controller => {
      controller?.Drives?.forEach((drive: any) => {
        const driveData = cache[drive['@odata.id']];
        if (driveData) drives.push(driveData);
      });
    });
    
    return drives;
  });


  const networkInterfaces = computed(() => 
    getCollectionItems(systemData.value?.EthernetInterfaces?.['@odata.id'])
  );


  const thermalData = computed(() => 
    cache[chassisData.value?.Thermal?.['@odata.id']]
  );


  const powerData = computed(() => 
    cache[chassisData.value?.Power?.['@odata.id']]
  );


  const accountServiceData = computed(() => {
    const accountPath = cache['/redfish/v1/']?.AccountService?.['@odata.id'];
    return accountPath ? cache[accountPath] : null;
  });


  const accounts = computed(() => 
    getCollectionItems(accountServiceData.value?.Accounts?.['@odata.id'])
  );


  const biosData = computed(() => 
    cache[systemData.value?.Bios?.['@odata.id']]
  );


  const virtualMedia = computed(() => 
    getCollectionItems(managerData.value?.VirtualMedia?.['@odata.id'])
  );


  const serialInterfaces = computed(() => 
    getCollectionItems(managerData.value?.SerialInterfaces?.['@odata.id'])
  );


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
    // Auth
    login,
    logout,
    isAuthenticated,
    bmcUrl,
    
    // Data fetching
    fetchWithCache,
    cache,
    fetchQueue,
    activeFetches,
    isScanning,
    statusMessage,
    toggleScanning,
    prioritizeFetch,
    downloadCache,
    
    // Computed data
    systemData,
    chassisData,
    managerData,
    processors,
    memory,
    storage,
    networkInterfaces,
    thermalData,
    powerData,
    accountServiceData,
    accounts,
    biosData,
    virtualMedia,
    serialInterfaces,
    logServiceData,
  };
}