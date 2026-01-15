<template>
  <div class="tree-node">
    <!-- Error display - skip permission errors in tree view -->
    <div v-if="data?.error && !isPermissionError(data)" class="error-container">
      <div class="error-line">
        <span class="error-icon">⚠️</span>
        <span class="error-title">{{ data.error }}</span>
      </div>
      <div v-if="data.message" class="error-message">
        {{ data.message }}
      </div>
      <div v-if="data.code" class="error-code">
        Code: {{ data.code }}
      </div>
    </div>

    <div v-else-if="isObject" class="object-container">
      <div
        v-for="(value, key) in data"
        :key="key"
        class="property"
      >
        <!-- Special handling for @odata.id (both cached and uncached, excluding self and actions) -->
        <div v-if="isODataLink(key) && !isSelfReference(value) && !isActionLink(value)">
          <div
            class="odata-link-bar"
            @click="toggleODataExpand(value)"
          >
            <span class="expand-btn" :class="getExpandClass(value)">
              {{ isODataExpanded(value) ? '▼' : '▶' }}
            </span>
            <span class="key key-meta">{{ key }}</span>
            <span class="colon">:</span>
            <span class="value-string">"{{ value }}"</span>
            <span class="item-count" v-if="getCachedDataSize(value)">
              {{ getCachedDataSize(value) }} items
            </span>
            <!-- Show retry icon for failed fetches -->
            <span
              v-if="hasFetchError(value)"
              class="link-indicator error"
              @click.stop="retryFetch(value)"
              title="Fetch failed - click to retry"
            >
              🔄
            </span>
            <!-- Show bolt icon for uncached items -->
            <span
              v-else-if="!isCached(value)"
              class="link-indicator uncached"
              :class="{ fetching: isFetching(value) }"
              @click.stop="fetchLink(value)"
              title="Click to fetch this endpoint"
            >
              ⚡
            </span>
          </div>

          <div v-if="isODataExpanded(value)" class="nested">
            <TreeNode
              v-if="isCached(value)"
              :data="cache[value]"
              :path="value"
              :search="search"
              :level="level + 1"
            />
            <!-- Show error state when expanded but fetch failed -->
            <div v-else-if="hasFetchError(value)" class="fetch-error-container">
              <div class="fetch-error-icon">⚠️</div>
              <div class="fetch-error-message">
                <strong>{{ isAccessDeniedError(value) ? 'Session Expired / Access Denied' : 'Failed to fetch data' }}</strong>
                <p>{{ getFetchErrorMessage(value) }}</p>
                <p v-if="isAccessDeniedError(value)" class="error-hint">
                  The session may have expired. Click retry to renew the session and fetch again.
                </p>
                <button class="btn-retry-fetch" @click.stop="retryFetch(value)">
                  {{ isAccessDeniedError(value) ? '🔄 Renew Session & Retry' : '🔄 Retry' }}
                </button>
              </div>
            </div>
            <!-- Show loading state -->
            <div v-else-if="isFetching(value)" class="fetch-loading">
              <span class="loading-spinner"></span>
              <span>Fetching...</span>
            </div>
          </div>
        </div>
        
        <!-- Regular property rendering -->
        <div v-else>
          <div 
            class="property-line"
            :class="{ 'clickable': isExpandable(value) }"
            @click="isExpandable(value) && toggleExpand(key)"
          >
            <span 
              v-if="isExpandable(value)" 
              class="expand-btn"
            >
              {{ isExpanded(key) ? '▼' : '▶' }}
            </span>
            <span v-else class="expand-placeholder"></span>
            
            <span class="key" :class="getKeyClass(key)">{{ formatKey(key) }}</span>
            <span class="colon">:</span>
            
            <!-- Inline value for primitives -->
            <span v-if="!isExpandable(value)" class="value" :class="getValueClass(value)">
              {{ formatValue(value) }}
            </span>
            
            <!-- Type hint for objects/arrays -->
            <span v-else class="type-hint">
              {{ getTypeHint(value) }}
            </span>
            
            <!-- Link indicator for uncached @odata.id -->
            <span
              v-if="isODataLink(key) && !isCached(value)"
              class="link-indicator uncached"
              :class="{ fetching: isFetching(value) }"
              @click.stop="fetchLink(value)"
              title="Click to fetch this endpoint"
            >
              ⚡
            </span>
          </div>
          
          <!-- Nested content for regular expandable items -->
          <div v-if="isExpandable(value) && isExpanded(key) && !isODataLink(key)" class="nested">
            <TreeNode 
              :data="value"
              :path="`${path}.${key}`"
              :search="search"
              :level="level + 1"
            />
          </div>
        </div>
      </div>
    </div>
    
    <div v-else-if="isArray" class="array-container">
      <div
        v-for="(item, index) in data"
        :key="index"
        class="array-item"
      >
        <!-- Check if array item has @odata.id that's cached -->
        <div v-if="item?.['@odata.id'] && isCached(item['@odata.id']) && !isSelfReference(item['@odata.id'])">
          <div 
            class="odata-link-bar"
            @click="toggleODataExpand(item['@odata.id'])"
          >
            <span class="expand-btn">
              {{ isODataExpanded(item['@odata.id']) ? '▼' : '▶' }}
            </span>
            <span class="array-index">[{{ index }}]</span>
            <span class="colon">:</span>
            <span class="value-string">"{{ item['@odata.id'] }}"</span>
            <span class="item-count" v-if="getCachedDataSize(item['@odata.id'])">
              {{ getCachedDataSize(item['@odata.id']) }} items
            </span>
          </div>
          
          <div v-if="isODataExpanded(item['@odata.id'])" class="nested">
            <TreeNode 
              :data="cache[item['@odata.id']]"
              :path="item['@odata.id']"
              :search="search"
              :level="level + 1"
            />
          </div>
        </div>
        
        <!-- Regular array item rendering -->
        <div v-else>
          <div 
            class="property-line"
            :class="{ 'clickable': isExpandable(item) }"
            @click="isExpandable(item) && toggleExpand(index)"
          >
            <span 
              v-if="isExpandable(item)" 
              class="expand-btn"
            >
              {{ isExpanded(index) ? '▼' : '▶' }}
            </span>
            <span v-else class="expand-placeholder"></span>
            
            <span class="array-index">[{{ index }}]</span>
            <span class="colon">:</span>
            
            <span v-if="!isExpandable(item)" class="value" :class="getValueClass(item)">
              {{ formatValue(item) }}
            </span>
            
            <span v-else class="type-hint">
              {{ getTypeHint(item) }}
            </span>

            <!-- Retry icon for failed fetches -->
            <span
              v-if="item?.['@odata.id'] && hasFetchError(item['@odata.id'])"
              class="link-indicator error"
              @click.stop="retryFetch(item['@odata.id'])"
              title="Fetch failed - click to retry"
            >
              🔄
            </span>
            <!-- Link indicator for uncached array item with @odata.id -->
            <span
              v-else-if="item?.['@odata.id'] && !isCached(item['@odata.id'])"
              class="link-indicator uncached"
              :class="{ fetching: isFetching(item['@odata.id']) }"
              @click.stop="fetchLink(item['@odata.id'])"
              title="Click to fetch this endpoint"
            >
              ⚡
            </span>
          </div>

          <div v-if="isExpandable(item) && isExpanded(index)" class="nested">
            <TreeNode
              :data="item"
              :path="`${path}[${index}]`"
              :search="search"
              :level="level + 1"
            />
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="primitive-value">
      <span class="value" :class="getValueClass(data)">
        {{ formatValue(data) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRedfish } from '../composables/useRedfish';

const props = defineProps<{
  data: any;
  path: string;
  search: string;
  level: number;
}>();

const { cache, prioritizeFetch, fetchingPaths, sessionHealthy, renewSession } = useRedfish();
const expanded = ref(new Set<string | number>());
const odataExpanded = ref(new Set<string>()); // Track expanded @odata.id links

const isObject = computed(() => {
  return props.data && typeof props.data === 'object' && !Array.isArray(props.data);
});

const isArray = computed(() => {
  return Array.isArray(props.data);
});

function isExpandable(value: any): boolean {
  return value && typeof value === 'object';
}

function isExpanded(key: string | number): boolean {
  return expanded.value.has(key);
}

function toggleExpand(key: string | number) {
  if (expanded.value.has(key)) {
    expanded.value.delete(key);
  } else {
    expanded.value.add(key);
  }
}

function isODataExpanded(odataId: string): boolean {
  return odataExpanded.value.has(odataId);
}

function toggleODataExpand(odataId: string) {
  if (odataExpanded.value.has(odataId)) {
    odataExpanded.value.delete(odataId);
  } else {
    odataExpanded.value.add(odataId);

    // When expanding, trigger priority fetch if not already cached
    if (!isCached(odataId)) {
      fetchLink(odataId);
    } else {
      // If already cached, fetch unfetched children
      const data = cache[odataId];
      if (data && typeof data === 'object') {
        fetchUnfetchedChildren(data);
      }
    }
  }
}

function fetchUnfetchedChildren(data: any) {
  if (!data || typeof data !== 'object') return;

  // Fetch Members array items
  if (data.Members && Array.isArray(data.Members)) {
    data.Members.forEach((member: any) => {
      const childPath = member?.['@odata.id'];
      if (childPath && !isCached(childPath) && !isActionLink(childPath)) {
        console.log('Priority fetching child:', childPath);
        prioritizeFetch(childPath);
      }
    });
  }

  // Fetch other @odata.id properties
  for (const [key, value] of Object.entries(data)) {
    if (key === '@odata.id') continue;
    if (typeof value === 'object' && value !== null) {
      const childPath = (value as any)['@odata.id'];
      if (childPath && !isCached(childPath) && !isActionLink(childPath)) {
        console.log('Priority fetching child:', childPath);
        prioritizeFetch(childPath);
      }
    }
  }
}

function formatKey(key: string): string {
  return key;
}

function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  return String(value);
}

