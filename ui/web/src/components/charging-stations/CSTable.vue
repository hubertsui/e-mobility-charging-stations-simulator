<template>
  <table id="cs-table">
    <thead id="cs-table__head">
      <tr class="cs-table__row">
        <th scope="col" class="cs-table__action-col">操作</th>
        <th scope="col" class="cs-table__connector-col">充电枪</th>
        <th scope="col" class="cs-table__connector-name-col">终端编号</th>
        <th scope="col" class="cs-table__status-col">终端状态</th>
        <th scope="col" class="cs-table__transaction-col">充电情况</th>
        <th scope="col" class="cs-table__name-col">设备Key</th>
        <th scope="col" class="cs-table__display-name-col">设备名称</th>
        <th scope="col" class="cs-table__started-col">运行情况</th>
        <th scope="col" class="cs-table__vendor-col">供应商/型号</th>
        <th scope="col" class="cs-table__firmware-col">固件版本</th>
        <th scope="col" class="cs-table__firmwarestatus-col">固件升级状态</th>
      </tr>
    </thead>
    <tbody id="cs-table__body">
      <CSData
        v-for="chargingStation in props.chargingStations"
        :key="chargingStation.stationInfo?.hashId"
        :charging-station="chargingStation"
        :id-tag="props.idTag"
      />
    </tbody>
  </table>
</template>

<script setup lang="ts">
import CSData from './CSData.vue';
import type { ChargingStationData } from '@/types';

const props = defineProps<{
  chargingStations: ChargingStationData[];
  idTag: string;
}>();
</script>

<style>
#cs-table {
  height: 100%;
  width: 100%;
  background-color: white;
  display: flex;
  flex-grow: 1;
  flex-direction: column;
  overflow: auto hidden;
  border-collapse: collapse;
  empty-cells: show;
}

#cs-table__head,
#cs-table__body {
  height: fit-content;
  width: 100%;
  min-width: 100%;
  display: block;
}

#cs-table__body {
  overflow: visible overlay;
  flex-grow: 1;
}

.cs-table__row {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

#cs-table__head .cs-table__row {
  background-color: rgb(194, 188, 188);
}

.cs-table__row:nth-of-type(even) {
  background-color: rgb(223, 217, 217);
}

.cs-table__messages-col {
  flex-grow: 1;
}

.msg-time {
  font-size: 0.8em;
  color: #666;
  margin-bottom: 5px;
}

.cs-table__action-col,
.cs-table__connector-col,
.cs-table__connector-name-col,
.cs-table__display-name-col,
.cs-table__status-col,
.cs-table__transaction-col,
.cs-table__name-col,
.cs-table__started-col,
.cs-table__wsState-col,
.cs-table__registration-status-col,
.cs-table__model-col,
.cs-table__vendor-col,
.cs-table__firmware-col,
.cs-table__firmwarestatus-col {
  height: 0.1%;
  width: 80px;
  padding-top: 0.2%;
  padding-bottom: 0.2%;
  text-align: center;
  word-break: break-all;
  flex-grow: 1;
  flex-shrink: 1;
}
.cs-table__action-col {
  flex-shrink: 0;
}

.cs-table__action-col,
.cs-table__connector-name-col,
.cs-table__display-name-col,
.cs-table__name-col,
.cs-table__vendor-col {
  width: 240px;
}
.cs-table__firmwarestatus-col {
  width: 120px;
}
.cs-table__status-col {
  width: 130px;
}
td.cs-table__name-col {
  font-size: 12px;
}

.message-container {
  overflow-y: auto;
  max-height: 500px;
  background-color: #f5f5f5;
  padding: 16px;
}

.message {
  margin-bottom: 8px;
  border-radius: 8px;
  padding: 8px;
  position: relative;
}

.message-send {
  margin-left: 32px;
  background-color: rgba(149, 236, 105);
}

.message-receive {
  margin-right: 32px;
  background-color: white;
}
</style>
