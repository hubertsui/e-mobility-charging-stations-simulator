<template>
  <td class="cs-table__action-col">
    <div class="line">
      <Button @click="startChargingStation()">开机</Button>
      <Button @click="stopChargingStation()">关机</Button>
      <Button @click="openConnection()">上线</Button>
      <Button @click="closeConnection()">下线</Button>
    </div>
    <div class="line">
      <select v-model="state.status" name="status" title="Connector Status">
        <option value="Available">Available</option>
        <option value="Preparing">Preparing</option>
        <option value="Charging">Charging</option>
        <option value="SuspendedEVSE">SuspendedEVSE</option>
        <option value="SuspendedEV">SuspendedEV</option>
        <option value="Finishing">Finishing</option>
        <option value="Reserved">Reserved</option>
        <option value="Unavailable">Unavailable</option>
        <option value="Faulted">Faulted</option>
      </select>
      <Button @click="setStatus()">更新状态</Button>
    </div>
    <div class="line">
      <select v-model="state.firmwareStatus" name="firmware-status" title="Firmware Status">
        <option value="Idle">Idle</option>
        <option value="Downloading">Downloading</option>
        <option class="fs-fail" value="DownloadFailed">DownloadFailed</option>
        <option value="Downloaded">Downloaded</option>
        <option value="Installing">Installing</option>
        <option class="fs-fail" value="InstallationFailed">InstallationFailed</option>
        <option class="fs-success" value="Installed">Installed</option>
      </select>
      <Button @click="setFirmwareStatus()">更新固件状态</Button>
    </div>
    <div class="line">
      <Button @click="startTransaction()">开始充电</Button>
      <Button @click="stopTransaction()">结束充电</Button>
    </div>
    <div class="line">
      <Button @click="startAutomaticTransactionGenerator()">启动模拟充电</Button>
      <Button @click="stopAutomaticTransactionGenerator()">结束模拟充电</Button>
    </div>
    <div class="line">
      <Button @click="toggleMessages()">显示消息</Button>
    </div>
  </td>
  <td class="cs-table__connector-col">{{ connectorId }}</td>
  <td class="cs-table__connector-name-col">{{ connector.displayName }}</td>
  <td class="cs-table__status-col">{{ connector.status }}</td>
  <td class="cs-table__transaction-col">
    {{ connector.transactionStarted ? '充电中' : '未充电' }}
  </td>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import Button from '../buttons/Button.vue';
// import IdTagInputModal from './IdTagInputModal.vue';
import type { ConnectorStatus } from '@/types';
import { UIClient } from '@/composables/UIClient';
// import { compose } from '@/composables/Utils';

const props = defineProps<{
  hashId: string;
  connector: ConnectorStatus;
  connectorId: number;
  transactionId?: number;
  idTag?: string;
}>();
const emit = defineEmits(['toggleMessages']);
// type State = {
//   isIdTagModalVisible: boolean;
//   idTag: string;
//   transaction: () => void;
// };

// const state: State = reactive({
//   isIdTagModalVisible: false,
//   idTag: '',
//   transaction: startTransaction,
// });

// function getIdTag(transaction: () => void): void {
//   state.transaction = transaction;
//   showTagModal();
// }

// function showTagModal(): void {
//   state.isIdTagModalVisible = true;
// }
// function hideIdTagModal(): void {
//   state.isIdTagModalVisible = false;
// }
function toggleMessages() {
  emit('toggleMessages');
}
type State = {
  status: string;
  firmwareStatus: string;
};
const state: State = reactive({
  status: 'Available',
  firmwareStatus: 'Idle',
});
function setStatus(): void {
  if (state.status?.length) {
    UIClient.getInstance().updateStatus(props.hashId, state.status, props.connectorId);
  }
}
function setFirmwareStatus(): void {
  UIClient.getInstance().updateFirmwareStatus(props.hashId, state.firmwareStatus);
}
function startChargingStation(): void {
  UIClient.getInstance().startChargingStation(props.hashId);
}
function stopChargingStation(): void {
  UIClient.getInstance().stopChargingStation(props.hashId);
}
function openConnection(): void {
  UIClient.getInstance().openConnection(props.hashId);
}
function closeConnection(): void {
  UIClient.getInstance().closeConnection(props.hashId);
}
function startTransaction(): void {
  UIClient.getInstance().startTransaction(props.hashId, props.connectorId, props.idTag);
}
function stopTransaction(): void {
  UIClient.getInstance().stopTransaction(props.hashId, props.transactionId);
}
function startAutomaticTransactionGenerator(): void {
  UIClient.getInstance().startAutomaticTransactionGenerator(props.hashId, props.connectorId);
}
function stopAutomaticTransactionGenerator(): void {
  UIClient.getInstance().stopAutomaticTransactionGenerator(props.hashId, props.connectorId);
}
</script>
<style>
.line {
  display: flex;
  align-items: center;
  height: 32px;
  padding-left: 8px;
}
.line select {
  height: 24px;
  flex-grow: 1;
  width: 40px;
}
.line button {
  height: 24px;
}
.line * + button {
  margin-left: 8px;
}
.fs-success {
  color: green;
}
.fs-fail {
  color: red;
}
</style>
