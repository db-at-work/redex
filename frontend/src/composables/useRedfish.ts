import axios from 'axios';
import { computed, reactive, ref } from 'vue';
import { useNetworkState } from './useNetworkState';
import { useSessionManager } from './useSessionManager';

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
const priorityQueue = ref<string[]>([]); // NEW: Separate queue for priority items
const activeFetches = ref(0);
const isScanning = ref(false); // Changed default to false
const statusMessage = ref('Idle');
const initialLoadComplete = ref(false); // NEW: Track if priority data is loaded
const fetchingPaths = ref<Set<string>>(new Set()); // Track which paths are currently being fetched
const sessionHealthy = ref(false); // Track if session is healthy
let keepaliveInterval: number | null = null; // NEW: Keepalive timer
let sessionCheckInterval: number | null = null; // Session health check

// Global Axios Instance
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  }
});

// NEW: Define paths needed for each tab
const PRIORITY_PATHS = {
  dashboard: [
    '/redfish/v1/',
    '/redfish/v1/Systems',
    '/redfish/v1/Chassis', 
    '/redfish/v1/Managers'
  ],
  hardware: [
    // Will be built dynamically after Systems load
  ],
  fru: [
    // Will be built dynamically after Chassis load
  ],
  remoteAccess: [
    // Will be built dynamically after Managers load
  ],
  users: [
    '/redfish/v1/AccountService'
  ],
  bios: [
    // Will be built dynamically after Systems load
  ]
};

