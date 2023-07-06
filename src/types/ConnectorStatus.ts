import type { OCPP16ChargePointErrorCode } from '.';
import type { SampledValueTemplate } from './MeasurandPerPhaseSampledValueTemplates';
import type { ChargingProfile } from './ocpp/ChargingProfile';
import type { ConnectorStatusEnum } from './ocpp/ConnectorStatusEnum';
import type { MeterValue } from './ocpp/MeterValues';
import type { AvailabilityType } from './ocpp/Requests';
import type { Reservation } from './ocpp/Reservation';

export type ConnectorStatus = {
  availability: AvailabilityType;
  bootStatus?: ConnectorStatusEnum;
  transactionEndToStatus?: ConnectorStatusEnum;
  bootErrorCode?: OCPP16ChargePointErrorCode;
  status?: ConnectorStatusEnum;
  MeterValues: SampledValueTemplate[];
  authorizeIdTag?: string;
  idTagAuthorized?: boolean;
  localAuthorizeIdTag?: string;
  idTagLocalAuthorized?: boolean;
  transactionRemoteStarted?: boolean;
  transactionStarted?: boolean;
  transactionId?: number;
  transactionSetInterval?: NodeJS.Timeout;
  transactionIdTag?: string;
  energyActiveImportRegisterValue?: number; // In Wh
  transactionEnergyActiveImportRegisterValue?: number; // In Wh
  transactionBeginMeterValue?: MeterValue;
  chargingProfiles?: ChargingProfile[];
  reservation?: Reservation;
};
