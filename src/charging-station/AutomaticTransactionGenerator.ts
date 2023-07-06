// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { AsyncResource } from 'node:async_hooks';

import type { ChargingStation } from './ChargingStation';
import { ChargingStationUtils } from './ChargingStationUtils';
import { IdTagsCache } from './IdTagsCache';
import { BaseError } from '../exception';
import { PerformanceStatistics } from '../performance';
import {
  AuthorizationStatus,
  type AuthorizeRequest,
  type AuthorizeResponse,
  ConnectorStatusEnum,
  RequestCommand,
  type StartTransactionRequest,
  type StartTransactionResponse,
  type Status,
  StopTransactionReason,
  type StopTransactionResponse,
} from '../types';
import { Constants, Utils, logger } from '../utils';

const moduleName = 'AutomaticTransactionGenerator';

export class AutomaticTransactionGenerator extends AsyncResource {
  private static readonly instances: Map<string, AutomaticTransactionGenerator> = new Map<
    string,
    AutomaticTransactionGenerator
  >();

  public readonly connectorsStatus: Map<number, Status>;
  public started: boolean;
  private starting: boolean;
  private stopping: boolean;
  private readonly chargingStation: ChargingStation;

  private constructor(chargingStation: ChargingStation) {
    super(moduleName);
    this.started = false;
    this.starting = false;
    this.stopping = false;
    this.chargingStation = chargingStation;
    this.connectorsStatus = new Map<number, Status>();
    this.initializeConnectorsStatus();
  }

  public static getInstance(
    chargingStation: ChargingStation
  ): AutomaticTransactionGenerator | undefined {
    if (AutomaticTransactionGenerator.instances.has(chargingStation.stationInfo.hashId) === false) {
      AutomaticTransactionGenerator.instances.set(
        chargingStation.stationInfo.hashId,
        new AutomaticTransactionGenerator(chargingStation)
      );
    }
    return AutomaticTransactionGenerator.instances.get(chargingStation.stationInfo.hashId);
  }

  public start(): void {
    if (
      ChargingStationUtils.checkChargingStation(this.chargingStation, this.logPrefix()) === false
    ) {
      return;
    }
    if (this.started === true) {
      logger.warn(`${this.logPrefix()} is already started`);
      return;
    }
    if (this.starting === true) {
      logger.warn(`${this.logPrefix()} is already starting`);
      return;
    }
    this.starting = true;
    this.startConnectors();
    this.started = true;
    this.starting = false;
  }

  public stop(): void {
    if (this.started === false) {
      logger.warn(`${this.logPrefix()} is already stopped`);
      return;
    }
    if (this.stopping === true) {
      logger.warn(`${this.logPrefix()} is already stopping`);
      return;
    }
    this.stopping = true;
    this.stopConnectors();
    this.started = false;
    this.stopping = false;
  }

  public startConnector(connectorId: number): void {
    if (
      ChargingStationUtils.checkChargingStation(
        this.chargingStation,
        this.logPrefix(connectorId)
      ) === false
    ) {
      return;
    }
    if (this.connectorsStatus.has(connectorId) === false) {
      logger.error(`${this.logPrefix(connectorId)} starting on non existing connector`);
      throw new BaseError(`Connector ${connectorId} does not exist`);
    }
    if (this.connectorsStatus.get(connectorId)?.start === false) {
      this.runInAsyncScope(
        this.internalStartConnector.bind(this) as (
          this: AutomaticTransactionGenerator,
          ...args: any[]
        ) => Promise<void>,
        this,
        connectorId
      ).catch(Constants.EMPTY_FUNCTION);
    } else if (this.connectorsStatus.get(connectorId)?.start === true) {
      logger.warn(`${this.logPrefix(connectorId)} is already started on connector`);
    }
  }

  public stopConnector(connectorId: number): void {
    if (this.connectorsStatus.has(connectorId) === false) {
      logger.error(`${this.logPrefix(connectorId)} stopping on non existing connector`);
      throw new BaseError(`Connector ${connectorId} does not exist`);
    }
    if (this.connectorsStatus.get(connectorId)?.start === true) {
      this.connectorsStatus.get(connectorId).start = false;
    } else if (this.connectorsStatus.get(connectorId)?.start === false) {
      logger.warn(`${this.logPrefix(connectorId)} is already stopped on connector`);
    }
  }

