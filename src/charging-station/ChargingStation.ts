// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { parentPort } from 'node:worker_threads';

import merge from 'just-merge';
import WebSocket, { type RawData } from 'ws';

import { AutomaticTransactionGenerator } from './AutomaticTransactionGenerator';
import { ChargingStationWorkerBroadcastChannel } from './broadcast-channel/ChargingStationWorkerBroadcastChannel';
import { ChargingStationConfigurationUtils } from './ChargingStationConfigurationUtils';
import { ChargingStationUtils } from './ChargingStationUtils';
import { IdTagsCache } from './IdTagsCache';
import {
  OCPP16IncomingRequestService,
  OCPP16RequestService,
  OCPP16ResponseService,
  OCPP16ServiceUtils,
  OCPP20IncomingRequestService,
  OCPP20RequestService,
  OCPP20ResponseService,
  type OCPPIncomingRequestService,
  type OCPPRequestService,
  OCPPServiceUtils,
} from './ocpp';
import { SharedLRUCache } from './SharedLRUCache';
import { BaseError, OCPPError } from '../exception';
import { PerformanceStatistics } from '../performance';
import {
  type AutomaticTransactionGeneratorConfiguration,
  AvailabilityType,
  type BootNotificationRequest,
  type BootNotificationResponse,
  type CachedRequest,
  type ChargingStationConfiguration,
  type ChargingStationInfo,
  type ChargingStationOcppConfiguration,
  type ChargingStationTemplate,
  type ConnectorStatus,
  ConnectorStatusEnum,
  CurrentType,
  type ErrorCallback,
  type ErrorResponse,
  ErrorType,
  type EvseStatus,
  type EvseStatusConfiguration,
  FileType,
  FirmwareStatus,
  type FirmwareStatusNotificationRequest,
  type FirmwareStatusNotificationResponse,
  type FirmwareUpgrade,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type IncomingRequest,
  type IncomingRequestCommand,
  type JsonType,
  MessageType,
  type MeterValue,
  MeterValueMeasurand,
  type MeterValuesRequest,
  type MeterValuesResponse,
  OCPPVersion,
  type OutgoingRequest,
  PowerUnits,
  RegistrationStatusEnumType,
  RequestCommand,
  type Reservation,
  ReservationFilterKey,
  ReservationTerminationReason,
  type Response,
  StandardParametersKey,
  type Status,
  type StatusNotificationRequest,
  type StatusNotificationResponse,
  StopTransactionReason,
  type StopTransactionRequest,
  type StopTransactionResponse,
  SupervisionUrlDistribution,
  SupportedFeatureProfiles,
  VendorParametersKey,
  type WSError,
  WebSocketCloseEventStatusCode,
  type WsOptions,
  OCPP16ChargePointStatus,
  OCPP16FirmwareStatus,
} from '../types';
import {
  ACElectricUtils,
  AsyncLock,
  AsyncLockType,
  Configuration,
  Constants,
  DCElectricUtils,
  Utils,
  buildChargingStationAutomaticTransactionGeneratorConfiguration,
  buildConnectorsStatus,
  buildEvsesStatus,
  buildStartedMessage,
  buildStoppedMessage,
  buildUpdatedMessage,
  handleFileException,
  logger,
  watchJsonFile,
} from '../utils';
import type { MessageLog } from '../types/ChargingStationInfo';

export class ChargingStation {
  public readonly index: number;
  public readonly templateFile: string;
  public stationInfo!: ChargingStationInfo;
  public started: boolean;
  public starting: boolean;
  public idTagsCache: IdTagsCache;
  public automaticTransactionGenerator!: AutomaticTransactionGenerator | undefined;
  public ocppConfiguration!: ChargingStationOcppConfiguration | undefined;
  public wsConnection!: WebSocket | null;
  public readonly connectors: Map<number, ConnectorStatus>;
  public readonly evses: Map<number, EvseStatus>;
  public readonly requests: Map<string, CachedRequest>;
  public performanceStatistics!: PerformanceStatistics | undefined;
  public heartbeatSetInterval!: NodeJS.Timeout;
  public ocppRequestService!: OCPPRequestService;
  public bootNotificationRequest!: BootNotificationRequest;
  public bootNotificationResponse!: BootNotificationResponse | undefined;
  public powerDivider!: number;
  private stopping: boolean;
  private configurationFile!: string;
  private configurationFileHash!: string;
  private connectorsConfigurationHash!: string;
  private evsesConfigurationHash!: string;
  private ocppIncomingRequestService!: OCPPIncomingRequestService;
  private readonly messageBuffer: Set<string>;
  private configuredSupervisionUrl!: URL;
  private wsConnectionRestarted: boolean;
  private autoReconnectRetryCount: number;
  private templateFileWatcher!: fs.FSWatcher | undefined;
  private templateFileHash!: string;
  private readonly sharedLRUCache: SharedLRUCache;
  private webSocketPingSetInterval!: NodeJS.Timeout;
  private readonly chargingStationWorkerBroadcastChannel: ChargingStationWorkerBroadcastChannel;
  private reservationExpirationSetInterval?: NodeJS.Timeout;

  constructor(index: number, templateFile: string) {
    this.started = false;
    this.starting = false;
    this.stopping = false;
    this.wsConnectionRestarted = false;
    this.autoReconnectRetryCount = 0;
    this.index = index;
    this.templateFile = templateFile;
    this.connectors = new Map<number, ConnectorStatus>();
    this.evses = new Map<number, EvseStatus>();
    this.requests = new Map<string, CachedRequest>();
    this.messageBuffer = new Set<string>();
    this.sharedLRUCache = SharedLRUCache.getInstance();
    this.idTagsCache = IdTagsCache.getInstance();
    this.chargingStationWorkerBroadcastChannel = new ChargingStationWorkerBroadcastChannel(this);

    this.initialize();
  }

  public get hasEvses(): boolean {
    return this.connectors.size === 0 && this.evses.size > 0;
  }

  private get wsConnectionUrl(): URL {
    return new URL(
      `${this.getSupervisionUrlOcppConfiguration() &&
        Utils.isNotEmptyString(this.getSupervisionUrlOcppKey()) &&
        Utils.isNotEmptyString(
          ChargingStationConfigurationUtils.getConfigurationKey(
            this,
            this.getSupervisionUrlOcppKey()
          )?.value
        )
        ? ChargingStationConfigurationUtils.getConfigurationKey(
          this,
          this.getSupervisionUrlOcppKey()
        ).value
        : this.configuredSupervisionUrl.href
      }/${this.stationInfo.chargingStationId}`
    );
  }

  public logPrefix = (): string => {
    return Utils.logPrefix(
      ` ${(Utils.isNotEmptyString(this?.stationInfo?.chargingStationId)
        ? this?.stationInfo?.chargingStationId
        : ChargingStationUtils.getChargingStationId(this.index, this.getTemplateFromFile())) ??
      'Error at building log prefix'
      } |`
    );
  };

  public hasIdTags(): boolean {
    return Utils.isNotEmptyArray(
      this.idTagsCache.getIdTags(ChargingStationUtils.getIdTagsFile(this.stationInfo))
    );
  }

  public getEnableStatistics(): boolean {
    return this.stationInfo.enableStatistics ?? false;
  }

  public getMustAuthorizeAtRemoteStart(): boolean {
    return this.stationInfo.mustAuthorizeAtRemoteStart ?? true;
  }

  public getPayloadSchemaValidation(): boolean {
    return this.stationInfo.payloadSchemaValidation ?? true;
  }

  public getNumberOfPhases(stationInfo?: ChargingStationInfo): number | undefined {
    const localStationInfo: ChargingStationInfo = stationInfo ?? this.stationInfo;
    switch (this.getCurrentOutType(stationInfo)) {
      case CurrentType.AC:
        return !Utils.isUndefined(localStationInfo.numberOfPhases)
          ? localStationInfo.numberOfPhases
          : 3;
      case CurrentType.DC:
        return 0;
    }
  }

  public isWebSocketConnectionOpened(): boolean {
    return this?.wsConnection?.readyState === WebSocket.OPEN;
  }

  public getRegistrationStatus(): RegistrationStatusEnumType | undefined {
    return this?.bootNotificationResponse?.status;
  }

  public inUnknownState(): boolean {
    return Utils.isNullOrUndefined(this?.bootNotificationResponse?.status);
  }

