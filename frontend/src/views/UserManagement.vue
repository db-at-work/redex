<template>
  <div class="user-management">
    <div class="panel-grid">
      <InfoPanel title="Local Accounts">
        <div v-for="user in accounts" :key="user.Id" class="user-card">
          <div class="user-info">
            <span class="user-name">{{ user.UserName }}</span>
            <span class="badge badge-info">{{ user.RoleId }}</span>
          </div>
          <div class="user-status">
            <span :class="['status-dot', user.Enabled ? 'active' : '']"></span>
            {{ user.Enabled ? 'Enabled' : 'Disabled' }}
          </div>
          <button @click="openPasswordModal(user)" class="btn-action-sm">Reset Password</button>
        </div>
      </InfoPanel>

      <InfoPanel title="Account Policies">
        <InfoRow label="Lockout Threshold" :value="accountServiceData?.AccountLockoutThreshold + ' attempts'" />
        <InfoRow label="Lockout Duration" :value="accountServiceData?.AccountLockoutDuration + 's'" />
        <InfoRow label="Min Password Length" :value="accountServiceData?.MinPasswordLength" />
      </InfoPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import InfoPanel from '../components/InfoPanel.vue';
import InfoRow from '../components/InfoRow.vue';
import { useRedfish } from '../composables/useRedfish';

const { accounts, accountServiceData } = useRedfish();

const openPasswordModal = (user: any) => {
  const newPass = prompt(`Enter new password for ${user.UserName}:`);
  if (newPass) {
    // Implement PATCH /redfish/v1/AccountService/Accounts/{id}
    console.log(`Patching password for ${user.Id}`);
  }
};
</script>