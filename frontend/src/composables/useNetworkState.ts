import { ref, computed } from 'vue';
import axios from 'axios';

export type ConnectionIssueType = 'none' | 'frontend' | 'backend';

// Singleton state
const frontendConnected = ref(true);
const backendConnected = ref(true);
const isRetrying = ref(false);
const lastFrontendCheck = ref<number>(Date.now());
const lastBackendCheck = ref<number>(Date.now());

// Axios instance for frontend health checks (no /api prefix)
const healthCheckApi = axios.create({
  timeout: 5000
});

export function useNetworkState() {
  const connectionIssue = computed<ConnectionIssueType>(() => {
    if (!frontendConnected.value) return 'frontend';
    if (!backendConnected.value) return 'backend';
    return 'none';
  });

  const isConnected = computed(() => {
    return frontendConnected.value && backendConnected.value;
  });

  /**
   * Check if frontend server is reachable
   */
  async function checkFrontendConnection(): Promise<boolean> {
    try {
      // Try to fetch the root HTML or a static asset
      await healthCheckApi.get('/', { timeout: 3000 });
      frontendConnected.value = true;
      lastFrontendCheck.value = Date.now();
      return true;
    } catch (error) {
      console.error('Frontend connection check failed:', error);
      frontendConnected.value = false;
      lastFrontendCheck.value = Date.now();
      return false;
    }
  }

  /**
   * Check if backend (through frontend proxy) is reachable
   */
  async function checkBackendConnection(authToken?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['X-Auth-Token'] = authToken;
      }

      // Try a simple backend health check through the proxy
      await axios.get('/api/proxy?path=' + encodeURIComponent('/redfish/v1/'), {
        headers,
        timeout: 5000
      });

      backendConnected.value = true;
      lastBackendCheck.value = Date.now();
      return true;
    } catch (error: any) {
      // Only mark as disconnected for network errors, not auth errors
      const isNetworkError = error.code === 'ERR_NETWORK' ||
                            error.code === 'ECONNABORTED' ||
                            error.code === 'ETIMEDOUT' ||
                            !error.response;

      if (isNetworkError) {
        console.error('Backend connection check failed:', error);
        backendConnected.value = false;
        lastBackendCheck.value = Date.now();
        return false;
      }

      // Auth errors mean backend is reachable
      backendConnected.value = true;
      lastBackendCheck.value = Date.now();
      return true;
    }
  }

  /**
   * Attempt to restore connection
   */
  async function retryConnection(authToken?: string): Promise<boolean> {
    isRetrying.value = true;

    try {
      // First check frontend
      const frontendOk = await checkFrontendConnection();
      if (!frontendOk) {
        isRetrying.value = false;
        return false;
      }

      // Then check backend
      const backendOk = await checkBackendConnection(authToken);
      isRetrying.value = false;
      return backendOk;
    } catch (error) {
      console.error('Connection retry failed:', error);
      isRetrying.value = false;
      return false;
    }
  }

  /**
   * Mark frontend as disconnected (called when fetch fails)
   */
  function markFrontendDisconnected() {
    frontendConnected.value = false;
    lastFrontendCheck.value = Date.now();
  }

  /**
   * Mark backend as disconnected (called when API fails)
   */
  function markBackendDisconnected() {
    backendConnected.value = false;
    lastBackendCheck.value = Date.now();
  }

  /**
   * Reset all connection states
   */
  function resetConnectionState() {
    frontendConnected.value = true;
    backendConnected.value = true;
    isRetrying.value = false;
  }

  /**
   * Start automatic connection monitoring
   */
  let monitorInterval: number | null = null;

  function startConnectionMonitoring(authToken?: string) {
    stopConnectionMonitoring();

    // Check every 10 seconds when there's a known issue
    monitorInterval = window.setInterval(async () => {
      if (!isConnected.value && !isRetrying.value) {
        console.log('Auto-checking connection...');
        await retryConnection(authToken);
      }
    }, 10000);
  }

  function stopConnectionMonitoring() {
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }
  }

  return {
    frontendConnected,
    backendConnected,
    connectionIssue,
    isConnected,
    isRetrying,
    checkFrontendConnection,
    checkBackendConnection,
    retryConnection,
    markFrontendDisconnected,
    markBackendDisconnected,
    resetConnectionState,
    startConnectionMonitoring,
    stopConnectionMonitoring,
    lastFrontendCheck,
    lastBackendCheck
  };
}
