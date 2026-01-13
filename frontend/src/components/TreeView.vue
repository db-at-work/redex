<template>
  <div class="tree-container">
    <TreeNode 
      v-if="rootData"
      :node-data="rootData" 
      :fetch-fn="fetchWithCache" 
      :cache="cache" 
      :search="search"
    />
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, ref } from 'vue';
import { useRedfish } from '../composables/useRedfish';

defineProps<{
  search?: string;
}>();

const { cache, fetchWithCache } = useRedfish();
const rootData = cache['/redfish/v1/'];

const TreeNode = defineComponent({
  name: 'TreeNode',
  props: ['nodeData', 'fetchFn', 'cache', 'search'],
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
            
            (path || isLocal) ? h('span', { 
              class: ['arrow', path ? (cached ? 'scanned' : 'unscanned') : 'local'] 
            }, expanded ? ' ▾' : ' ▸') : null,

            h('span', { class: 'punct' }, ',')
          ]),

          loading ? h('div', { class: 'prio-msg' }, '⚡ Priority Fetching...') : null,

          expanded ? h('div', { class: 'indent-box' }, [
             h(TreeNode, { 
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
</script>