export function useRedfish() {
  // Get network state manager
  const {
    markFrontendDisconnected,
    markBackendDisconnected,
    isConnected
  } = useNetworkState();

  // Get session manager
  const sessionManager = useSessionManager(api);
  const {
    sessionStatus,
    isSessionError: checkIfSessionError,
    handleSessionError,
    markHealthy
  } = sessionManager;

  // Sync sessionHealthy with session manager
  const sessionHealthy = computed(() => sessionStatus.value.isHealthy);

  /**
   * RECOVERY LOGIC: Axios Interceptor
   * Catches connection errors globally and attempts a transparent session renewal
   */
  api.interceptors.response.use(
    (response) => {
      // Mark session healthy on successful requests
      markHealthy();
      return response;
    },
    async (error) => {
      const originalRequest = error.config;

      console.log('[INTERCEPTOR] Request failed:', {
        url: originalRequest?.url,
        status: error.response?.status,
        code: error.code,
        message: error.message
      });

      // Check for network errors that indicate frontend/backend disconnect
      const isNetworkError = error.code === 'ERR_NETWORK' ||
                            error.code === 'ECONNABORTED' ||
                            error.code === 'ETIMEDOUT' ||
                            !error.response;

      // Mark connection as lost for network errors
      if (isNetworkError) {
        console.log('[INTERCEPTOR] Network error detected, marking backend disconnected');
        markBackendDisconnected();
      }

      // Check if this is a session-related error
      if (checkIfSessionError(error) && isAuthenticated.value && isConnected.value) {
        console.log('[INTERCEPTOR] Session error detected, attempting recovery');
        statusMessage.value = 'Session issue detected, renewing...';

        try {
          return await handleSessionError(error, originalRequest);
        } catch (renewError) {
          console.error('[INTERCEPTOR] Session recovery failed:', renewError);
          statusMessage.value = 'Session renewal failed';
          return Promise.reject(renewError);
        }
      }

      return Promise.reject(error);
    }
  );

  async function login(ip: string, user: string, pass: string) {
    try {
      console.log('[LOGIN] Attempting login to:', ip);
      const response = await api.post('/login', {
        ip,
        username: user,
        password: pass
      });

      const token = response.data.token;
      console.log('[LOGIN] Login successful, token received');

      // Initialize session with token
      sessionManager.initSession(token);

      // Persist credentials for the auto-retry logic
      bmcUrl.value = ip;
      username.value = user;
      password.value = pass;
      isAuthenticated.value = true;

      // Start keepalive - ping every 3 minutes to keep session alive
      startKeepalive();

      // Just load the root for raw view - other tabs will load on demand
      console.log('[LOGIN] Loading initial data...');
      await fetchWithCache('/redfish/v1/', true, 0, false);
      initialLoadComplete.value = true;
      startSessionHealthCheck();
      statusMessage.value = 'Connected';

      // Expose debug functions globally
      (window as any).redexDebug = {
        getSessionInfo,
        renewSession,
        cache,
        sessionStatus: sessionStatus.value
      };
      console.log('[LOGIN] Debug functions available: window.redexDebug');

      return true;
    } catch (error) {
      console.error('[LOGIN] Login failed:', error);
      return false;
    }
  }

  function logout() {
    console.log('[LOGOUT] Logging out...');
    isAuthenticated.value = false;
    sessionManager.clearSession();
    bmcUrl.value = '';
    username.value = '';
    password.value = '';
    Object.keys(cache).forEach(key => delete cache[key]);
    fetchQueue.value = [];
    priorityQueue.value = [];
    initialLoadComplete.value = false;
    isScanning.value = false;
    stopKeepalive();
    stopSessionHealthCheck();
    statusMessage.value = 'Logged out';
  }

  /**
   * Keep session alive with periodic pings
   * Ping every 2 minutes to prevent session expiration
   */
  function startKeepalive() {
    stopKeepalive(); // Clear any existing interval

    // Ping every 2 minutes (120000ms)
    keepaliveInterval = window.setInterval(async () => {
      if (isAuthenticated.value && activeFetches.value === 0) {
        // Only ping when idle to avoid interference with active operations
        try {
          // Simple lightweight fetch to keep session alive
          await api.get('/proxy?path=' + encodeURIComponent('/redfish/v1/'));
          console.log('Keepalive ping successful');
          if (!sessionHealthy.value) {
            sessionHealthy.value = true;
            statusMessage.value = 'Connection restored';
          }
        } catch (error) {
          console.error('Keepalive ping failed:', error);
          sessionHealthy.value = false;
          statusMessage.value = 'Connection issue detected';
          // The interceptor will handle session renewal
        }
      }
    }, 120000);
  }

  function stopKeepalive() {
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      keepaliveInterval = null;
    }
  }

  /**
   * Check session health periodically
   */
  function startSessionHealthCheck() {
    stopSessionHealthCheck(); // Clear any existing interval

    // Check every 30 seconds
    sessionCheckInterval = window.setInterval(async () => {
      if (isAuthenticated.value && activeFetches.value === 0) {
        try {
          await api.get('/proxy?path=' + encodeURIComponent('/redfish/v1/'));
          if (!sessionHealthy.value) {
            console.log('Session recovered');
            sessionHealthy.value = true;
            statusMessage.value = 'Connection restored';
          }
        } catch (error) {
          console.warn('Session health check failed');
          if (sessionHealthy.value) {
            sessionHealthy.value = false;
            statusMessage.value = 'Connection issue detected';
          }
          // The interceptor will handle session renewal attempts
        }
      }
    }, 30000);
  }

  function stopSessionHealthCheck() {
    if (sessionCheckInterval) {
      clearInterval(sessionCheckInterval);
      sessionCheckInterval = null;
    }
  }


  /**
   * Enhanced fetch with retry and backoff for non-auth errors
   * NEW: addToQueue parameter to control background scanning behavior
   */
  async function fetchWithCache(path: string, priority = false, retryCount = 0, addToQueue = true, accessDeniedRetry = false) {
    // Don't attempt fetches if network is disconnected
    if (!isConnected.value) {
      console.warn('Network disconnected, skipping fetch:', path);
      return null;
    }

    // Return cached data if it exists and is valid (not null, not an error)
    if (path in cache && cache[path] !== null && !cache[path]?.error) {
      return cache[path];
    }
    // Skip re-fetching if we've already tried (null means permission denied or skip)
    if (path in cache && cache[path] === null) {
      return null;
    }

    activeFetches.value++;
    fetchingPaths.value.add(path); // Track that this path is being fetched
    statusMessage.value = `Fetching ${path}`;

    if (isScanning.value && addToQueue) {
      console.log(`[FETCH] Fetching: ${path} (Queue: ${fetchQueue.value.length}, Active: ${activeFetches.value})`);
    }

    try {
      const response = await api.get(`/proxy?path=${encodeURIComponent(path)}`);
      cache[path] = response.data;
      fetchingPaths.value.delete(path); // Remove from fetching set

      // Only add to queue if addToQueue is true AND scanning is enabled
      if (addToQueue && isScanning.value) {
        const beforeCount = fetchQueue.value.length;
        findLinksToQueue(response.data);
        const newLinks = fetchQueue.value.length - beforeCount;
        if (newLinks > 0) {
          console.log(`[FETCH] Success: ${path} - Added ${newLinks} new links to queue`);
        }
      }

      return response.data;
    } catch (error: any) {
      // The interceptor handles session renewal automatically
      // If we reach here, the interceptor couldn't recover or this is a non-session error

      const errorStatus = error.response?.status;
      const errorCode = error.code;

      console.error(`[FETCH ERROR] ${path}:`, {
        status: errorStatus,
        code: errorCode,
        message: error.message,
        sessionHealthy: sessionHealthy.value,
        retryCount
      });

      // Check if this was a session error that the interceptor couldn't fix
      const isSessionErr = checkIfSessionError(error);

      if (isSessionErr) {
        console.log(`[FETCH ERROR] Session error on ${path} - interceptor failed to recover`);

        // Cache the error for display if priority fetch or manual operation
        if (priority || !addToQueue) {
          cache[path] = {
            error: 'Session Error',
            message: 'Session renewal failed. Try logging out and back in.',
            code: errorStatus || errorCode,
            sessionError: true
          };
          statusMessage.value = 'Session error - please re-login';
        } else {
          // During scanning, mark as null to skip
          cache[path] = null;
        }
        fetchingPaths.value.delete(path);
        return null;
      }

      // Permission denied errors (non-session related)
      const isAccessDenied = errorStatus === 403 ||
                             error.response?.data?.code?.includes('AccessDenied') ||
                             error.response?.data?.['@Message.ExtendedInfo']?.[0]?.MessageId?.includes('AccessDenied');

      if (isAccessDenied && !isSessionErr) {
        console.log(`[FETCH ERROR] Resource access denied (permissions): ${path}`);
        // This is a permissions issue, not a session issue
        cache[path] = null; // Mark as inaccessible
        fetchingPaths.value.delete(path);
        return null;
      }

      // For server errors (5xx) or timeouts, retry with backoff
      const isRetryable = (errorStatus >= 500 && errorStatus < 600) ||
                         errorCode === 'ECONNABORTED' ||
                         errorCode === 'ETIMEDOUT';

      if (retryCount < 2 && isRetryable) {
        const backoff = (retryCount + 1) * 1000;
        console.log(`[FETCH RETRY] ${path} after ${backoff}ms (attempt ${retryCount + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        activeFetches.value--; // Decr before retrying to avoid double counting
        return fetchWithCache(path, priority, retryCount + 1, addToQueue);
      }

      // Cache errors for display, but only if not during background scan
      if (!addToQueue || !isScanning.value || priority) {
        cache[path] = {
          error: error.response?.statusText || 'Request failed',
          message: error.message,
          code: errorStatus || errorCode
        };
        statusMessage.value = `Error fetching ${path}`;
      } else {
        // During scanning, just mark as attempted without caching the error
        cache[path] = null;
      }

      return null;
    } finally {
      activeFetches.value--;
      fetchingPaths.value.delete(path); // Ensure path is removed from fetching set
      if (activeFetches.value === 0) {
        statusMessage.value = isScanning.value ? 'Scanning...' : (sessionHealthy.value ? 'Ready' : 'Connection issue');
      }
      if (isScanning.value && addToQueue) {
        setTimeout(processQueue, 100);
      }
    }
  }

  function findLinksToQueue(data: any) {
    if (!data || typeof data !== 'object') return;
    
    Object.entries(data).forEach(([key, val]) => {
      if (key === '@odata.id' && typeof val === 'string') {
        const isNavigable = !val.includes('$metadata') && !val.includes('#');
        if (isNavigable && !cache[val] && !fetchQueue.value.includes(val)) {
          fetchQueue.value.push(val);
        }
      } else if (key === '@Message.ExtendedInfo' || key === 'error' || key === 'code') {
        // Skip error objects - don't recurse into them
        return;
      } else if (typeof val === 'object' && !key.startsWith('#')) {
        findLinksToQueue(val);
      }
    });
  }

  async function processQueue() {
    if (!isConnected.value || !isScanning.value || fetchQueue.value.length === 0 || activeFetches.value >= 3) {
      // Check if scanning completed
      if (isScanning.value && fetchQueue.value.length === 0 && activeFetches.value === 0) {
        console.log(`[SCAN] Deep scan completed. Total cached paths: ${Object.keys(cache).length}`);
        statusMessage.value = 'Scan completed';
      }
      return;
    }

    const queueSize = fetchQueue.value.length;
    console.log(`[SCAN] Processing queue: ${queueSize} items remaining, ${activeFetches.value} active fetches`);

    const nextPath = fetchQueue.value.shift();
    if (nextPath) await fetchWithCache(nextPath);
  }

  /**
   * Start background scanning (for RawData tab)
   */
  function startScanning() {
    console.log('[SCAN] Starting deep scan...');
    console.log('[SCAN] 💡 Tip: Use window.redexDebug.getSessionInfo() to check session health');
    console.log('[SCAN] 💡 Tip: Use window.redexDebug.renewSession() to manually renew session');

    isScanning.value = true;
    statusMessage.value = 'Starting deep scan...';

    // Add all cached items to queue for deep scanning
    let initialLinks = 0;
    Object.values(cache).forEach(data => {
      if (data && !data.error) {
        const beforeCount = fetchQueue.value.length;
        findLinksToQueue(data);
        initialLinks += (fetchQueue.value.length - beforeCount);
      }
    });

    console.log(`[SCAN] Found ${initialLinks} initial links to fetch. Queue size: ${fetchQueue.value.length}`);
    console.log(`[SCAN] Currently cached paths: ${Object.keys(cache).length}`);

    processQueue();
  }

  function stopScanning() {
    console.log(`[SCAN] Stopping scan. Queue had ${fetchQueue.value.length} items remaining.`);
    isScanning.value = false;
    fetchQueue.value = []; // Clear the queue
    statusMessage.value = 'Scan stopped';
  }

  function toggleScanning() {
    if (isScanning.value) {
      stopScanning();
    } else {
      startScanning();
    }
  }

  function prioritizeFetch(path: string | undefined) {
    if (!path || cache[path]) return;

    // Remove from queue if already there
    const index = fetchQueue.value.indexOf(path);
    if (index > -1) fetchQueue.value.splice(index, 1);

    // Trigger immediate fetch with priority flag, don't add to background queue
    fetchWithCache(path, true, 0, false);
  }

  function downloadCache() {
    const blob = new Blob([JSON.stringify(cache, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redfish_cache_${bmcUrl.value}_${new Date().toISOString().slice(0,10)}.json`;
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

  /**
   * Get current auth token
   */
  function getAuthToken(): string | undefined {
    const token = api.defaults.headers.common['X-Auth-Token'];
    return typeof token === 'string' ? token : undefined;
  }

  /**
   * Manually trigger session renewal
   */
  async function renewSession(): Promise<boolean> {
    console.log('[MANUAL] Manual session renewal requested');
    const currentToken = api.defaults.headers.common['X-Auth-Token'] as string;
    const success = await sessionManager.renewSession(currentToken);

    if (success) {
      statusMessage.value = 'Session renewed';
    } else {
      statusMessage.value = 'Session renewal failed';
    }

    return success;
  }

  /**
   * Get session diagnostics
   */
  function getSessionInfo() {
    return sessionManager.getSessionInfo();
  }

  return {
    login, logout, isAuthenticated, bmcUrl, sessionHealthy,
    fetchWithCache, cache, fetchQueue, activeFetches, isScanning,
    statusMessage, toggleScanning, startScanning, stopScanning, prioritizeFetch, downloadCache,
    systemData, chassisData, managerData, processors, memory, storage,
    networkInterfaces, thermalData, powerData, accountServiceData,
    accounts, biosData, virtualMedia, serialInterfaces, logServiceData,
    initialLoadComplete, fetchingPaths, getAuthToken, renewSession, getSessionInfo,
    sessionStatus, // Expose session status for debugging
  };
}