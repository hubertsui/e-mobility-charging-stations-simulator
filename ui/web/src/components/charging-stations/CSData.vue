<template>
<template v-for="(connector, index) in getConnectors()">
  <tr class="cs-table__row">
    <CSConnector
      :hash-id="getHashId()"
      :connector="connector"
      :connector-id="index + 1"
      :transaction-id="connector.transactionId"
      :id-tag="props.idTag"
      @toggleMessages="toggleMessages()"
    />
    <td class="cs-table__firmwarestatus-col">{{ getFirmwareStatus() }}</td>
    <td class="cs-table__name-col">{{ getId() }}</td>
    <td class="cs-table__started-col">{{ getStarted() }}</td>
    <td class="cs-table__wsState-col">{{ getWsState() }}</td>
    <td class="cs-table__registration-status-col">{{ getRegistrationStatus() }}</td>
    <td class="cs-table__vendor-col">{{ getVendor() }}</td>
    <td class="cs-table__model-col">{{ getModel() }}</td>
    <td class="cs-table__firmware-col">{{ getFirmwareVersion() }}</td>
  </tr>
  <tr class="cs-table__row" v-if="state.isMessagesVisible">
    <td class="cs-table__messages-col" colspan="12">
      <div class="message-container">
      <div  v-for="(msg, index) in getMessages()" :class="'message message-' + msg.type">
        <div class="msg-time">{{ msg.time }}</div>
        <div class="msg-payload">{{ msg.payload }}</div>
        <div class="msg-fail" v-if="!msg.success">Failed!</div>
      </div>
    </div>
    </td>
  </tr>
  
  </template>
</template>

<script setup lang="ts">
// import { reactive } from 'vue';
import CSConnector from './CSConnector.vue';
import type { ChargingStationData, ChargingStationInfo, ConnectorStatus, MessageLog } from '@/types';
import Utils from '@/composables/Utils';
import { reactive } from 'vue';

const props = defineProps<{
  chargingStation: ChargingStationData;
  idTag: string;
}>();

type State = {
  // isTagModalVisible: boolean;
  // idTag: string;
  isMessagesVisible:boolean;
};

const state: State = reactive({
  // isTagModalVisible: false,
  // idTag: '',
  isMessagesVisible: false
});

function toggleMessages() {
  state.isMessagesVisible = !state.isMessagesVisible;
}

function getConnectors(): ConnectorStatus[] {
  if (Array.isArray(props.chargingStation.evses) && props.chargingStation.evses.length > 0) {
    const connectorsStatus: ConnectorStatus[] = [];
    for (const [evseId, evseStatus] of props.chargingStation.evses.entries()) {
      if (evseId > 0 && Array.isArray(evseStatus.connectors) && evseStatus.connectors.length > 0) {
        for (const connectorStatus of evseStatus.connectors) {
          connectorsStatus.push(connectorStatus);
        }
      }
    }
    return connectorsStatus;
  }
  return props.chargingStation.connectors?.slice(1);
}
function getInfo(): ChargingStationInfo {
  return props.chargingStation.stationInfo;
}
function getHashId(): string {
  return getInfo().hashId;
}
function getId(): string {
  return Utils.ifUndefined<string>(getInfo().chargingStationId, 'Ø');
}
function getModel(): string {
  return getInfo().chargePointModel;
}
function getFirmwareStatus(): string {
  return getInfo().firmwareStatus || "Unknown";
}
function getMessages():MessageLog[] {
  return getInfo().messages || [];
}
function getVendor(): string {
  return getInfo().chargePointVendor;
}
function getFirmwareVersion(): string {
  return Utils.ifUndefined<string>(getInfo().firmwareVersion, 'Ø');
}
function getStarted(): string {
  return props.chargingStation.started === true ? 'Yes' : 'No';
}
function getWsState(): string {
  switch (props.chargingStation?.wsState) {
    case WebSocket.CONNECTING:
      return 'Connecting';
    case WebSocket.OPEN:
      return 'Open';
    case WebSocket.CLOSING:
      return 'Closing';
    case WebSocket.CLOSED:
      return 'Closed';
    default:
      return 'Ø';
  }
}
function getRegistrationStatus(): string {
  return props.chargingStation?.bootNotificationResponse?.status ?? 'Ø';
}
// function showTagModal(): void {
//   state.isTagModalVisible = true;
// }
// function hideTagModal(): void {
//   state.isTagModalVisible = false;
// }
</script>