  private startConnectors(): void {
    if (
      this.connectorsStatus?.size > 0 &&
      this.connectorsStatus.size !== this.chargingStation.getNumberOfConnectors()
    ) {
      this.connectorsStatus.clear();
      this.initializeConnectorsStatus();
    }
    if (this.chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of this.chargingStation.evses) {
        if (evseId > 0) {
          for (const connectorId of evseStatus.connectors.keys()) {
            this.startConnector(connectorId);
          }
        }
      }
    } else {
      for (const connectorId of this.chargingStation.connectors.keys()) {
        if (connectorId > 0) {
          this.startConnector(connectorId);
        }
      }
    }
  }

  private stopConnectors(): void {
    if (this.chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of this.chargingStation.evses) {
        if (evseId > 0) {
          for (const connectorId of evseStatus.connectors.keys()) {
            this.stopConnector(connectorId);
          }
        }
      }
    } else {
      for (const connectorId of this.chargingStation.connectors.keys()) {
        if (connectorId > 0) {
          this.stopConnector(connectorId);
        }
      }
    }
  }

  private async internalStartConnector(connectorId: number): Promise<void> {
    this.setStartConnectorStatus(connectorId);
    logger.info(
      `${this.logPrefix(
        connectorId
      )} started on connector and will run for ${Utils.formatDurationMilliSeconds(
        this.connectorsStatus.get(connectorId).stopDate.getTime() -
          this.connectorsStatus.get(connectorId).startDate.getTime()
      )}`
    );
    while (this.connectorsStatus.get(connectorId)?.start === true) {
      if (new Date() > this.connectorsStatus.get(connectorId).stopDate) {
        this.stopConnector(connectorId);
        break;
      }
      if (this.chargingStation.inAcceptedState() === false) {
        logger.error(
          `${this.logPrefix(
            connectorId
          )} entered in transaction loop while the charging station is not in accepted state`
        );
        this.stopConnector(connectorId);
        break;
      }
      if (this.chargingStation.isChargingStationAvailable() === false) {
        logger.info(
          `${this.logPrefix(
            connectorId
          )} entered in transaction loop while the charging station is unavailable`
        );
        this.stopConnector(connectorId);
        break;
      }
      if (this.chargingStation.isConnectorAvailable(connectorId) === false) {
        logger.info(
          `${this.logPrefix(
            connectorId
          )} entered in transaction loop while the connector ${connectorId} is unavailable`
        );
        this.stopConnector(connectorId);
        break;
      }
      if (
        this.chargingStation.getConnectorStatus(connectorId)?.status ===
        ConnectorStatusEnum.Unavailable
      ) {
        logger.info(
          `${this.logPrefix(
            connectorId
          )} entered in transaction loop while the connector ${connectorId} status is unavailable`
        );
        this.stopConnector(connectorId);
        break;
      }
      if (!this.chargingStation?.ocppRequestService) {
        logger.info(
          `${this.logPrefix(
            connectorId
          )} transaction loop waiting for charging station service to be initialized`
        );
        do {
          await Utils.sleep(Constants.CHARGING_STATION_ATG_INITIALIZATION_TIME);
        } while (!this.chargingStation?.ocppRequestService);
      }
      const wait =
        Utils.getRandomInteger(
          this.chargingStation.getAutomaticTransactionGeneratorConfiguration()
            .maxDelayBetweenTwoTransactions,
          this.chargingStation.getAutomaticTransactionGeneratorConfiguration()
            .minDelayBetweenTwoTransactions
        ) * 1000;
      logger.info(
        `${this.logPrefix(connectorId)} waiting for ${Utils.formatDurationMilliSeconds(wait)}`
      );
      await Utils.sleep(wait);
      const start = Utils.secureRandom();
      if (
        start <
        this.chargingStation.getAutomaticTransactionGeneratorConfiguration().probabilityOfStart
      ) {
        this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions = 0;
        // Start transaction
        const startResponse = await this.startTransaction(connectorId);
        if (startResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
          // Wait until end of transaction
          const waitTrxEnd =
            Utils.getRandomInteger(
              this.chargingStation.getAutomaticTransactionGeneratorConfiguration().maxDuration,
              this.chargingStation.getAutomaticTransactionGeneratorConfiguration().minDuration
            ) * 1000;
          logger.info(
            `${this.logPrefix(connectorId)} transaction started with id ${this.chargingStation
              .getConnectorStatus(connectorId)
              ?.transactionId?.toString()} and will stop in ${Utils.formatDurationMilliSeconds(
              waitTrxEnd
            )}`
          );
          await Utils.sleep(waitTrxEnd);
          // Stop transaction
          logger.info(
            `${this.logPrefix(connectorId)} stop transaction with id ${this.chargingStation
              .getConnectorStatus(connectorId)
              ?.transactionId?.toString()}`
          );
          await this.stopTransaction(connectorId);
        }
      } else {
        ++this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions;
        ++this.connectorsStatus.get(connectorId).skippedTransactions;
        logger.info(
          `${this.logPrefix(connectorId)} skipped consecutively ${this.connectorsStatus
            .get(connectorId)
            ?.skippedConsecutiveTransactions?.toString()}/${this.connectorsStatus
            .get(connectorId)
            ?.skippedTransactions?.toString()} transaction(s)`
        );
      }
      this.connectorsStatus.get(connectorId).lastRunDate = new Date();
    }
    this.connectorsStatus.get(connectorId).stoppedDate = new Date();
    logger.info(
      `${this.logPrefix(
        connectorId
      )} stopped on connector and lasted for ${Utils.formatDurationMilliSeconds(
        this.connectorsStatus.get(connectorId).stoppedDate.getTime() -
          this.connectorsStatus.get(connectorId).startDate.getTime()
      )}`
    );
    logger.debug(
      `${this.logPrefix(connectorId)} connector status: %j`,
      this.connectorsStatus.get(connectorId)
    );
  }

  private setStartConnectorStatus(connectorId: number): void {
    this.connectorsStatus.get(connectorId).skippedConsecutiveTransactions = 0;
    const previousRunDuration =
      this.connectorsStatus.get(connectorId)?.startDate &&
      this.connectorsStatus.get(connectorId)?.lastRunDate
        ? this.connectorsStatus.get(connectorId).lastRunDate.getTime() -
          this.connectorsStatus.get(connectorId).startDate.getTime()
        : 0;
    this.connectorsStatus.get(connectorId).startDate = new Date();
    this.connectorsStatus.get(connectorId).stopDate = new Date(
      this.connectorsStatus.get(connectorId).startDate.getTime() +
        this.chargingStation.getAutomaticTransactionGeneratorConfiguration().stopAfterHours *
          3600 *
          1000 -
        previousRunDuration
    );
    this.connectorsStatus.get(connectorId).start = true;
  }

  private initializeConnectorsStatus(): void {
    if (this.chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of this.chargingStation.evses) {
        if (evseId > 0) {
          for (const connectorId of evseStatus.connectors.keys()) {
            this.connectorsStatus.set(connectorId, this.getConnectorStatus(connectorId));
          }
        }
      }
    } else {
      for (const connectorId of this.chargingStation.connectors.keys()) {
        if (connectorId > 0) {
          this.connectorsStatus.set(connectorId, this.getConnectorStatus(connectorId));
        }
      }
    }
  }

  private getConnectorStatus(connectorId: number): Status {
    const connectorStatus = Utils.cloneObject(
      this.chargingStation.getAutomaticTransactionGeneratorStatuses()
    )[connectorId];
    delete connectorStatus?.startDate;
    delete connectorStatus?.lastRunDate;
    delete connectorStatus?.stopDate;
    delete connectorStatus?.stoppedDate;
    return (
      connectorStatus ?? {
        start: false,
        authorizeRequests: 0,
        acceptedAuthorizeRequests: 0,
        rejectedAuthorizeRequests: 0,
        startTransactionRequests: 0,
        acceptedStartTransactionRequests: 0,
        rejectedStartTransactionRequests: 0,
        stopTransactionRequests: 0,
        acceptedStopTransactionRequests: 0,
        rejectedStopTransactionRequests: 0,
        skippedConsecutiveTransactions: 0,
        skippedTransactions: 0,
      }
    );
  }

  private async startTransaction(
    connectorId: number
  ): Promise<StartTransactionResponse | undefined> {
    const measureId = 'StartTransaction with ATG';
    const beginId = PerformanceStatistics.beginMeasure(measureId);
    let startResponse: StartTransactionResponse;
    if (this.chargingStation.hasIdTags()) {
      const idTag = IdTagsCache.getInstance().getIdTag(
        this.chargingStation.getAutomaticTransactionGeneratorConfiguration()?.idTagDistribution,
        this.chargingStation,
        connectorId
      );
      const startTransactionLogMsg = `${this.logPrefix(
        connectorId
      )} start transaction with an idTag '${idTag}'`;
      if (this.getRequireAuthorize()) {
        this.chargingStation.getConnectorStatus(connectorId).authorizeIdTag = idTag;
        // Authorize idTag
        const authorizeResponse: AuthorizeResponse =
          await this.chargingStation.ocppRequestService.requestHandler<
            AuthorizeRequest,
            AuthorizeResponse
          >(this.chargingStation, RequestCommand.AUTHORIZE, {
            idTag,
          });
        ++this.connectorsStatus.get(connectorId).authorizeRequests;
        if (authorizeResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
          ++this.connectorsStatus.get(connectorId).acceptedAuthorizeRequests;
          logger.info(startTransactionLogMsg);
          // Start transaction
          startResponse = await this.chargingStation.ocppRequestService.requestHandler<
            StartTransactionRequest,
            StartTransactionResponse
          >(this.chargingStation, RequestCommand.START_TRANSACTION, {
            connectorId,
            idTag,
          });
          this.handleStartTransactionResponse(connectorId, startResponse);
          PerformanceStatistics.endMeasure(measureId, beginId);
          return startResponse;
        }
        ++this.connectorsStatus.get(connectorId).rejectedAuthorizeRequests;
        PerformanceStatistics.endMeasure(measureId, beginId);
        return startResponse;
      }
      logger.info(startTransactionLogMsg);
      // Start transaction
      startResponse = await this.chargingStation.ocppRequestService.requestHandler<
        StartTransactionRequest,
        StartTransactionResponse
      >(this.chargingStation, RequestCommand.START_TRANSACTION, {
        connectorId,
        idTag,
      });
      this.handleStartTransactionResponse(connectorId, startResponse);
      PerformanceStatistics.endMeasure(measureId, beginId);
      return startResponse;
    }
    logger.info(`${this.logPrefix(connectorId)} start transaction without an idTag`);
    startResponse = await this.chargingStation.ocppRequestService.requestHandler<
      StartTransactionRequest,
      StartTransactionResponse
    >(this.chargingStation, RequestCommand.START_TRANSACTION, { connectorId });
    this.handleStartTransactionResponse(connectorId, startResponse);
    PerformanceStatistics.endMeasure(measureId, beginId);
    return startResponse;
  }

  private async stopTransaction(
    connectorId: number,
    reason: StopTransactionReason = StopTransactionReason.LOCAL
  ): Promise<StopTransactionResponse> {
    const measureId = 'StopTransaction with ATG';
    const beginId = PerformanceStatistics.beginMeasure(measureId);
    let stopResponse: StopTransactionResponse;
    if (this.chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
      stopResponse = await this.chargingStation.stopTransactionOnConnector(connectorId, reason);
      ++this.connectorsStatus.get(connectorId).stopTransactionRequests;
      if (stopResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
        ++this.connectorsStatus.get(connectorId).acceptedStopTransactionRequests;
      } else {
        ++this.connectorsStatus.get(connectorId).rejectedStopTransactionRequests;
      }
    } else {
      const transactionId = this.chargingStation.getConnectorStatus(connectorId)?.transactionId;
      logger.warn(
        `${this.logPrefix(connectorId)} stopping a not started transaction${
          !Utils.isNullOrUndefined(transactionId) ? ` with id ${transactionId?.toString()}` : ''
        }`
      );
    }
    PerformanceStatistics.endMeasure(measureId, beginId);
    return stopResponse;
  }

  private getRequireAuthorize(): boolean {
    return (
      this.chargingStation.getAutomaticTransactionGeneratorConfiguration()?.requireAuthorize ?? true
    );
  }

  private logPrefix = (connectorId?: number): string => {
    return Utils.logPrefix(
      ` ${this.chargingStation.stationInfo.chargingStationId} | ATG${
        !Utils.isNullOrUndefined(connectorId) ? ` on connector #${connectorId.toString()}` : ''
      }:`
    );
  };

  private handleStartTransactionResponse(
    connectorId: number,
    startResponse: StartTransactionResponse
  ): void {
    ++this.connectorsStatus.get(connectorId).startTransactionRequests;
    if (startResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED) {
      ++this.connectorsStatus.get(connectorId).acceptedStartTransactionRequests;
    } else {
      logger.warn(`${this.logPrefix(connectorId)} start transaction rejected`);
      ++this.connectorsStatus.get(connectorId).rejectedStartTransactionRequests;
    }
  }
}
