<template>
  <div class="login-screen">
    <div class="login-card">
      <div class="login-header">
        <svg class="icon-server-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
          <line x1="6" y1="6" x2="6.01" y2="6"></line>
          <line x1="6" y1="18" x2="6.01" y2="18"></line>
        </svg>
        <h1 class="login-title">Redfish Explorer</h1>
      </div>
      
      <form @submit.prevent="handleLogin">
        <input 
          v-model="ip" 
          type="text" 
          placeholder="BMC IP Address" 
          required 
        />
        <input 
          v-model="username" 
          type="text" 
          placeholder="Username" 
          required 
        />
        <input 
          v-model="password" 
          type="password" 
          placeholder="Password" 
          required 
        />
        
        <button type="submit" class="btn-connect" :disabled="loading">
          {{ loading ? 'Connecting...' : 'Connect' }}
        </button>
        
        <div v-if="error" class="error-message">
          {{ error }}
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRedfish } from '../composables/useRedfish';

const { login } = useRedfish();

const ip = ref('');
const username = ref('Administrator');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function handleLogin() {
  loading.value = true;
  error.value = '';
  
  const success = await login(ip.value, username.value, password.value);
  
  if (!success) {
    error.value = 'Login failed. Check credentials and connectivity.';
  }
  
  loading.value = false;
}
</script>