function getKeyClass(key: string): string {
  if (key.startsWith('@')) return 'key-meta';
  if (key.startsWith('#')) return 'key-schema';
  if (key === 'error' || key === 'Error') return 'key-error';
  return 'key-normal';
}

function getValueClass(value: any): string {
  if (value === null || value === undefined) return 'value-null';
  if (typeof value === 'string') return 'value-string';
  if (typeof value === 'number') return 'value-number';
  if (typeof value === 'boolean') return 'value-boolean';
  return 'value-default';
}

function getTypeHint(value: any): string {
  if (Array.isArray(value)) {
    return `Array[${value.length}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    return `Object{${keys.length}}`;
  }
  return '';
}

function isODataLink(key: string): boolean {
  return key === '@odata.id';
}

function isCached(path: string): boolean {
  return path in cache && cache[path] !== null && !cache[path]?.error;
}

function hasFetchError(path: string): boolean {
  return path in cache && cache[path]?.error;
}

function getFetchErrorMessage(path: string): string {
  const cached = cache[path];
  if (!cached?.error) return '';
  return cached.message || cached.error || 'Unknown error';
}

function isAccessDeniedError(path: string): boolean {
  const cached = cache[path];
  if (!cached?.error) return false;
  return cached.code?.includes('AccessDenied') ||
         cached['@Message.ExtendedInfo']?.[0]?.MessageId?.includes('AccessDenied') ||
         false;
}

async function retryFetch(path: string) {
  console.log('[RETRY] Retrying fetch for:', path);

  // Check if this was a session error
  const cachedError = cache[path];
  const isSessionErr = cachedError?.sessionError ||
                      cachedError?.code?.includes('AccessDenied') ||
                      cachedError?.['@Message.ExtendedInfo']?.[0]?.MessageId?.includes('AccessDenied');

  if (isSessionErr) {
    console.log('[RETRY] Session error detected - attempting manual renewal');
    // Attempt to renew the session first
    const renewed = await renewSession();
    if (!renewed) {
      console.error('[RETRY] Session renewal failed - user may need to re-login');
      // Update the cached error to reflect this
      if (path in cache && cache[path]?.error) {
        cache[path].message = 'Session renewal failed. Please try logging out and back in.';
      }
      return; // Don't retry if renewal failed
    } else {
      console.log('[RETRY] Session renewed successfully - will retry fetch');
    }
  }

  // Clear the error from cache to allow retry
  if (path in cache && cache[path]?.error) {
    console.log('[RETRY] Clearing cached error for:', path);
    delete cache[path];
  }

  // Remove from fetching set if it's stuck there
  fetchingPaths.value.delete(path);

  // Trigger priority fetch (interceptor will handle any new session errors)
  console.log('[RETRY] Triggering priority fetch for:', path);
  fetchLink(path);
}

function isSelfReference(odataId: string): boolean {
  // Check if this @odata.id is the same as the current path
  return odataId === props.path;
}

function getCachedDataSize(odataId: string): number {
  const data = cache[odataId];
  if (!data || typeof data !== 'object') return 0;
  return Object.keys(data).length;
}

function fetchLink(path: string) {
  console.log('Fetching link:', path);
  prioritizeFetch(path);
}

function isPermissionError(data: any): boolean {
  // Filter out permission/access denied errors from tree display
  if (!data || !data.error) return false;

  const errorStr = data.error.toLowerCase();
  const messageStr = data.message?.toLowerCase() || '';
  const codeStr = data.code?.toLowerCase() || '';

  return (
    errorStr.includes('access denied') ||
    errorStr.includes('forbidden') ||
    messageStr.includes('permission') ||
    messageStr.includes('access denied') ||
    messageStr.includes('forbidden') ||
    codeStr.includes('accessdenied')
  );
}

function isFetching(path: string): boolean {
  return fetchingPaths.value.has(path);
}

function isActionLink(path: string): boolean {
  // Filter out Redfish action links that don't have member items
  return path.includes('/Actions/') || path.includes('#');
}

function getExpandClass(odataId: string): string {
  const data = cache[odataId];

  // If not cached yet, show yellow arrow (pending fetch)
  if (!data || data === null) {
    return 'expand-pending';
  }

  if (typeof data !== 'object') return 'expand-fetched';

  // Check if this node has children that could be expanded
  const hasChildren = hasExpandableChildren(data);

  if (!hasChildren) {
    return 'expand-fetched'; // No children, so green
  }

  // Check if children are fetched
  const childrenFetched = areChildrenFetched(data);
  return childrenFetched ? 'expand-fetched' : 'expand-pending';
}

function hasExpandableChildren(data: any): boolean {
  if (!data || typeof data !== 'object') return false;

  // Check for Members array
  if (data.Members && Array.isArray(data.Members) && data.Members.length > 0) {
    return true;
  }

  // Check for any @odata.id properties (excluding self and actions)
  for (const [key, value] of Object.entries(data)) {
    if (key === '@odata.id') continue;
    if (typeof value === 'object' && value !== null) {
      const odataId = (value as any)['@odata.id'];
      if (odataId && !isActionLink(odataId)) {
        return true;
      }
    }
  }

  return false;
}

function areChildrenFetched(data: any): boolean {
  if (!data || typeof data !== 'object') return true;

  // Check Members array
  if (data.Members && Array.isArray(data.Members)) {
    for (const member of data.Members) {
      const odataId = member?.['@odata.id'];
      if (odataId && !isCached(odataId)) {
        return false; // At least one child not fetched
      }
    }
  }

  // Check other @odata.id properties
  for (const [key, value] of Object.entries(data)) {
    if (key === '@odata.id') continue;
    if (typeof value === 'object' && value !== null) {
      const odataId = (value as any)['@odata.id'];
      if (odataId && !isActionLink(odataId) && !isCached(odataId)) {
        return false;
      }
    }
  }

  return true;
}
</script>
