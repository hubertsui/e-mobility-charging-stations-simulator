<template>
  <template v-for="(connector, index) in getConnectors()">
    <tr class="cs-table__row">
      <CSConnector
        :hash-id="getHashId()"
        :connector="connector"
        :connector-id="index + 1"
        :transaction-id="connector.transactionId"
        :id-tag="props.idTag"
        @toggle-messages="toggleMessages()"
      />
      <td class="cs-table__name-col">{{ getId() }}</td>
      <td class="cs-table__display-name-col">{{ getDisplayName() }}</td>
      <td class="cs-table__started-col">
        {{ getStarted() }}<br />{{ getWsState() }}<br />{{ getRegistrationStatus() }}
      </td>
      <td class="cs-table__vendor-col">{{ getVendor() }}<br />{{ getModel() }}</td>
      <td class="cs-table__firmware-col">{{ getFirmwareVersion() }}</td>
      <td class="cs-table__firmwarestatus-col">{{ getFirmwareStatus() }}</td>
    </tr>
    <tr v-if="state.isMessagesVisible" class="cs-table__row">
      <td class="cs-table__messages-col" colspan="12">
        <div class="message-container">
          <div v-for="msg in getMessages()" :class="'message message-' + msg.type">
            <div class="msg-time">{{ msg.time }}</div>
            <div class="msg-payload">{{ msg.payload }}</div>
            <div v-if="!msg.success" class="msg-fail">Failed!</div>
          </div>
        </div>
      </td>
    </tr>
  </template>
</template>

<script setup lang="ts">
// import { reactive } from 'vue';
import { reactive } from 'vue';
import CSConnector from './CSConnector.vue';
import type {
  ChargingStationData,
  ChargingStationInfo,
  ConnectorStatus,
  MessageLog,
} from '@/types';
import { ifUndefined } from '@/composables/Utils';

const props = defineProps<{
  chargingStation: ChargingStationData;
  idTag: string;
}>();

type State = {
  // isTagModalVisible: boolean;
  // idTag: string;
  isMessagesVisible: boolean;
};
const state: State = reactive({
  // isTagModalVisible: false,
  // idTag: '',
  isMessagesVisible: false,
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
  return ifUndefined<string>(getInfo().chargingStationId, 'Ø');
}
function getDisplayName(): string {
  return getInfo().displayName;
}
function getModel(): string {
  return getInfo().chargePointModel;
}
function getFirmwareStatus(): string {
  return getInfo().firmwareStatus || 'Unknown';
}
function getMessages(): MessageLog[] {
  return getInfo().messages || [];
}
function getVendor(): string {
  return getInfo().chargePointVendor;
}
function getFirmwareVersion(): string {
  return ifUndefined<string>(getInfo().firmwareVersion, 'Ø');
}
function getStarted(): string {
  return props.chargingStation.started === true ? '运行中' : '关机';
}
function getWsState(): string {
  switch (props.chargingStation?.wsState) {
    case WebSocket.CONNECTING:
      return '连接中';
    case WebSocket.OPEN:
      return '已连接';
    case WebSocket.CLOSING:
      return '关闭连接中';
    case WebSocket.CLOSED:
      return '连接已关闭';
    default:
      return '连接状态未知';
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
