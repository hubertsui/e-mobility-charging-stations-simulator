import { Utils } from './Utils';
import type { ChargingStation } from '../charging-station';
import type {
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ConnectorStatus,
  EvseStatusConfiguration,
  EvseStatusWorkerType,
} from '../types';

export const buildChargingStationAutomaticTransactionGeneratorConfiguration = (
  chargingStation: ChargingStation
): ChargingStationAutomaticTransactionGeneratorConfiguration => {
  return {
    automaticTransactionGenerator: chargingStation.getAutomaticTransactionGeneratorConfiguration(),
    ...(!Utils.isNullOrUndefined(
      chargingStation.automaticTransactionGenerator?.connectorsStatus
    ) && {
      automaticTransactionGeneratorStatuses: [
        ...chargingStation.automaticTransactionGenerator.connectorsStatus.values(),
      ],
    }),
  };
};

export const buildConnectorsStatus = (chargingStation: ChargingStation): ConnectorStatus[] => {
  return [...chargingStation.connectors.values()].map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ transactionSetInterval, ...connectorStatusRest }) => connectorStatusRest
  );
};

export const enum OutputFormat {
  configuration = 'configuration',
  worker = 'worker',
}

export const buildEvsesStatus = (
  chargingStation: ChargingStation,
  outputFormat: OutputFormat = OutputFormat.configuration
): (EvseStatusWorkerType | EvseStatusConfiguration)[] => {
  return [...chargingStation.evses.values()].map((evseStatus) => {
    const connectorsStatus = [...evseStatus.connectors.values()].map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ transactionSetInterval, ...connectorStatusRest }) => connectorStatusRest
    );
    let status: EvseStatusConfiguration;
    switch (outputFormat) {
      case OutputFormat.worker:
        return {
          ...evseStatus,
          connectors: connectorsStatus,
        };
      case OutputFormat.configuration:
        status = {
          ...evseStatus,
          connectorsStatus,
        };
        delete (status as EvseStatusWorkerType).connectors;
        return status;
    }
  });
};
