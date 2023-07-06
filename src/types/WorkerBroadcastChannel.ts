import type { RequestPayload, ResponsePayload } from './UIProtocol';

export type BroadcastChannelRequest = [
  string,
  BroadcastChannelProcedureName,
  BroadcastChannelRequestPayload
];
export type BroadcastChannelResponse = [string, BroadcastChannelResponsePayload];

export enum BroadcastChannelProcedureName {
  START_CHARGING_STATION = 'startChargingStation',
  STOP_CHARGING_STATION = 'stopChargingStation',
  OPEN_CONNECTION = 'openConnection',
  CLOSE_CONNECTION = 'closeConnection',
  START_AUTOMATIC_TRANSACTION_GENERATOR = 'startAutomaticTransactionGenerator',
  STOP_AUTOMATIC_TRANSACTION_GENERATOR = 'stopAutomaticTransactionGenerator',
  SET_SUPERVISION_URL = 'setSupervisionUrl',
  START_TRANSACTION = 'startTransaction',
  STOP_TRANSACTION = 'stopTransaction',
  AUTHORIZE = 'authorize',
  BOOT_NOTIFICATION = 'bootNotification',
  STATUS_NOTIFICATION = 'statusNotification',
  HEARTBEAT = 'heartbeat',
  METER_VALUES = 'meterValues',
  DATA_TRANSFER = 'dataTransfer',
  DIAGNOSTICS_STATUS_NOTIFICATION = 'diagnosticsStatusNotification',
  FIRMWARE_STATUS_NOTIFICATION = 'firmwareStatusNotification',
}

export interface BroadcastChannelRequestPayload extends RequestPayload {
  connectorId?: number;
  transactionId?: number;
}

export interface BroadcastChannelResponsePayload
  extends Omit<ResponsePayload, 'hashIdsSucceeded' | 'hashIdsFailed' | 'responsesFailed'> {
  hashId: string;
}

export type MessageEvent = { data: BroadcastChannelRequest | BroadcastChannelResponse };