  public inPendingState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatusEnumType.PENDING;
  }

  public inAcceptedState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatusEnumType.ACCEPTED;
  }

  public inRejectedState(): boolean {
    return this?.bootNotificationResponse?.status === RegistrationStatusEnumType.REJECTED;
  }

  public isRegistered(): boolean {
    return (
      this.inUnknownState() === false &&
      (this.inAcceptedState() === true || this.inPendingState() === true)
    );
  }

  public isChargingStationAvailable(): boolean {
    return this.getConnectorStatus(0)?.availability === AvailabilityType.Operative;
  }

  public hasConnector(connectorId: number): boolean {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        if (evseStatus.connectors.has(connectorId)) {
          return true;
        }
      }
      return false;
    }
    return this.connectors.has(connectorId);
  }

  public isConnectorAvailable(connectorId: number): boolean {
    return (
      connectorId > 0 &&
      this.getConnectorStatus(connectorId)?.availability === AvailabilityType.Operative
    );
  }

  public isConnectorTransactionEndToStatus(id: number): ConnectorStatusEnum {
    return this.connectors.get(id).transactionEndToStatus ?? ConnectorStatusEnum.Available;
  }

  public async updateStatus(status?: string) {
    if (status?.length) {
      const connectorStatus = OCPP16ChargePointStatus[status]
      if (connectorStatus) {
        for (const connectorId of this.connectors.keys()) {
          if (connectorId > 0) {
            await OCPPServiceUtils.sendAndSetConnectorStatus(
              this,
              connectorId,
              connectorStatus,
              null,
              { send: true }
            );
          }
        }
        this.saveConfiguration();
      }
    }
  }

  public async updateFirmwareStatus(status: string) {
    if (status?.length) {
      const firmwareStatus = OCPP16FirmwareStatus[status]
      if (firmwareStatus) {
        this.stationInfo.firmwareStatus = firmwareStatus;
        this.saveConfiguration();
        await this.ocppRequestService.requestHandler<
          FirmwareStatusNotificationRequest,
          FirmwareStatusNotificationResponse
        >(this, RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
          status: firmwareStatus,
        });
      }
    }
  }

  public getNumberOfConnectors(): number {
    if (this.hasEvses) {
      let numberOfConnectors = 0;
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId > 0) {
          numberOfConnectors += evseStatus.connectors.size;
        }
      }
      return numberOfConnectors;
    }
    return this.connectors.has(0) ? this.connectors.size - 1 : this.connectors.size;
  }

  public getNumberOfEvses(): number {
    return this.evses.has(0) ? this.evses.size - 1 : this.evses.size;
  }

  public getConnectorStatus(connectorId: number): ConnectorStatus | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        if (evseStatus.connectors.has(connectorId)) {
          return evseStatus.connectors.get(connectorId);
        }
      }
      return undefined;
    }
    return this.connectors.get(connectorId);
  }

  public getCurrentOutType(stationInfo?: ChargingStationInfo): CurrentType {
    return (stationInfo ?? this.stationInfo)?.currentOutType ?? CurrentType.AC;
  }

  public getOcppStrictCompliance(): boolean {
    return this.stationInfo?.ocppStrictCompliance ?? false;
  }

  public getVoltageOut(stationInfo?: ChargingStationInfo): number | undefined {
    const defaultVoltageOut = ChargingStationUtils.getDefaultVoltageOut(
      this.getCurrentOutType(stationInfo),
      this.logPrefix(),
      this.templateFile
    );
    return (stationInfo ?? this.stationInfo).voltageOut ?? defaultVoltageOut;
  }

  public getMaximumPower(stationInfo?: ChargingStationInfo): number {
    const localStationInfo = stationInfo ?? this.stationInfo;
    return (localStationInfo['maxPower'] as number) ?? localStationInfo.maximumPower;
  }

  public getConnectorMaximumAvailablePower(connectorId: number): number {
    let connectorAmperageLimitationPowerLimit: number;
    if (
      !Utils.isNullOrUndefined(this.getAmperageLimitation()) &&
      this.getAmperageLimitation() < this.stationInfo?.maximumAmperage
    ) {
      connectorAmperageLimitationPowerLimit =
        (this.getCurrentOutType() === CurrentType.AC
          ? ACElectricUtils.powerTotal(
            this.getNumberOfPhases(),
            this.getVoltageOut(),
            this.getAmperageLimitation() *
            (this.hasEvses ? this.getNumberOfEvses() : this.getNumberOfConnectors())
          )
          : DCElectricUtils.power(this.getVoltageOut(), this.getAmperageLimitation())) /
        this.powerDivider;
    }
    const connectorMaximumPower = this.getMaximumPower() / this.powerDivider;
    const connectorChargingProfilesPowerLimit =
      ChargingStationUtils.getChargingStationConnectorChargingProfilesPowerLimit(this, connectorId);
    return Math.min(
      isNaN(connectorMaximumPower) ? Infinity : connectorMaximumPower,
      isNaN(connectorAmperageLimitationPowerLimit)
        ? Infinity
        : connectorAmperageLimitationPowerLimit,
      isNaN(connectorChargingProfilesPowerLimit) ? Infinity : connectorChargingProfilesPowerLimit
    );
  }

  public getTransactionIdTag(transactionId: number): string | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus.transactionId === transactionId) {
            return connectorStatus.transactionIdTag;
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (this.getConnectorStatus(connectorId)?.transactionId === transactionId) {
          return this.getConnectorStatus(connectorId)?.transactionIdTag;
        }
      }
    }
  }

  public getNumberOfRunningTransactions(): number {
    let trxCount = 0;
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId === 0) {
          continue;
        }
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus.transactionStarted === true) {
            ++trxCount;
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted === true) {
          ++trxCount;
        }
      }
    }
    return trxCount;
  }

  public getOutOfOrderEndMeterValues(): boolean {
    return this.stationInfo?.outOfOrderEndMeterValues ?? false;
  }

  public getBeginEndMeterValues(): boolean {
    return this.stationInfo?.beginEndMeterValues ?? false;
  }

  public getMeteringPerTransaction(): boolean {
    return this.stationInfo?.meteringPerTransaction ?? true;
  }

  public getTransactionDataMeterValues(): boolean {
    return this.stationInfo?.transactionDataMeterValues ?? false;
  }

  public getMainVoltageMeterValues(): boolean {
    return this.stationInfo?.mainVoltageMeterValues ?? true;
  }

  public getPhaseLineToLineVoltageMeterValues(): boolean {
    return this.stationInfo?.phaseLineToLineVoltageMeterValues ?? false;
  }

  public getCustomValueLimitationMeterValues(): boolean {
    return this.stationInfo?.customValueLimitationMeterValues ?? true;
  }

  public getConnectorIdByTransactionId(transactionId: number): number | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          if (connectorStatus.transactionId === transactionId) {
            return connectorId;
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (this.getConnectorStatus(connectorId)?.transactionId === transactionId) {
          return connectorId;
        }
      }
    }
  }

  public getEnergyActiveImportRegisterByTransactionId(
    transactionId: number,
    rounded = false
  ): number {
    return this.getEnergyActiveImportRegister(
      this.getConnectorStatus(this.getConnectorIdByTransactionId(transactionId)),
      rounded
    );
  }

  public getEnergyActiveImportRegisterByConnectorId(connectorId: number, rounded = false): number {
    return this.getEnergyActiveImportRegister(this.getConnectorStatus(connectorId), rounded);
  }

  public getAuthorizeRemoteTxRequests(): boolean {
    const authorizeRemoteTxRequests = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.AuthorizeRemoteTxRequests
    );
    return authorizeRemoteTxRequests
      ? Utils.convertToBoolean(authorizeRemoteTxRequests.value)
      : false;
  }

  public getLocalAuthListEnabled(): boolean {
    const localAuthListEnabled = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.LocalAuthListEnabled
    );
    return localAuthListEnabled ? Utils.convertToBoolean(localAuthListEnabled.value) : false;
  }

  public getHeartbeatInterval(): number {
    const HeartbeatInterval = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.HeartbeatInterval
    );
    if (HeartbeatInterval) {
      return Utils.convertToInt(HeartbeatInterval.value) * 1000;
    }
    const HeartBeatInterval = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.HeartBeatInterval
    );
    if (HeartBeatInterval) {
      return Utils.convertToInt(HeartBeatInterval.value) * 1000;
    }
    this.stationInfo?.autoRegister === false &&
      logger.warn(
        `${this.logPrefix()} Heartbeat interval configuration key not set, using default value: ${Constants.DEFAULT_HEARTBEAT_INTERVAL
        }`
      );
    return Constants.DEFAULT_HEARTBEAT_INTERVAL;
  }

  public setSupervisionUrl(url: string): void {
    if (
      this.getSupervisionUrlOcppConfiguration() &&
      Utils.isNotEmptyString(this.getSupervisionUrlOcppKey())
    ) {
      ChargingStationConfigurationUtils.setConfigurationKeyValue(
        this,
        this.getSupervisionUrlOcppKey(),
        url
      );
    } else {
      this.stationInfo.supervisionUrls = url;
      this.saveStationInfo();
      this.configuredSupervisionUrl = this.getConfiguredSupervisionUrl();
    }
  }

  public startHeartbeat(): void {
    if (this.getHeartbeatInterval() > 0 && !this.heartbeatSetInterval) {
      this.heartbeatSetInterval = setInterval(() => {
        this.ocppRequestService
          .requestHandler<HeartbeatRequest, HeartbeatResponse>(this, RequestCommand.HEARTBEAT)
          .catch((error) => {
            logger.error(
              `${this.logPrefix()} Error while sending '${RequestCommand.HEARTBEAT}':`,
              error
            );
          });
      }, this.getHeartbeatInterval());
      logger.info(
        `${this.logPrefix()} Heartbeat started every ${Utils.formatDurationMilliSeconds(
          this.getHeartbeatInterval()
        )}`
      );
    } else if (this.heartbeatSetInterval) {
      logger.info(
        `${this.logPrefix()} Heartbeat already started every ${Utils.formatDurationMilliSeconds(
          this.getHeartbeatInterval()
        )}`
      );
    } else {
      logger.error(
        `${this.logPrefix()} Heartbeat interval set to ${this.getHeartbeatInterval()},
          not starting the heartbeat`
      );
    }
  }

  public restartHeartbeat(): void {
    // Stop heartbeat
    this.stopHeartbeat();
    // Start heartbeat
    this.startHeartbeat();
  }

  public restartWebSocketPing(): void {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Start WebSocket ping
    this.startWebSocketPing();
  }

  public startMeterValues(connectorId: number, interval: number): void {
    if (connectorId === 0) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector id ${connectorId.toString()}`
      );
      return;
    }
    if (!this.getConnectorStatus(connectorId)) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on non existing connector id
          ${connectorId.toString()}`
      );
      return;
    }
    if (this.getConnectorStatus(connectorId)?.transactionStarted === false) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector id ${connectorId}
          with no transaction started`
      );
      return;
    } else if (
      this.getConnectorStatus(connectorId)?.transactionStarted === true &&
      Utils.isNullOrUndefined(this.getConnectorStatus(connectorId)?.transactionId)
    ) {
      logger.error(
        `${this.logPrefix()} Trying to start MeterValues on connector id ${connectorId}
          with no transaction id`
      );
      return;
    }
    if (interval > 0) {
      this.getConnectorStatus(connectorId).transactionSetInterval = setInterval(() => {
        // FIXME: Implement OCPP version agnostic helpers
        const meterValue: MeterValue = OCPP16ServiceUtils.buildMeterValue(
          this,
          connectorId,
          this.getConnectorStatus(connectorId).transactionId,
          interval
        );
        this.ocppRequestService
          .requestHandler<MeterValuesRequest, MeterValuesResponse>(
            this,
            RequestCommand.METER_VALUES,
            {
              connectorId,
              transactionId: this.getConnectorStatus(connectorId)?.transactionId,
              meterValue: [meterValue],
            }
          )
          .catch((error) => {
            logger.error(
              `${this.logPrefix()} Error while sending '${RequestCommand.METER_VALUES}':`,
              error
            );
          });
      }, interval);
    } else {
      logger.error(
        `${this.logPrefix()} Charging station ${StandardParametersKey.MeterValueSampleInterval
        } configuration set to ${interval}, not sending MeterValues`
      );
    }
  }

  public stopMeterValues(connectorId: number) {
    if (this.getConnectorStatus(connectorId)?.transactionSetInterval) {
      clearInterval(this.getConnectorStatus(connectorId)?.transactionSetInterval);
    }
  }

  public start(): void {
    if (this.started === false) {
      if (this.starting === false) {
        this.starting = true;
        if (this.getEnableStatistics() === true) {
          this.performanceStatistics?.start();
        }
        if (this.hasFeatureProfile(SupportedFeatureProfiles.Reservation)) {
          this.startReservationExpirationSetInterval();
        }
        this.openWSConnection();
        // Monitor charging station template file
        this.templateFileWatcher = watchJsonFile(
          this.templateFile,
          FileType.ChargingStationTemplate,
          this.logPrefix(),
          undefined,
          (event, filename): void => {
            if (Utils.isNotEmptyString(filename) && event === 'change') {
              try {
                logger.debug(
                  `${this.logPrefix()} ${FileType.ChargingStationTemplate} ${this.templateFile
                  } file have changed, reload`
                );
                this.sharedLRUCache.deleteChargingStationTemplate(this.templateFileHash);
                // FIXME: cleanup idtags cache if idtags file has changed
                // Initialize
                this.initialize();
                // Restart the ATG
                this.stopAutomaticTransactionGenerator();
                if (this.getAutomaticTransactionGeneratorConfiguration()?.enable === true) {
                  this.startAutomaticTransactionGenerator();
                }
                if (this.getEnableStatistics() === true) {
                  this.performanceStatistics?.restart();
                } else {
                  this.performanceStatistics?.stop();
                }
                // FIXME?: restart heartbeat and WebSocket ping when their interval values have changed
              } catch (error) {
                logger.error(
                  `${this.logPrefix()} ${FileType.ChargingStationTemplate} file monitoring error:`,
                  error
                );
              }
            }
          }
        );
        this.started = true;
        parentPort?.postMessage(buildStartedMessage(this));
        this.starting = false;
      } else {
        logger.warn(`${this.logPrefix()} Charging station is already starting...`);
      }
    } else {
      logger.warn(`${this.logPrefix()} Charging station is already started...`);
    }
  }

  public async stop(reason?: StopTransactionReason): Promise<void> {
    if (this.started === true) {
      if (this.stopping === false) {
        this.stopping = true;
        await this.stopMessageSequence(reason);
        this.closeWSConnection();
        if (this.getEnableStatistics() === true) {
          this.performanceStatistics?.stop();
        }
        this.sharedLRUCache.deleteChargingStationConfiguration(this.configurationFileHash);
        this.templateFileWatcher?.close();
        this.sharedLRUCache.deleteChargingStationTemplate(this.templateFileHash);
        delete this.bootNotificationResponse;
        this.started = false;
        this.saveConfiguration();
        parentPort?.postMessage(buildStoppedMessage(this));
        this.stopping = false;
      } else {
        logger.warn(`${this.logPrefix()} Charging station is already stopping...`);
      }
    } else {
      logger.warn(`${this.logPrefix()} Charging station is already stopped...`);
    }
  }

  public async reset(reason?: StopTransactionReason): Promise<void> {
    await this.stop(reason);
    await Utils.sleep(this.stationInfo.resetTime);
    this.initialize();
    this.start();
  }

  public saveOcppConfiguration(): void {
    if (this.getOcppPersistentConfiguration()) {
      this.saveConfiguration();
    }
  }

  public hasFeatureProfile(featureProfile: SupportedFeatureProfiles): boolean | undefined {
    return ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.SupportedFeatureProfiles
    )?.value?.includes(featureProfile);
  }

  public bufferMessage(message: string): void {
    this.messageBuffer.add(message);
  }

  public openWSConnection(
    options: WsOptions = this.stationInfo?.wsOptions ?? {},
    params: { closeOpened?: boolean; terminateOpened?: boolean } = {
      closeOpened: false,
      terminateOpened: false,
    }
  ): void {
    options = { handshakeTimeout: this.getConnectionTimeout() * 1000, ...options };
    params = { ...{ closeOpened: false, terminateOpened: false }, ...params };
    if (this.started === false && this.starting === false) {
      logger.warn(
        `${this.logPrefix()} Cannot open OCPP connection to URL ${this.wsConnectionUrl.toString()}
          on stopped charging station`
      );
      return;
    }
    if (
      !Utils.isNullOrUndefined(this.stationInfo.supervisionUser) &&
      !Utils.isNullOrUndefined(this.stationInfo.supervisionPassword)
    ) {
      options.auth = `${this.stationInfo.supervisionUser}:${this.stationInfo.supervisionPassword}`;
    }
    if (params?.closeOpened) {
      this.closeWSConnection();
    }
    if (params?.terminateOpened) {
      this.terminateWSConnection();
    }

    if (this.isWebSocketConnectionOpened() === true) {
      logger.warn(
        `${this.logPrefix()} OCPP connection to URL ${this.wsConnectionUrl.toString()}
          is already opened`
      );
      return;
    }

    logger.info(
      `${this.logPrefix()} Open OCPP connection to URL ${this.wsConnectionUrl.toString()}`
    );

    this.wsConnection = new WebSocket(
      this.wsConnectionUrl,
      `ocpp${this.stationInfo.ocppVersion ?? OCPPVersion.VERSION_16}`,
      options
    );

    // Handle WebSocket message
    this.wsConnection.on(
      'message',
      this.onMessage.bind(this) as (this: WebSocket, data: RawData, isBinary: boolean) => void
    );
    // Handle WebSocket error
    this.wsConnection.on(
      'error',
      this.onError.bind(this) as (this: WebSocket, error: Error) => void
    );
    // Handle WebSocket close
    this.wsConnection.on(
      'close',
      this.onClose.bind(this) as (this: WebSocket, code: number, reason: Buffer) => void
    );
    // Handle WebSocket open
    this.wsConnection.on('open', this.onOpen.bind(this) as (this: WebSocket) => void);
    // Handle WebSocket ping
    this.wsConnection.on('ping', this.onPing.bind(this) as (this: WebSocket, data: Buffer) => void);
    // Handle WebSocket pong
    this.wsConnection.on('pong', this.onPong.bind(this) as (this: WebSocket, data: Buffer) => void);
  }

  public closeWSConnection(): void {
    if (this.isWebSocketConnectionOpened() === true) {
      this.wsConnection?.close();
      this.wsConnection = null;
    }
  }

  public getAutomaticTransactionGeneratorConfiguration():
    | AutomaticTransactionGeneratorConfiguration
    | undefined {
    let automaticTransactionGeneratorConfiguration:
      | AutomaticTransactionGeneratorConfiguration
      | undefined;
    const automaticTransactionGeneratorConfigurationFromFile =
      this.getConfigurationFromFile()?.automaticTransactionGenerator;
    if (
      this.getAutomaticTransactionGeneratorPersistentConfiguration() &&
      automaticTransactionGeneratorConfigurationFromFile
    ) {
      automaticTransactionGeneratorConfiguration =
        automaticTransactionGeneratorConfigurationFromFile;
    } else {
      automaticTransactionGeneratorConfiguration =
        this.getTemplateFromFile()?.AutomaticTransactionGenerator;
    }
    return {
      ...Constants.DEFAULT_ATG_CONFIGURATION,
      ...automaticTransactionGeneratorConfiguration,
    };
  }

  public getAutomaticTransactionGeneratorStatuses(): Status[] | undefined {
    return this.getConfigurationFromFile()?.automaticTransactionGeneratorStatuses;
  }

  public startAutomaticTransactionGenerator(connectorIds?: number[]): void {
    this.automaticTransactionGenerator = AutomaticTransactionGenerator.getInstance(this);
    if (Utils.isNotEmptyArray(connectorIds)) {
      for (const connectorId of connectorIds) {
        this.automaticTransactionGenerator?.startConnector(connectorId);
      }
    } else {
      this.automaticTransactionGenerator?.start();
    }
    this.saveAutomaticTransactionGeneratorConfiguration();
    parentPort?.postMessage(buildUpdatedMessage(this));
  }

  public stopAutomaticTransactionGenerator(connectorIds?: number[]): void {
    if (Utils.isNotEmptyArray(connectorIds)) {
      for (const connectorId of connectorIds) {
        this.automaticTransactionGenerator?.stopConnector(connectorId);
      }
    } else {
      this.automaticTransactionGenerator?.stop();
    }
    this.saveAutomaticTransactionGeneratorConfiguration();
    parentPort?.postMessage(buildUpdatedMessage(this));
  }

  public async stopTransactionOnConnector(
    connectorId: number,
    reason = StopTransactionReason.NONE
  ): Promise<StopTransactionResponse> {
    const transactionId = this.getConnectorStatus(connectorId)?.transactionId;
    if (
      this.getBeginEndMeterValues() === true &&
      this.getOcppStrictCompliance() === true &&
      this.getOutOfOrderEndMeterValues() === false
    ) {
      // FIXME: Implement OCPP version agnostic helpers
      const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
        this,
        connectorId,
        this.getEnergyActiveImportRegisterByTransactionId(transactionId)
      );
      await this.ocppRequestService.requestHandler<MeterValuesRequest, MeterValuesResponse>(
        this,
        RequestCommand.METER_VALUES,
        {
          connectorId,
          transactionId,
          meterValue: [transactionEndMeterValue],
        }
      );
    }
    return this.ocppRequestService.requestHandler<StopTransactionRequest, StopTransactionResponse>(
      this,
      RequestCommand.STOP_TRANSACTION,
      {
        transactionId,
        meterStop: this.getEnergyActiveImportRegisterByTransactionId(transactionId, true),
        reason,
      }
    );
  }

  public getReservationOnConnectorId0Enabled(): boolean {
    return Utils.convertToBoolean(
      ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.ReserveConnectorZeroSupported
      ).value
    );
  }

  public async addReservation(reservation: Reservation): Promise<void> {
    const [exists, reservationFound] = this.doesReservationExists(reservation);
    if (exists) {
      await this.removeReservation(reservationFound, ReservationTerminationReason.REPLACE_EXISTING);
    }
    this.getConnectorStatus(reservation.connectorId).reservation = reservation;
    await OCPPServiceUtils.sendAndSetConnectorStatus(
      this,
      reservation.connectorId,
      ConnectorStatusEnum.Reserved,
      null,
      { send: reservation.connectorId !== 0 }
    );
  }

  public async removeReservation(
    reservation: Reservation,
    reason?: ReservationTerminationReason
  ): Promise<void> {
    const connector = this.getConnectorStatus(reservation.connectorId);
    switch (reason) {
      case ReservationTerminationReason.CONNECTOR_STATE_CHANGED:
        delete connector.reservation;
        break;
      case ReservationTerminationReason.TRANSACTION_STARTED:
        delete connector.reservation;
        break;
      case ReservationTerminationReason.RESERVATION_CANCELED ||
        ReservationTerminationReason.REPLACE_EXISTING ||
        ReservationTerminationReason.EXPIRED:
        await OCPPServiceUtils.sendAndSetConnectorStatus(
          this,
          reservation.connectorId,
          ConnectorStatusEnum.Available,
          null,
          { send: reservation.connectorId !== 0 }
        );
        delete connector.reservation;
        break;
      default:
        break;
    }
  }

  public getReservationBy(
    filterKey: ReservationFilterKey,
    value: number | string
  ): Reservation | undefined {
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        for (const connectorStatus of evseStatus.connectors.values()) {
          if (connectorStatus?.reservation?.[filterKey] === value) {
            return connectorStatus.reservation;
          }
        }
      }
    } else {
      for (const connectorStatus of this.connectors.values()) {
        if (connectorStatus?.reservation?.[filterKey] === value) {
          return connectorStatus.reservation;
        }
      }
    }
  }

  public doesReservationExists(reservation: Partial<Reservation>): [boolean, Reservation] {
    const foundReservation = this.getReservationBy(
      ReservationFilterKey.RESERVATION_ID,
      reservation?.id
    );
    return Utils.isUndefined(foundReservation) ? [false, null] : [true, foundReservation];
  }

  public startReservationExpirationSetInterval(customInterval?: number): void {
    const interval =
      customInterval ?? Constants.DEFAULT_RESERVATION_EXPIRATION_OBSERVATION_INTERVAL;
    logger.info(
      `${this.logPrefix()} Reservation expiration date interval is set to ${interval}
        and starts on charging station now`
    );
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.reservationExpirationSetInterval = setInterval(async (): Promise<void> => {
      const now = new Date();
      if (this.hasEvses) {
        for (const evseStatus of this.evses.values()) {
          for (const connectorStatus of evseStatus.connectors.values()) {
            if (connectorStatus?.reservation?.expiryDate < now) {
              await this.removeReservation(
                connectorStatus.reservation,
                ReservationTerminationReason.EXPIRED
              );
            }
          }
        }
      } else {
        for (const connectorStatus of this.connectors.values()) {
          if (connectorStatus?.reservation?.expiryDate < now) {
            await this.removeReservation(
              connectorStatus.reservation,
              ReservationTerminationReason.EXPIRED
            );
          }
        }
      }
    }, interval);
  }

  public restartReservationExpiryDateSetInterval(): void {
    this.stopReservationExpirationSetInterval();
    this.startReservationExpirationSetInterval();
  }

  public validateIncomingRequestWithReservation(connectorId: number, idTag: string): boolean {
    return this.getReservationBy(ReservationFilterKey.CONNECTOR_ID, connectorId)?.idTag === idTag;
  }

  public isConnectorReservable(
    reservationId: number,
    idTag?: string,
    connectorId?: number
  ): boolean {
    const [alreadyExists] = this.doesReservationExists({ id: reservationId });
    if (alreadyExists) {
      return alreadyExists;
    }
    const userReservedAlready = Utils.isUndefined(
      this.getReservationBy(ReservationFilterKey.ID_TAG, idTag)
    )
      ? false
      : true;
    const notConnectorZero = Utils.isUndefined(connectorId) ? true : connectorId > 0;
    const freeConnectorsAvailable = this.getNumberOfReservableConnectors() > 0;
    return !alreadyExists && !userReservedAlready && notConnectorZero && freeConnectorsAvailable;
  }

  private getNumberOfReservableConnectors(): number {
    let reservableConnectors = 0;
    if (this.hasEvses) {
      for (const evseStatus of this.evses.values()) {
        reservableConnectors += ChargingStationUtils.countReservableConnectors(
          evseStatus.connectors
        );
      }
    } else {
      reservableConnectors = ChargingStationUtils.countReservableConnectors(this.connectors);
    }
    return reservableConnectors - this.getNumberOfReservationsOnConnectorZero();
  }

  private getNumberOfReservationsOnConnectorZero(): number {
    let numberOfReservations = 0;
    if (this.hasEvses && this.evses.get(0)?.connectors.get(0)?.reservation) {
      ++numberOfReservations;
    } else if (this.connectors.get(0)?.reservation) {
      ++numberOfReservations;
    }
    return numberOfReservations;
  }

  private flushMessageBuffer(): void {
    if (this.messageBuffer.size > 0) {
      for (const message of this.messageBuffer.values()) {
        let beginId: string;
        let commandName: RequestCommand;
        const [messageType] = JSON.parse(message) as OutgoingRequest | Response | ErrorResponse;
        const isRequest = messageType === MessageType.CALL_MESSAGE;
        if (isRequest) {
          [, , commandName] = JSON.parse(message) as OutgoingRequest;
          beginId = PerformanceStatistics.beginMeasure(commandName);
        }
        this.wsConnection?.send(message);
        isRequest && PerformanceStatistics.endMeasure(commandName, beginId);
        logger.debug(
          `${this.logPrefix()} >> Buffered ${OCPPServiceUtils.getMessageTypeString(
            messageType
          )} payload sent: ${message}`
        );
        this.messageBuffer.delete(message);
      }
    }
  }

  private getSupervisionUrlOcppConfiguration(): boolean {
    return this.stationInfo.supervisionUrlOcppConfiguration ?? false;
  }

  private stopReservationExpirationSetInterval(): void {
    if (this.reservationExpirationSetInterval) {
      clearInterval(this.reservationExpirationSetInterval);
    }
  }

  private getSupervisionUrlOcppKey(): string {
    return this.stationInfo.supervisionUrlOcppKey ?? VendorParametersKey.ConnectionUrl;
  }

  private getTemplateFromFile(): ChargingStationTemplate | undefined {
    let template: ChargingStationTemplate;
    try {
      if (this.sharedLRUCache.hasChargingStationTemplate(this.templateFileHash)) {
        template = this.sharedLRUCache.getChargingStationTemplate(this.templateFileHash);
      } else {
        const measureId = `${FileType.ChargingStationTemplate} read`;
        const beginId = PerformanceStatistics.beginMeasure(measureId);
        template = JSON.parse(
          fs.readFileSync(this.templateFile, 'utf8')
        ) as ChargingStationTemplate;
        PerformanceStatistics.endMeasure(measureId, beginId);
        template.templateHash = crypto
          .createHash(Constants.DEFAULT_HASH_ALGORITHM)
          .update(JSON.stringify(template))
          .digest('hex');
        this.sharedLRUCache.setChargingStationTemplate(template);
        this.templateFileHash = template.templateHash;
      }
    } catch (error) {
      handleFileException(
        this.templateFile,
        FileType.ChargingStationTemplate,
        error as NodeJS.ErrnoException,
        this.logPrefix()
      );
    }
    return template;
  }

  private getStationInfoFromTemplate(): ChargingStationInfo {
    const stationTemplate: ChargingStationTemplate | undefined = this.getTemplateFromFile();
    ChargingStationUtils.checkTemplate(stationTemplate, this.logPrefix(), this.templateFile);
    ChargingStationUtils.warnTemplateKeysDeprecation(
      stationTemplate,
      this.logPrefix(),
      this.templateFile
    );
    if (stationTemplate?.Connectors) {
      ChargingStationUtils.checkConnectorsConfiguration(
        stationTemplate,
        this.logPrefix(),
        this.templateFile
      );
    }
    const stationInfo: ChargingStationInfo =
      ChargingStationUtils.stationTemplateToStationInfo(stationTemplate);
    stationInfo.hashId = ChargingStationUtils.getHashId(this.index, stationTemplate);
    stationInfo.chargingStationId = ChargingStationUtils.getChargingStationId(
      this.index,
      stationTemplate
    );
    stationInfo.ocppVersion = stationTemplate?.ocppVersion ?? OCPPVersion.VERSION_16;
    ChargingStationUtils.createSerialNumber(stationTemplate, stationInfo);
    if (Utils.isNotEmptyArray(stationTemplate?.power)) {
      stationTemplate.power = stationTemplate.power as number[];
      const powerArrayRandomIndex = Math.floor(Utils.secureRandom() * stationTemplate.power.length);
      stationInfo.maximumPower =
        stationTemplate?.powerUnit === PowerUnits.KILO_WATT
          ? stationTemplate.power[powerArrayRandomIndex] * 1000
          : stationTemplate.power[powerArrayRandomIndex];
    } else {
      stationTemplate.power = stationTemplate?.power as number;
      stationInfo.maximumPower =
        stationTemplate?.powerUnit === PowerUnits.KILO_WATT
          ? stationTemplate.power * 1000
          : stationTemplate.power;
    }
    stationInfo.firmwareVersionPattern =
      stationTemplate?.firmwareVersionPattern ?? Constants.SEMVER_PATTERN;
    if (
      Utils.isNotEmptyString(stationInfo.firmwareVersion) &&
      new RegExp(stationInfo.firmwareVersionPattern).test(stationInfo.firmwareVersion) === false
    ) {
      logger.warn(
        `${this.logPrefix()} Firmware version '${stationInfo.firmwareVersion}' in template file ${this.templateFile
        } does not match firmware version pattern '${stationInfo.firmwareVersionPattern}'`
      );
    }
    stationInfo.firmwareUpgrade = merge<FirmwareUpgrade>(
      {
        versionUpgrade: {
          step: 1,
        },
        reset: true,
      },
      stationTemplate?.firmwareUpgrade ?? {}
    );
    stationInfo.resetTime = !Utils.isNullOrUndefined(stationTemplate?.resetTime)
      ? stationTemplate.resetTime * 1000
      : Constants.CHARGING_STATION_DEFAULT_RESET_TIME;
    stationInfo.maximumAmperage = this.getMaximumAmperage(stationInfo);
    return stationInfo;
  }

  private getStationInfoFromFile(): ChargingStationInfo | undefined {
    let stationInfo: ChargingStationInfo | undefined;
    if (this.getStationInfoPersistentConfiguration()) {
      stationInfo = this.getConfigurationFromFile()?.stationInfo;
      if (stationInfo) {
        delete stationInfo?.infoHash;
      }
    }
    return stationInfo;
  }

  private getStationInfo(): ChargingStationInfo {
    const stationInfoFromTemplate: ChargingStationInfo = this.getStationInfoFromTemplate();
    const stationInfoFromFile: ChargingStationInfo | undefined = this.getStationInfoFromFile();
    // Priority:
    // 1. charging station info from template
    // 2. charging station info from configuration file
    if (stationInfoFromFile?.templateHash === stationInfoFromTemplate.templateHash) {
      return stationInfoFromFile;
    }
    stationInfoFromFile &&
      ChargingStationUtils.propagateSerialNumber(
        this.getTemplateFromFile(),
        stationInfoFromFile,
        stationInfoFromTemplate
      );
    return stationInfoFromTemplate;
  }

  private saveStationInfo(): void {
    if (this.getStationInfoPersistentConfiguration()) {
      this.saveConfiguration();
    }
  }

  private getOcppPersistentConfiguration(): boolean {
    return this.stationInfo?.ocppPersistentConfiguration ?? true;
  }

  private getStationInfoPersistentConfiguration(): boolean {
    return this.stationInfo?.stationInfoPersistentConfiguration ?? true;
  }

  private getAutomaticTransactionGeneratorPersistentConfiguration(): boolean {
    return this.stationInfo?.automaticTransactionGeneratorPersistentConfiguration ?? true;
  }

  private handleUnsupportedVersion(version: OCPPVersion) {
    const errorMsg = `Unsupported protocol version '${version}' configured
      in template file ${this.templateFile}`;
    logger.error(`${this.logPrefix()} ${errorMsg}`);
    throw new BaseError(errorMsg);
  }

  private initialize(): void {
    const stationTemplate = this.getTemplateFromFile();
    ChargingStationUtils.checkTemplate(stationTemplate, this.logPrefix(), this.templateFile);
    this.configurationFile = path.join(
      path.dirname(this.templateFile.replace('station-templates', 'configurations')),
      `${ChargingStationUtils.getHashId(this.index, stationTemplate)}.json`
    );
    const chargingStationConfiguration = this.getConfigurationFromFile();
    if (
      chargingStationConfiguration?.stationInfo?.templateHash === stationTemplate?.templateHash &&
      (chargingStationConfiguration?.connectorsStatus || chargingStationConfiguration?.evsesStatus)
    ) {
      this.initializeConnectorsOrEvsesFromFile(chargingStationConfiguration);
    } else {
      this.initializeConnectorsOrEvsesFromTemplate(stationTemplate);
    }
    this.stationInfo = this.getStationInfo();
    if (
      this.stationInfo.firmwareStatus === FirmwareStatus.Installing &&
      Utils.isNotEmptyString(this.stationInfo.firmwareVersion) &&
      Utils.isNotEmptyString(this.stationInfo.firmwareVersionPattern)
    ) {
      const patternGroup: number | undefined =
        this.stationInfo.firmwareUpgrade?.versionUpgrade?.patternGroup ??
        this.stationInfo.firmwareVersion?.split('.').length;
      const match = this.stationInfo?.firmwareVersion
        ?.match(new RegExp(this.stationInfo.firmwareVersionPattern))
        ?.slice(1, patternGroup + 1);
      const patchLevelIndex = match.length - 1;
      match[patchLevelIndex] = (
        Utils.convertToInt(match[patchLevelIndex]) +
        this.stationInfo.firmwareUpgrade?.versionUpgrade?.step
      ).toString();
      this.stationInfo.firmwareVersion = match?.join('.');
    }
    this.saveStationInfo();
    this.configuredSupervisionUrl = this.getConfiguredSupervisionUrl();
    if (this.getEnableStatistics() === true) {
      this.performanceStatistics = PerformanceStatistics.getInstance(
        this.stationInfo.hashId,
        this.stationInfo.chargingStationId,
        this.configuredSupervisionUrl
      );
    }
    this.bootNotificationRequest = ChargingStationUtils.createBootNotificationRequest(
      this.stationInfo
    );
    this.powerDivider = this.getPowerDivider();
    // OCPP configuration
    this.ocppConfiguration = this.getOcppConfiguration();
    this.initializeOcppConfiguration();
    this.initializeOcppServices();
    if (this.stationInfo?.autoRegister === true) {
      this.bootNotificationResponse = {
        currentTime: new Date(),
        interval: this.getHeartbeatInterval() / 1000,
        status: RegistrationStatusEnumType.ACCEPTED,
      };
    }
  }

  private initializeOcppServices(): void {
    const ocppVersion = this.stationInfo.ocppVersion ?? OCPPVersion.VERSION_16;
    switch (ocppVersion) {
      case OCPPVersion.VERSION_16:
        this.ocppIncomingRequestService =
          OCPP16IncomingRequestService.getInstance<OCPP16IncomingRequestService>();
        this.ocppRequestService = OCPP16RequestService.getInstance<OCPP16RequestService>(
          OCPP16ResponseService.getInstance<OCPP16ResponseService>()
        );
        break;
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        this.ocppIncomingRequestService =
          OCPP20IncomingRequestService.getInstance<OCPP20IncomingRequestService>();
        this.ocppRequestService = OCPP20RequestService.getInstance<OCPP20RequestService>(
          OCPP20ResponseService.getInstance<OCPP20ResponseService>()
        );
        break;
      default:
        this.handleUnsupportedVersion(ocppVersion);
        break;
    }
  }

  private initializeOcppConfiguration(): void {
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.HeartbeatInterval
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.HeartbeatInterval,
        '0'
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.HeartBeatInterval
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.HeartBeatInterval,
        '0',
        { visible: false }
      );
    }
    if (
      this.getSupervisionUrlOcppConfiguration() &&
      Utils.isNotEmptyString(this.getSupervisionUrlOcppKey()) &&
      !ChargingStationConfigurationUtils.getConfigurationKey(this, this.getSupervisionUrlOcppKey())
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        this.getSupervisionUrlOcppKey(),
        this.configuredSupervisionUrl.href,
        { reboot: true }
      );
    } else if (
      !this.getSupervisionUrlOcppConfiguration() &&
      Utils.isNotEmptyString(this.getSupervisionUrlOcppKey()) &&
      ChargingStationConfigurationUtils.getConfigurationKey(this, this.getSupervisionUrlOcppKey())
    ) {
      ChargingStationConfigurationUtils.deleteConfigurationKey(
        this,
        this.getSupervisionUrlOcppKey(),
        { save: false }
      );
    }
    if (
      Utils.isNotEmptyString(this.stationInfo?.amperageLimitationOcppKey) &&
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        this.stationInfo.amperageLimitationOcppKey
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        this.stationInfo.amperageLimitationOcppKey,
        (
          this.stationInfo.maximumAmperage *
          ChargingStationUtils.getAmperageLimitationUnitDivider(this.stationInfo)
        ).toString()
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.SupportedFeatureProfiles
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.SupportedFeatureProfiles,
        `${SupportedFeatureProfiles.Core},${SupportedFeatureProfiles.FirmwareManagement},${SupportedFeatureProfiles.LocalAuthListManagement},${SupportedFeatureProfiles.SmartCharging},${SupportedFeatureProfiles.RemoteTrigger}`
      );
    }
    ChargingStationConfigurationUtils.addConfigurationKey(
      this,
      StandardParametersKey.NumberOfConnectors,
      this.getNumberOfConnectors().toString(),
      { readonly: true },
      { overwrite: true }
    );
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.MeterValuesSampledData
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.MeterValuesSampledData,
        MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.ConnectorPhaseRotation
      )
    ) {
      const connectorsPhaseRotation: string[] = [];
      if (this.hasEvses) {
        for (const evseStatus of this.evses.values()) {
          for (const connectorId of evseStatus.connectors.keys()) {
            connectorsPhaseRotation.push(
              ChargingStationUtils.getPhaseRotationValue(connectorId, this.getNumberOfPhases())
            );
          }
        }
      } else {
        for (const connectorId of this.connectors.keys()) {
          connectorsPhaseRotation.push(
            ChargingStationUtils.getPhaseRotationValue(connectorId, this.getNumberOfPhases())
          );
        }
      }
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.ConnectorPhaseRotation,
        connectorsPhaseRotation.toString()
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.AuthorizeRemoteTxRequests
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.AuthorizeRemoteTxRequests,
        'true'
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.LocalAuthListEnabled
      ) &&
      ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.SupportedFeatureProfiles
      )?.value?.includes(SupportedFeatureProfiles.LocalAuthListManagement)
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.LocalAuthListEnabled,
        'false'
      );
    }
    if (
      !ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.ConnectionTimeOut
      )
    ) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        this,
        StandardParametersKey.ConnectionTimeOut,
        Constants.DEFAULT_CONNECTION_TIMEOUT.toString()
      );
    }
    this.saveOcppConfiguration();
  }

  private initializeConnectorsOrEvsesFromFile(configuration: ChargingStationConfiguration): void {
    if (configuration?.connectorsStatus && !configuration?.evsesStatus) {
      for (const [connectorId, connectorStatus] of configuration.connectorsStatus.entries()) {
        this.connectors.set(connectorId, Utils.cloneObject<ConnectorStatus>(connectorStatus));
      }
    } else if (configuration?.evsesStatus && !configuration?.connectorsStatus) {
      for (const [evseId, evseStatusConfiguration] of configuration.evsesStatus.entries()) {
        const evseStatus = Utils.cloneObject<EvseStatusConfiguration>(evseStatusConfiguration);
        delete evseStatus.connectorsStatus;
        this.evses.set(evseId, {
          ...(evseStatus as EvseStatus),
          connectors: new Map<number, ConnectorStatus>(
            evseStatusConfiguration.connectorsStatus.map((connectorStatus, connectorId) => [
              connectorId,
              connectorStatus,
            ])
          ),
        });
      }
    } else if (configuration?.evsesStatus && configuration?.connectorsStatus) {
      const errorMsg = `Connectors and evses defined at the same time in configuration file ${this.configurationFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    } else {
      const errorMsg = `No connectors or evses defined in configuration file ${this.configurationFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
  }

  private initializeConnectorsOrEvsesFromTemplate(stationTemplate: ChargingStationTemplate) {
    if (stationTemplate?.Connectors && !stationTemplate?.Evses) {
      this.initializeConnectorsFromTemplate(stationTemplate);
    } else if (stationTemplate?.Evses && !stationTemplate?.Connectors) {
      this.initializeEvsesFromTemplate(stationTemplate);
    } else if (stationTemplate?.Evses && stationTemplate?.Connectors) {
      const errorMsg = `Connectors and evses defined at the same time in template file ${this.templateFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    } else {
      const errorMsg = `No connectors or evses defined in template file ${this.templateFile}`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
  }

  private initializeConnectorsFromTemplate(stationTemplate: ChargingStationTemplate): void {
    if (!stationTemplate?.Connectors && this.connectors.size === 0) {
      const errorMsg = `No already defined connectors and charging station information from template ${this.templateFile} with no connectors configuration defined`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
    if (!stationTemplate?.Connectors[0]) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${this.templateFile
        } with no connector id 0 configuration`
      );
    }
    if (stationTemplate?.Connectors) {
      const { configuredMaxConnectors, templateMaxConnectors, templateMaxAvailableConnectors } =
        ChargingStationUtils.checkConnectorsConfiguration(
          stationTemplate,
          this.logPrefix(),
          this.templateFile
        );
      const connectorsConfigHash = crypto
        .createHash(Constants.DEFAULT_HASH_ALGORITHM)
        .update(
          `${JSON.stringify(stationTemplate?.Connectors)}${configuredMaxConnectors.toString()}`
        )
        .digest('hex');
      const connectorsConfigChanged =
        this.connectors?.size !== 0 && this.connectorsConfigurationHash !== connectorsConfigHash;
      if (this.connectors?.size === 0 || connectorsConfigChanged) {
        connectorsConfigChanged && this.connectors.clear();
        this.connectorsConfigurationHash = connectorsConfigHash;
        if (templateMaxConnectors > 0) {
          for (let connectorId = 0; connectorId <= configuredMaxConnectors; connectorId++) {
            if (
              connectorId === 0 &&
              (!stationTemplate?.Connectors[connectorId] ||
                this.getUseConnectorId0(stationTemplate) === false)
            ) {
              continue;
            }
            const templateConnectorId =
              connectorId > 0 && stationTemplate?.randomConnectors
                ? Utils.getRandomInteger(templateMaxAvailableConnectors, 1)
                : connectorId;
            const connectorStatus = stationTemplate?.Connectors[templateConnectorId];
            ChargingStationUtils.checkStationInfoConnectorStatus(
              templateConnectorId,
              connectorStatus,
              this.logPrefix(),
              this.templateFile
            );
            this.connectors.set(connectorId, Utils.cloneObject<ConnectorStatus>(connectorStatus));
          }
          ChargingStationUtils.initializeConnectorsMapStatus(this.connectors, this.logPrefix());
          this.saveConnectorsStatus();
        } else {
          logger.warn(
            `${this.logPrefix()} Charging station information from template ${this.templateFile
            } with no connectors configuration defined, cannot create connectors`
          );
        }
      }
    } else {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${this.templateFile
        } with no connectors configuration defined, using already defined connectors`
      );
    }
  }

  private initializeEvsesFromTemplate(stationTemplate: ChargingStationTemplate): void {
    if (!stationTemplate?.Evses && this.evses.size === 0) {
      const errorMsg = `No already defined evses and charging station information from template ${this.templateFile} with no evses configuration defined`;
      logger.error(`${this.logPrefix()} ${errorMsg}`);
      throw new BaseError(errorMsg);
    }
    if (!stationTemplate?.Evses[0]) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${this.templateFile
        } with no evse id 0 configuration`
      );
    }
    if (!stationTemplate?.Evses[0]?.Connectors[0]) {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${this.templateFile
        } with evse id 0 with no connector id 0 configuration`
      );
    }
    if (stationTemplate?.Evses) {
      const evsesConfigHash = crypto
        .createHash(Constants.DEFAULT_HASH_ALGORITHM)
        .update(JSON.stringify(stationTemplate?.Evses))
        .digest('hex');
      const evsesConfigChanged =
        this.evses?.size !== 0 && this.evsesConfigurationHash !== evsesConfigHash;
      if (this.evses?.size === 0 || evsesConfigChanged) {
        evsesConfigChanged && this.evses.clear();
        this.evsesConfigurationHash = evsesConfigHash;
        const templateMaxEvses = ChargingStationUtils.getMaxNumberOfEvses(stationTemplate?.Evses);
        if (templateMaxEvses > 0) {
          for (const evse in stationTemplate.Evses) {
            const evseId = Utils.convertToInt(evse);
            this.evses.set(evseId, {
              connectors: ChargingStationUtils.buildConnectorsMap(
                stationTemplate?.Evses[evse]?.Connectors,
                this.logPrefix(),
                this.templateFile
              ),
              availability: AvailabilityType.Operative,
            });
            ChargingStationUtils.initializeConnectorsMapStatus(
              this.evses.get(evseId)?.connectors,
              this.logPrefix()
            );
          }
          this.saveEvsesStatus();
        } else {
          logger.warn(
            `${this.logPrefix()} Charging station information from template ${this.templateFile
            } with no evses configuration defined, cannot create evses`
          );
        }
      }
    } else {
      logger.warn(
        `${this.logPrefix()} Charging station information from template ${this.templateFile
        } with no evses configuration defined, using already defined evses`
      );
    }
  }

  private getConfigurationFromFile(): ChargingStationConfiguration | undefined {
    let configuration: ChargingStationConfiguration | undefined;
    if (Utils.isNotEmptyString(this.configurationFile) && fs.existsSync(this.configurationFile)) {
      try {
        if (this.sharedLRUCache.hasChargingStationConfiguration(this.configurationFileHash)) {
          configuration = this.sharedLRUCache.getChargingStationConfiguration(
            this.configurationFileHash
          );
        } else {
          const measureId = `${FileType.ChargingStationConfiguration} read`;
          const beginId = PerformanceStatistics.beginMeasure(measureId);
          configuration = JSON.parse(
            fs.readFileSync(this.configurationFile, 'utf8')
          ) as ChargingStationConfiguration;
          PerformanceStatistics.endMeasure(measureId, beginId);
          this.sharedLRUCache.setChargingStationConfiguration(configuration);
          this.configurationFileHash = configuration.configurationHash;
        }
      } catch (error) {
        handleFileException(
          this.configurationFile,
          FileType.ChargingStationConfiguration,
          error as NodeJS.ErrnoException,
          this.logPrefix()
        );
      }
    }
    return configuration;
  }

  private saveAutomaticTransactionGeneratorConfiguration(): void {
    if (this.getAutomaticTransactionGeneratorPersistentConfiguration()) {
      this.saveConfiguration();
    }
  }

  private saveConnectorsStatus() {
    this.saveConfiguration();
  }

  private saveEvsesStatus() {
    this.saveConfiguration();
  }

  private saveConfiguration(): void {
    if (Utils.isNotEmptyString(this.configurationFile)) {
      try {
        if (!fs.existsSync(path.dirname(this.configurationFile))) {
          fs.mkdirSync(path.dirname(this.configurationFile), { recursive: true });
        }
        let configurationData: ChargingStationConfiguration =
          Utils.cloneObject<ChargingStationConfiguration>(this.getConfigurationFromFile()) ?? {};
        if (this.getStationInfoPersistentConfiguration() && this.stationInfo) {
          configurationData.stationInfo = this.stationInfo;
        } else {
          delete configurationData.stationInfo;
        }
        if (this.getOcppPersistentConfiguration() && this.ocppConfiguration?.configurationKey) {
          configurationData.configurationKey = this.ocppConfiguration.configurationKey;
        } else {
          delete configurationData.configurationKey;
        }
        configurationData = merge<ChargingStationConfiguration>(
          configurationData,
          buildChargingStationAutomaticTransactionGeneratorConfiguration(this)
        );
        if (
          !this.getAutomaticTransactionGeneratorPersistentConfiguration() ||
          !this.getAutomaticTransactionGeneratorConfiguration()
        ) {
          delete configurationData.automaticTransactionGenerator;
        }
        if (this.connectors.size > 0) {
          configurationData.connectorsStatus = buildConnectorsStatus(this);
        } else {
          delete configurationData.connectorsStatus;
        }
        if (this.evses.size > 0) {
          configurationData.evsesStatus = buildEvsesStatus(this);
        } else {
          delete configurationData.evsesStatus;
        }
        delete configurationData.configurationHash;
        const configurationHash = crypto
          .createHash(Constants.DEFAULT_HASH_ALGORITHM)
          .update(
            JSON.stringify({
              stationInfo: configurationData.stationInfo,
              configurationKey: configurationData.configurationKey,
              automaticTransactionGenerator: configurationData.automaticTransactionGenerator,
            } as ChargingStationConfiguration)
          )
          .digest('hex');
        if (this.configurationFileHash !== configurationHash) {
          AsyncLock.acquire(AsyncLockType.configuration)
            .then(() => {
              configurationData.configurationHash = configurationHash;
              const measureId = `${FileType.ChargingStationConfiguration} write`;
              const beginId = PerformanceStatistics.beginMeasure(measureId);
              const fileDescriptor = fs.openSync(this.configurationFile, 'w');
              fs.writeFileSync(fileDescriptor, JSON.stringify(configurationData, null, 2), 'utf8');
              fs.closeSync(fileDescriptor);
              PerformanceStatistics.endMeasure(measureId, beginId);
              this.sharedLRUCache.deleteChargingStationConfiguration(this.configurationFileHash);
              this.sharedLRUCache.setChargingStationConfiguration(configurationData);
              this.configurationFileHash = configurationHash;
            })
            .catch((error) => {
              handleFileException(
                this.configurationFile,
                FileType.ChargingStationConfiguration,
                error as NodeJS.ErrnoException,
                this.logPrefix()
              );
            })
            .finally(() => {
              AsyncLock.release(AsyncLockType.configuration).catch(Constants.EMPTY_FUNCTION);
            });
        } else {
          logger.debug(
            `${this.logPrefix()} Not saving unchanged charging station configuration file ${this.configurationFile
            }`
          );
        }
      } catch (error) {
        handleFileException(
          this.configurationFile,
          FileType.ChargingStationConfiguration,
          error as NodeJS.ErrnoException,
          this.logPrefix()
        );
      }
    } else {
      logger.error(
        `${this.logPrefix()} Trying to save charging station configuration to undefined configuration file`
      );
    }
  }

  private getOcppConfigurationFromTemplate(): ChargingStationOcppConfiguration | undefined {
    return this.getTemplateFromFile()?.Configuration;
  }

  private getOcppConfigurationFromFile(): ChargingStationOcppConfiguration | undefined {
    var config = this.getConfigurationFromFile();
    if (config?.stationInfo?.messages) {
      config.stationInfo.messages = [];
    }
    const configurationKey = config?.configurationKey;
    if (this.getOcppPersistentConfiguration() === true && configurationKey) {
      return { configurationKey };
    }
    return undefined;
  }

  private getOcppConfiguration(): ChargingStationOcppConfiguration | undefined {
    let ocppConfiguration: ChargingStationOcppConfiguration | undefined =
      this.getOcppConfigurationFromFile();
    if (!ocppConfiguration) {
      ocppConfiguration = this.getOcppConfigurationFromTemplate();
    }
    return ocppConfiguration;
  }

  private async onOpen(): Promise<void> {
    if (this.isWebSocketConnectionOpened() === true) {
      logger.info(
        `${this.logPrefix()} Connection to OCPP server through ${this.wsConnectionUrl.toString()} succeeded`
      );
      if (this.isRegistered() === false) {
        // Send BootNotification
        let registrationRetryCount = 0;
        do {
          this.bootNotificationResponse = await this.ocppRequestService.requestHandler<
            BootNotificationRequest,
            BootNotificationResponse
          >(this, RequestCommand.BOOT_NOTIFICATION, this.bootNotificationRequest, {
            skipBufferingOnError: true,
          });
          if (this.isRegistered() === false) {
            this.getRegistrationMaxRetries() !== -1 && ++registrationRetryCount;
            await Utils.sleep(
              this?.bootNotificationResponse?.interval
                ? this.bootNotificationResponse.interval * 1000
                : Constants.DEFAULT_BOOT_NOTIFICATION_INTERVAL
            );
          }
        } while (
          this.isRegistered() === false &&
          (registrationRetryCount <= this.getRegistrationMaxRetries() ||
            this.getRegistrationMaxRetries() === -1)
        );
      }
      if (this.isRegistered() === true) {
        if (this.inAcceptedState() === true) {
          await this.startMessageSequence();
        }
      } else {
        logger.error(
          `${this.logPrefix()} Registration failure: max retries reached (${this.getRegistrationMaxRetries()}) or retry disabled (${this.getRegistrationMaxRetries()})`
        );
      }
      this.wsConnectionRestarted = false;
      this.autoReconnectRetryCount = 0;
      parentPort?.postMessage(buildUpdatedMessage(this));
    } else {
      logger.warn(
        `${this.logPrefix()} Connection to OCPP server through ${this.wsConnectionUrl.toString()} failed`
      );
    }
  }

  private async onClose(code: number, reason: Buffer): Promise<void> {
    switch (code) {
      // Normal close
      case WebSocketCloseEventStatusCode.CLOSE_NORMAL:
      case WebSocketCloseEventStatusCode.CLOSE_NO_STATUS:
        logger.info(
          `${this.logPrefix()} WebSocket normally closed with status '${Utils.getWebSocketCloseEventStatusString(
            code
          )}' and reason '${reason.toString()}'`
        );
        this.autoReconnectRetryCount = 0;
        break;
      // Abnormal close
      default:
        logger.error(
          `${this.logPrefix()} WebSocket abnormally closed with status '${Utils.getWebSocketCloseEventStatusString(
            code
          )}' and reason '${reason.toString()}'`
        );
        this.started === true && (await this.reconnect());
        break;
    }
    parentPort?.postMessage(buildUpdatedMessage(this));
  }

  private getCachedRequest(messageType: MessageType, messageId: string): CachedRequest | undefined {
    const cachedRequest = this.requests.get(messageId);
    if (Array.isArray(cachedRequest) === true) {
      return cachedRequest;
    }
    throw new OCPPError(
      ErrorType.PROTOCOL_ERROR,
      `Cached request for message id ${messageId} ${OCPPServiceUtils.getMessageTypeString(
        messageType
      )} is not an array`,
      undefined,
      cachedRequest as JsonType
    );
  }

  public addMessage(msg: MessageLog) {
    if (this.stationInfo != null) {
      if (!this.stationInfo.messages) {
        this.stationInfo.messages = [];
      }
      this.stationInfo.messages.push(msg);
    }
  }

  private async handleIncomingMessage(request: IncomingRequest): Promise<void> {
    const [messageType, messageId, commandName, commandPayload] = request;
    if (this.getEnableStatistics() === true) {
      this.performanceStatistics?.addRequestStatistic(commandName, messageType);
    }
    this.addMessage({
      type: 'receive',
      time: new Date(),
      payload: JSON.stringify(commandPayload),
      name: commandName,
      success: true,
    });
    logger.debug(
      `${this.logPrefix()} << Command '${commandName}' received request payload: ${JSON.stringify(
        request
      )}`
    );
    // Process the message
    await this.ocppIncomingRequestService.incomingRequestHandler(
      this,
      messageId,
      commandName,
      commandPayload
    );
  }

  private handleResponseMessage(response: Response): void {
    const [messageType, messageId, commandPayload] = response;
    if (this.requests.has(messageId) === false) {
      // Error
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Response for unknown message id ${messageId}`,
        undefined,
        commandPayload
      );
    }
    // Respond
    const [responseCallback, , requestCommandName, requestPayload] = this.getCachedRequest(
      messageType,
      messageId
    );
    this.addMessage({
      type: 'receive',
      time: new Date(),
      payload: JSON.stringify(commandPayload),
      name: requestCommandName,
      success: true,
    });
    logger.debug(
      `${this.logPrefix()} << Command '${requestCommandName ?? Constants.UNKNOWN_COMMAND
      }' received response payload: ${JSON.stringify(response)}`
    );
    responseCallback(commandPayload, requestPayload);
  }

  private handleErrorMessage(errorResponse: ErrorResponse): void {
    const [messageType, messageId, errorType, errorMessage, errorDetails] = errorResponse;
    if (this.requests.has(messageId) === false) {
      // Error
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Error response for unknown message id ${messageId}`,
        undefined,
        { errorType, errorMessage, errorDetails }
      );
    }
    const [, errorCallback, requestCommandName] = this.getCachedRequest(messageType, messageId);
    this.addMessage({
      type: 'receive',
      time: new Date(),
      payload: JSON.stringify(JSON.stringify(errorResponse)),
      name: requestCommandName,
      success: true,
    });
    logger.debug(
      `${this.logPrefix()} << Command '${requestCommandName ?? Constants.UNKNOWN_COMMAND
      }' received error response payload: ${JSON.stringify(errorResponse)}`
    );
    errorCallback(new OCPPError(errorType, errorMessage, requestCommandName, errorDetails));
  }

  private async onMessage(data: RawData): Promise<void> {
    let request: IncomingRequest | Response | ErrorResponse;
    let messageType: number;
    let errorMsg: string;
    try {
      request = JSON.parse(data.toString()) as IncomingRequest | Response | ErrorResponse;
      if (Array.isArray(request) === true) {
        [messageType] = request;
        // Check the type of message
        switch (messageType) {
          // Incoming Message
          case MessageType.CALL_MESSAGE:
            await this.handleIncomingMessage(request as IncomingRequest);
            break;
          // Response Message
          case MessageType.CALL_RESULT_MESSAGE:
            this.handleResponseMessage(request as Response);
            break;
          // Error Message
          case MessageType.CALL_ERROR_MESSAGE:
            this.handleErrorMessage(request as ErrorResponse);
            break;
          // Unknown Message
          default:
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            errorMsg = `Wrong message type ${messageType}`;
            logger.error(`${this.logPrefix()} ${errorMsg}`);
            throw new OCPPError(ErrorType.PROTOCOL_ERROR, errorMsg);
        }
        parentPort?.postMessage(buildUpdatedMessage(this));
      } else {
        throw new OCPPError(ErrorType.PROTOCOL_ERROR, 'Incoming message is not an array', null, {
          request,
        });
      }
    } catch (error) {
      let commandName: IncomingRequestCommand;
      let requestCommandName: RequestCommand | IncomingRequestCommand;
      let errorCallback: ErrorCallback;
      const [, messageId] = request;
      switch (messageType) {
        case MessageType.CALL_MESSAGE:
          [, , commandName] = request as IncomingRequest;
          // Send error
          await this.ocppRequestService.sendError(this, messageId, error as OCPPError, commandName);
          break;
        case MessageType.CALL_RESULT_MESSAGE:
        case MessageType.CALL_ERROR_MESSAGE:
          if (this.requests.has(messageId) === true) {
            [, errorCallback, requestCommandName] = this.getCachedRequest(messageType, messageId);
            // Reject the deferred promise in case of error at response handling (rejecting an already fulfilled promise is a no-op)
            errorCallback(error as OCPPError, false);
          } else {
            // Remove the request from the cache in case of error at response handling
            this.requests.delete(messageId);
          }
          break;
      }
      if (error instanceof OCPPError === false) {
        logger.warn(
          `${this.logPrefix()} Error thrown at incoming OCPP command '${commandName ?? requestCommandName ?? Constants.UNKNOWN_COMMAND
          }' message '${data.toString()}' handling is not an OCPPError:`,
          error
        );
      }
      logger.error(
        `${this.logPrefix()} Incoming OCPP command '${commandName ?? requestCommandName ?? Constants.UNKNOWN_COMMAND
        }' message '${data.toString()}'${messageType !== MessageType.CALL_MESSAGE
          ? ` matching cached request '${JSON.stringify(this.requests.get(messageId))}'`
          : ''
        } processing error:`,
        error
      );
    }
  }

  private onPing(): void {
    logger.debug(`${this.logPrefix()} Received a WS ping (rfc6455) from the server`);
  }

  private onPong(): void {
    logger.debug(`${this.logPrefix()} Received a WS pong (rfc6455) from the server`);
  }

  private onError(error: WSError): void {
    this.closeWSConnection();
    logger.error(`${this.logPrefix()} WebSocket error:`, error);
  }

  private getEnergyActiveImportRegister(connectorStatus: ConnectorStatus, rounded = false): number {
    if (this.getMeteringPerTransaction() === true) {
      return (
        (rounded === true
          ? Math.round(connectorStatus?.transactionEnergyActiveImportRegisterValue)
          : connectorStatus?.transactionEnergyActiveImportRegisterValue) ?? 0
      );
    }
    return (
      (rounded === true
        ? Math.round(connectorStatus?.energyActiveImportRegisterValue)
        : connectorStatus?.energyActiveImportRegisterValue) ?? 0
    );
  }

  private getUseConnectorId0(stationTemplate?: ChargingStationTemplate): boolean {
    return stationTemplate?.useConnectorId0 ?? true;
  }

  private async stopRunningTransactions(reason = StopTransactionReason.NONE): Promise<void> {
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId === 0) {
          continue;
        }
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          if (connectorStatus.transactionStarted === true) {
            await this.stopTransactionOnConnector(connectorId, reason);
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0 && this.getConnectorStatus(connectorId)?.transactionStarted === true) {
          await this.stopTransactionOnConnector(connectorId, reason);
        }
      }
    }
  }

  // 0 for disabling
  private getConnectionTimeout(): number {
    if (
      ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        StandardParametersKey.ConnectionTimeOut
      )
    ) {
      return (
        parseInt(
          ChargingStationConfigurationUtils.getConfigurationKey(
            this,
            StandardParametersKey.ConnectionTimeOut
          ).value
        ) ?? Constants.DEFAULT_CONNECTION_TIMEOUT
      );
    }
    return Constants.DEFAULT_CONNECTION_TIMEOUT;
  }

  // -1 for unlimited, 0 for disabling
  private getAutoReconnectMaxRetries(): number | undefined {
    return (
      this.stationInfo.autoReconnectMaxRetries ?? Configuration.getAutoReconnectMaxRetries() ?? -1
    );
  }

  // 0 for disabling
  private getRegistrationMaxRetries(): number | undefined {
    return this.stationInfo.registrationMaxRetries ?? -1;
  }

  private getPowerDivider(): number {
    let powerDivider = this.hasEvses ? this.getNumberOfEvses() : this.getNumberOfConnectors();
    if (this.stationInfo?.powerSharedByConnectors) {
      powerDivider = this.getNumberOfRunningTransactions();
    }
    return powerDivider;
  }

  private getMaximumAmperage(stationInfo: ChargingStationInfo): number | undefined {
    const maximumPower = this.getMaximumPower(stationInfo);
    switch (this.getCurrentOutType(stationInfo)) {
      case CurrentType.AC:
        return ACElectricUtils.amperagePerPhaseFromPower(
          this.getNumberOfPhases(stationInfo),
          maximumPower / (this.hasEvses ? this.getNumberOfEvses() : this.getNumberOfConnectors()),
          this.getVoltageOut(stationInfo)
        );
      case CurrentType.DC:
        return DCElectricUtils.amperage(maximumPower, this.getVoltageOut(stationInfo));
    }
  }

  private getAmperageLimitation(): number | undefined {
    if (
      Utils.isNotEmptyString(this.stationInfo?.amperageLimitationOcppKey) &&
      ChargingStationConfigurationUtils.getConfigurationKey(
        this,
        this.stationInfo.amperageLimitationOcppKey
      )
    ) {
      return (
        Utils.convertToInt(
          ChargingStationConfigurationUtils.getConfigurationKey(
            this,
            this.stationInfo.amperageLimitationOcppKey
          )?.value
        ) / ChargingStationUtils.getAmperageLimitationUnitDivider(this.stationInfo)
      );
    }
  }

  private async startMessageSequence(): Promise<void> {
    if (this.stationInfo?.autoRegister === true) {
      await this.ocppRequestService.requestHandler<
        BootNotificationRequest,
        BootNotificationResponse
      >(this, RequestCommand.BOOT_NOTIFICATION, this.bootNotificationRequest, {
        skipBufferingOnError: true,
      });
    }
    // Start WebSocket ping
    this.startWebSocketPing();
    // Start heartbeat
    this.startHeartbeat();
    // Initialize connectors status
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            const connectorBootStatus = ChargingStationUtils.getBootConnectorStatus(
              this,
              connectorId,
              connectorStatus
            );
            await OCPPServiceUtils.sendAndSetConnectorStatus(
              this,
              connectorId,
              connectorBootStatus,
              evseId,
              null,
              connectorStatus.bootErrorCode
            );
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0) {
          const connectorBootStatus = ChargingStationUtils.getBootConnectorStatus(
            this,
            connectorId,
            this.getConnectorStatus(connectorId)
          );
          const { bootErrorCode } = this.connectors.get(connectorId);
          await OCPPServiceUtils.sendAndSetConnectorStatus(
            this,
            connectorId,
            connectorBootStatus,
            null,
            null,
            bootErrorCode
          );
        }
      }
    }
    if (this.stationInfo?.firmwareStatus === FirmwareStatus.Installing) {
      await this.ocppRequestService.requestHandler<
        FirmwareStatusNotificationRequest,
        FirmwareStatusNotificationResponse
      >(this, RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: FirmwareStatus.Installed,
      });
      this.stationInfo.firmwareStatus = FirmwareStatus.Installed;
    }

    // Start the ATG
    if (this.getAutomaticTransactionGeneratorConfiguration()?.enable === true) {
      this.startAutomaticTransactionGenerator();
    }
    this.wsConnectionRestarted === true && this.flushMessageBuffer();
  }

  private async stopMessageSequence(
    reason: StopTransactionReason = StopTransactionReason.NONE
  ): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop ongoing transactions
    if (this.automaticTransactionGenerator?.started === true) {
      this.stopAutomaticTransactionGenerator();
    } else {
      await this.stopRunningTransactions(reason);
    }
    if (this.hasEvses) {
      for (const [evseId, evseStatus] of this.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            await this.ocppRequestService.requestHandler<
              StatusNotificationRequest,
              StatusNotificationResponse
            >(
              this,
              RequestCommand.STATUS_NOTIFICATION,
              OCPPServiceUtils.buildStatusNotificationRequest(
                this,
                connectorId,
                ConnectorStatusEnum.Unavailable,
                evseId
              )
            );
            delete connectorStatus?.status;
          }
        }
      }
    } else {
      for (const connectorId of this.connectors.keys()) {
        if (connectorId > 0) {
          await this.ocppRequestService.requestHandler<
            StatusNotificationRequest,
            StatusNotificationResponse
          >(
            this,
            RequestCommand.STATUS_NOTIFICATION,
            OCPPServiceUtils.buildStatusNotificationRequest(
              this,
              connectorId,
              ConnectorStatusEnum.Unavailable
            )
          );
          delete this.getConnectorStatus(connectorId)?.status;
        }
      }
    }
  }

  private startWebSocketPing(): void {
    const webSocketPingInterval: number = ChargingStationConfigurationUtils.getConfigurationKey(
      this,
      StandardParametersKey.WebSocketPingInterval
    )
      ? Utils.convertToInt(
        ChargingStationConfigurationUtils.getConfigurationKey(
          this,
          StandardParametersKey.WebSocketPingInterval
        )?.value
      )
      : 0;
    if (webSocketPingInterval > 0 && !this.webSocketPingSetInterval) {
      this.webSocketPingSetInterval = setInterval(() => {
        if (this.isWebSocketConnectionOpened() === true) {
          this.wsConnection?.ping();
        }
      }, webSocketPingInterval * 1000);
      logger.info(
        `${this.logPrefix()} WebSocket ping started every ${Utils.formatDurationSeconds(
          webSocketPingInterval
        )}`
      );
    } else if (this.webSocketPingSetInterval) {
      logger.info(
        `${this.logPrefix()} WebSocket ping already started every ${Utils.formatDurationSeconds(
          webSocketPingInterval
        )}`
      );
    } else {
      logger.error(
        `${this.logPrefix()} WebSocket ping interval set to ${webSocketPingInterval}, not starting the WebSocket ping`
      );
    }
  }

  private stopWebSocketPing(): void {
    if (this.webSocketPingSetInterval) {
      clearInterval(this.webSocketPingSetInterval);
      delete this.webSocketPingSetInterval;
    }
  }

  private getConfiguredSupervisionUrl(): URL {
    let configuredSupervisionUrl: string;
    const supervisionUrls = this.stationInfo?.supervisionUrls ?? Configuration.getSupervisionUrls();
    if (Utils.isNotEmptyArray(supervisionUrls)) {
      let configuredSupervisionUrlIndex: number;
      switch (Configuration.getSupervisionUrlDistribution()) {
        case SupervisionUrlDistribution.RANDOM:
          configuredSupervisionUrlIndex = Math.floor(Utils.secureRandom() * supervisionUrls.length);
          break;
        case SupervisionUrlDistribution.ROUND_ROBIN:
        case SupervisionUrlDistribution.CHARGING_STATION_AFFINITY:
        default:
          Object.values(SupervisionUrlDistribution).includes(
            Configuration.getSupervisionUrlDistribution()
          ) === false &&
            logger.error(
              `${this.logPrefix()} Unknown supervision url distribution '${Configuration.getSupervisionUrlDistribution()}' from values '${SupervisionUrlDistribution.toString()}', defaulting to ${SupervisionUrlDistribution.CHARGING_STATION_AFFINITY
              }`
            );
          configuredSupervisionUrlIndex = (this.index - 1) % supervisionUrls.length;
          break;
      }
      configuredSupervisionUrl = supervisionUrls[configuredSupervisionUrlIndex];
    } else {
      configuredSupervisionUrl = supervisionUrls as string;
    }
    if (Utils.isNotEmptyString(configuredSupervisionUrl)) {
      return new URL(configuredSupervisionUrl);
    }
    const errorMsg = 'No supervision url(s) configured';
    logger.error(`${this.logPrefix()} ${errorMsg}`);
    throw new BaseError(`${errorMsg}`);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatSetInterval) {
      clearInterval(this.heartbeatSetInterval);
      delete this.heartbeatSetInterval;
    }
  }

  private terminateWSConnection(): void {
    if (this.isWebSocketConnectionOpened() === true) {
      this.wsConnection?.terminate();
      this.wsConnection = null;
    }
  }

  private getReconnectExponentialDelay(): boolean {
    return this.stationInfo?.reconnectExponentialDelay ?? false;
  }

  private async reconnect(): Promise<void> {
    // Stop WebSocket ping
    this.stopWebSocketPing();
    // Stop heartbeat
    this.stopHeartbeat();
    // Stop the ATG if needed
    if (this.getAutomaticTransactionGeneratorConfiguration().stopOnConnectionFailure === true) {
      this.stopAutomaticTransactionGenerator();
    }
    if (
      this.autoReconnectRetryCount < this.getAutoReconnectMaxRetries() ||
      this.getAutoReconnectMaxRetries() === -1
    ) {
      ++this.autoReconnectRetryCount;
      const reconnectDelay = this.getReconnectExponentialDelay()
        ? Utils.exponentialDelay(this.autoReconnectRetryCount)
        : this.getConnectionTimeout() * 1000;
      const reconnectDelayWithdraw = 1000;
      const reconnectTimeout =
        reconnectDelay && reconnectDelay - reconnectDelayWithdraw > 0
          ? reconnectDelay - reconnectDelayWithdraw
          : 0;
      logger.error(
        `${this.logPrefix()} WebSocket connection retry in ${Utils.roundTo(
          reconnectDelay,
          2
        )}ms, timeout ${reconnectTimeout}ms`
      );
      await Utils.sleep(reconnectDelay);
      logger.error(
        `${this.logPrefix()} WebSocket connection retry #${this.autoReconnectRetryCount.toString()}`
      );
      this.openWSConnection(
        {
          ...(this.stationInfo?.wsOptions ?? {}),
          handshakeTimeout: reconnectTimeout,
        },
        { closeOpened: true }
      );
      this.wsConnectionRestarted = true;
    } else if (this.getAutoReconnectMaxRetries() !== -1) {
      logger.error(
        `${this.logPrefix()} WebSocket connection retries failure: maximum retries reached (${this.autoReconnectRetryCount
        }) or retries disabled (${this.getAutoReconnectMaxRetries()})`
      );
    }
  }
}
