import type { ChargingStationTemplate } from './ChargingStationTemplate';
import type { FirmwareStatus } from './ocpp/Requests';

export class MessageLog {
  public type?: string;
  public name?: string;
  public payload?: string;
  public time?: Date;
  public success?: boolean;
}

export type ChargingStationInfo = Omit<
  ChargingStationTemplate,
  | 'AutomaticTransactionGenerator'
  | 'Configuration'
  | 'Connectors'
  | 'Evses'
  | 'power'
  | 'powerUnit'
  | 'chargeBoxSerialNumberPrefix'
  | 'chargePointSerialNumberPrefix'
  | 'meterSerialNumberPrefix'
> & {
  hashId: string;
  /** @deprecated Use hashId instead */
  infoHash?: string;
  chargingStationId?: string;
  chargeBoxSerialNumber?: string;
  chargePointSerialNumber?: string;
  meterSerialNumber?: string;
  maximumPower?: number; // Always in Watt
  maximumAmperage?: number; // Always in Ampere
  firmwareStatus?: FirmwareStatus;
  messages: MessageLog[];
};

export interface ChargingStationInfoConfiguration {
  stationInfo?: ChargingStationInfo;
}
