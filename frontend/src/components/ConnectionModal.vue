<template>
  <div v-if="showModal" class="modal-overlay" @click.self="handleOverlayClick">
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-icon">
          <svg v-if="issueType === 'frontend'" class="icon-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <svg v-else class="icon-error" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="modal-title">{{ modalTitle }}</h2>
      </div>

      <div class="modal-body">
        <p class="modal-message">{{ modalMessage }}</p>
        <div v-if="showDetails" class="modal-details">
          <p class="detail-label">Details:</p>
          <ul class="detail-list">
            <li v-if="issueType === 'frontend'">
              <strong>Frontend Server:</strong> Cannot connect to the development server
            </li>
            <li v-if="issueType === 'frontend'">
              <strong>Possible causes:</strong> Server stopped, network issue, browser offline
            </li>
            <li v-if="issueType === 'backend'">
              <strong>BMC Connection:</strong> Cannot communicate with the Redfish backend
            </li>
            <li v-if="issueType === 'backend'">
              <strong>Possible causes:</strong> BMC unreachable, session expired, network timeout
            </li>
          </ul>
          <p class="last-check">Last successful connection: {{ lastCheckTime }}</p>
        </div>
      </div>

      <div class="modal-footer">
        <button
          class="btn-retry"
          :disabled="isRetrying"
          @click="handleRetry"
        >
          <span v-if="isRetrying" class="retry-spinner"></span>
          <span v-else>🔄</span>
          {{ isRetrying ? 'Retrying...' : 'Retry Connection' }}
        </button>
        <button
          v-if="issueType === 'backend'"
          class="btn-logout"
          :disabled="isRetrying"
          @click="handleLogout"
        >
          Logout
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ConnectionIssueType } from '../composables/useNetworkState';

const props = defineProps<{
  issueType: ConnectionIssueType;
  isRetrying: boolean;
  lastCheckTimestamp: number;
}>();

const emit = defineEmits<{
  retry: [];
  logout: [];
}>();

const showModal = computed(() => props.issueType !== 'none');

const modalTitle = computed(() => {
  switch (props.issueType) {
    case 'frontend':
      return 'Frontend Server Disconnected';
    case 'backend':
      return 'Backend Connection Lost';
    default:
      return '';
  }
});

const modalMessage = computed(() => {
  switch (props.issueType) {
    case 'frontend':
      return 'The connection to the frontend server has been lost. Please check your network connection and ensure the development server is running.';
    case 'backend':
      return 'The connection to the Redfish BMC has been lost. This may be due to a network issue, session timeout, or the BMC becoming unreachable.';
    default:
      return '';
  }
});

const showDetails = computed(() => props.issueType !== 'none');

const lastCheckTime = computed(() => {
  const now = Date.now();
  const diff = now - props.lastCheckTimestamp;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours > 1 ? 's' : ''} ago`;
});

function handleRetry() {
  emit('retry');
}

function handleLogout() {
  emit('logout');
}

function handleOverlayClick() {
  // Don't allow dismissing by clicking overlay - force user to retry or logout
  // This is intentional to prevent users from working with a broken connection
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.modal-dialog {
  background: var(--panel-bg);
  border: 2px solid var(--error);
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
  animation: modal-appear 0.3s ease-out;
}

@keyframes modal-appear {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.modal-icon {
  flex-shrink: 0;
}

.icon-warning,
.icon-error {
  width: 48px;
  height: 48px;
  color: var(--error);
}

.icon-warning {
  color: var(--warning);
}

.modal-title {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-bright);
  font-weight: 600;
}

.modal-body {
  padding: 1.5rem;
}

.modal-message {
  margin: 0 0 1rem 0;
  color: var(--text-main);
  line-height: 1.6;
  font-size: 1rem;
}

.modal-details {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem;
  margin-top: 1rem;
}

.detail-label {
  margin: 0 0 0.5rem 0;
  font-weight: 600;
  color: var(--text-bright);
  font-size: 0.9rem;
}

.detail-list {
  margin: 0;
  padding-left: 1.25rem;
  color: var(--text-main);
  font-size: 0.9rem;
  line-height: 1.8;
}

.detail-list li {
  margin-bottom: 0.5rem;
}

.detail-list strong {
  color: var(--accent);
}

.last-check {
  margin: 1rem 0 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 0.85rem;
  font-style: italic;
}

.modal-footer {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid var(--border);
  justify-content: flex-end;
}

.btn-retry,
.btn-logout {
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  border: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}

.btn-retry {
  background: var(--accent);
  color: var(--text-bright);
  flex: 1;
}

.btn-retry:hover:not(:disabled) {
  filter: brightness(1.2);
  transform: translateY(-1px);
}

.btn-retry:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-logout {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  color: var(--error);
}

.btn-logout:hover:not(:disabled) {
  background: rgba(248, 81, 73, 0.1);
  border-color: var(--error);
}

.retry-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-bright);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
