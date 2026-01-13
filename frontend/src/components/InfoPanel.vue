<template>
  <div class="panel">
    <div class="panel-header">
      <span>{{ title }}</span>
      <slot name="header-actions"></slot>
    </div>
    <div class="panel-body">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
}>();
</script>
