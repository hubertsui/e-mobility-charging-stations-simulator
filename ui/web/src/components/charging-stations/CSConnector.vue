<template>
  <td class="cs-table__action-col">
    <!-- <Button @click="startChargingStation()">开机</Button>
    <Button @click="stopChargingStation()">关机</Button>
    <br>
    <Button @click="openConnection()">上线</Button>
    <Button @click="closeConnection()">下线</Button>
    <br> -->
    <div class="line">
      <select name="status" title="Connector Status" v-model="state.status">
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
      <select name="firmware-status" title="Firmware Status" v-model="state.firmwareStatus">
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
    <!-- <IdTagInputModal
      :visibility="state.isIdTagModalVisible"
      :id-tag="state.idTag"
      @close="hideIdTagModal()"
      @done="Utils.compose(state.transaction, hideIdTagModal)()"
    >
      Start Transaction
    </IdTagInputModal> -->
    <!-- <Button @click="startTransaction()">Start Transaction</Button>
    <Button @click="stopTransaction()">Stop Transaction</Button>
    <Button @click="startAutomaticTransactionGenerator()">Start ATG</Button>
    <Button @click="stopAutomaticTransactionGenerator()">Stop ATG</Button>
    <Button @click="toggleMessages()">显示消息</Button> -->
  </td>
  <td class="cs-table__connector-col">{{ connectorId }}</td>
  <td class="cs-table__status-col">{{ connector.status }}</td>
  <td class="cs-table__transaction-col">{{ connector.transactionStarted ? 'Yes' : 'No' }}</td>
</template>

<script setup lang="ts">
// import { reactive } from 'vue';
import Button from '../buttons/Button.vue';
// import IdTagInputModal from './IdTagInputModal.vue';
import type { ConnectorStatus } from '@/types';
import UIClient from '@/composables/UIClient';
import { reactive } from 'vue';
// import Utils from '@/composables/Utils';

const props = defineProps<{
  hashId: string;
  connector: ConnectorStatus;
  connectorId: number;
  transactionId?: number;
  idTag?: string;
}>();

const emit = defineEmits(['toggleMessages']);

function toggleMessages() {
  emit("toggleMessages");
}
type State = {
  status: string;
  firmwareStatus: string;
};

const state: State = reactive({
  status: "Available",
  firmwareStatus: "Idle"
});

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

function setStatus(): void {
  if (state.status?.length) {
    UIClient.getInstance().updateStatus(props.hashId, state.status);
  }
}
function setFirmwareStatus(): void {
  UIClient.getInstance().updateFirmwareStatus(props.hashId, status);
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
  margin-right: 8px;
  width: 40px;
}
.line button {
  height: 24px;
}
.fs-success {
  color: green;
}

.fs-fail {
  color: red;
}
</style>