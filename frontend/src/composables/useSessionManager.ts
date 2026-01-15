import { ref } from 'vue';
import axios, { AxiosInstance } from 'axios';

export interface SessionStatus {
  isHealthy: boolean;
  lastCheck: number;
  lastRenewal: number;
  renewalAttempts: number;
  currentToken?: string;
  message: string;
}

// Singleton session state
const sessionStatus = ref<SessionStatus>({
  isHealthy: true,
  lastCheck: Date.now(),
  lastRenewal: Date.now(),
  renewalAttempts: 0,
  message: 'Not authenticated'
});

const isRenewing = ref(false);
const renewalQueue = ref<Array<() => void>>([]);

export function useSessionManager(api: AxiosInstance) {

  /**
   * Update session status with logging
   */
  function updateStatus(healthy: boolean, message: string) {
    const wasHealthy = sessionStatus.value.isHealthy;
    sessionStatus.value.isHealthy = healthy;
    sessionStatus.value.message = message;
    sessionStatus.value.lastCheck = Date.now();

    if (wasHealthy !== healthy) {
      console.log(`[SESSION] Status changed: ${healthy ? 'HEALTHY' : 'UNHEALTHY'} - ${message}`);
    }
  }

  /**
   * Attempt to renew the session
   */
  async function renewSession(currentToken?: string): Promise<boolean> {
    // If already renewing, queue this request
    if (isRenewing.value) {
      console.log('[SESSION] Renewal already in progress, queuing request...');
      return new Promise((resolve) => {
        renewalQueue.value.push(() => resolve(sessionStatus.value.isHealthy));
      });
    }

    isRenewing.value = true;
    sessionStatus.value.renewalAttempts++;

    const attemptNum = sessionStatus.value.renewalAttempts;
    console.log(`[SESSION] Renewal attempt #${attemptNum} starting...`);
    console.log(`[SESSION] Current token: ${currentToken?.substring(0, 20)}...`);

    try {
      const response = await api.post('/renew-session', {}, {
        headers: currentToken ? { 'X-Auth-Token': currentToken } : {},
        timeout: 10000,
        // Don't use the interceptor for renewal requests
        _skipInterceptor: true
      } as any);

      if (response.data?.token) {
        const newToken = response.data.token;
        console.log(`[SESSION] ✓ Renewal successful! New token: ${newToken.substring(0, 20)}...`);

        // Update global auth token
        api.defaults.headers.common['X-Auth-Token'] = newToken;
        sessionStatus.value.currentToken = newToken;
        sessionStatus.value.lastRenewal = Date.now();
        sessionStatus.value.renewalAttempts = 0; // Reset on success

        updateStatus(true, 'Session renewed successfully');

        // Process queued renewal requests
        const queue = [...renewalQueue.value];
        renewalQueue.value = [];
        queue.forEach(resolve => resolve());

        isRenewing.value = false;
        return true;
      } else {
        console.error('[SESSION] ✗ Renewal failed: No token in response', response.data);
        updateStatus(false, 'Session renewal failed - no token received');

        isRenewing.value = false;
        return false;
      }
    } catch (error: any) {
      console.error(`[SESSION] ✗ Renewal attempt #${attemptNum} failed:`, {
        status: error.response?.status,
        code: error.code,
        message: error.message,
        data: error.response?.data
      });

      updateStatus(false, `Session renewal failed: ${error.message}`);

      // Clear queued requests on failure
      renewalQueue.value = [];
      isRenewing.value = false;
      return false;
    }
  }

  /**
   * Check if error is session-related
   */
  function isSessionError(error: any): boolean {
    const status = error.response?.status;
    const code = error.code;
    const data = error.response?.data;

    // Check for various session error indicators
    const is401 = status === 401;
    const is403 = status === 403;
    const isAccessDenied = data?.code?.includes('AccessDenied') ||
                          data?.['@Message.ExtendedInfo']?.[0]?.MessageId?.includes('AccessDenied');
    const isNetworkError = code === 'ERR_NETWORK' ||
                          code === 'ECONNABORTED' ||
                          code === 'ETIMEDOUT' ||
                          !error.response;

    const isError = is401 || (is403 && isAccessDenied) || isNetworkError;

    if (isError) {
      console.log('[SESSION] Session error detected:', {
        status,
        code,
        isAccessDenied,
        isNetworkError
      });
    }

    return isError;
  }

  /**
   * Handle session error and attempt renewal
   */
  async function handleSessionError(error: any, originalRequest: any): Promise<any> {
    // Don't retry if this is already a retry
    if (originalRequest._retryCount >= 2) {
      console.log('[SESSION] Max retries reached, giving up');
      updateStatus(false, 'Session renewal failed after multiple attempts');
      return Promise.reject(error);
    }

    // Skip renewal for renewal requests themselves
    if (originalRequest._skipInterceptor || originalRequest.url?.includes('/renew-session')) {
      return Promise.reject(error);
    }

    originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;

    console.log(`[SESSION] Attempting renewal before retry #${originalRequest._retryCount}`);

    const currentToken = api.defaults.headers.common['X-Auth-Token'] as string;
    const renewed = await renewSession(currentToken);

    if (renewed) {
      // Update the request with new token
      const newToken = sessionStatus.value.currentToken;
      originalRequest.headers['X-Auth-Token'] = newToken;

      console.log(`[SESSION] Retrying original request with new token: ${originalRequest.url}`);

      // Retry the original request
      return api.request(originalRequest);
    } else {
      console.log('[SESSION] Renewal failed, rejecting original request');
      return Promise.reject(error);
    }
  }

  /**
   * Mark session as healthy after successful request
   */
  function markHealthy() {
    if (!sessionStatus.value.isHealthy) {
      updateStatus(true, 'Session healthy');
    }
    sessionStatus.value.lastCheck = Date.now();
  }

  /**
   * Initialize session with token
   */
  function initSession(token: string) {
    console.log(`[SESSION] Initializing session with token: ${token.substring(0, 20)}...`);
    api.defaults.headers.common['X-Auth-Token'] = token;
    sessionStatus.value.currentToken = token;
    sessionStatus.value.lastRenewal = Date.now();
    sessionStatus.value.renewalAttempts = 0;
    updateStatus(true, 'Session initialized');
  }

  /**
   * Clear session
   */
  function clearSession() {
    console.log('[SESSION] Clearing session');
    delete api.defaults.headers.common['X-Auth-Token'];
    sessionStatus.value.currentToken = undefined;
    sessionStatus.value.renewalAttempts = 0;
    updateStatus(false, 'Session cleared');
  }

  /**
   * Get current session info for debugging
   */
  function getSessionInfo() {
    const timeSinceLastCheck = Date.now() - sessionStatus.value.lastCheck;
    const timeSinceRenewal = Date.now() - sessionStatus.value.lastRenewal;

    return {
      ...sessionStatus.value,
      timeSinceLastCheck: `${Math.floor(timeSinceLastCheck / 1000)}s ago`,
      timeSinceRenewal: `${Math.floor(timeSinceRenewal / 1000)}s ago`,
      isRenewing: isRenewing.value,
      queuedRequests: renewalQueue.value.length
    };
  }

  return {
    sessionStatus,
    isRenewing,
    renewSession,
    isSessionError,
    handleSessionError,
    markHealthy,
    initSession,
    clearSession,
    getSessionInfo,
    updateStatus
  };
}
