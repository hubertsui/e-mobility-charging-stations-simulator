import BaseError from '../exception/BaseError';
import type OCPPError from '../exception/OCPPError';
import { RequestCommand, type StatusNotificationRequest } from '../types/ocpp/Requests';
import type { StatusNotificationResponse } from '../types/ocpp/Responses';
import {
  AuthorizationStatus,
  StartTransactionRequest,
  StartTransactionResponse,
  StopTransactionRequest,
  StopTransactionResponse,
} from '../types/ocpp/Transaction';
import {
  BroadcastChannelProcedureName,
  BroadcastChannelRequest,
  BroadcastChannelRequestPayload,
  BroadcastChannelResponsePayload,
  MessageEvent,
} from '../types/WorkerBroadcastChannel';
import { ResponseStatus } from '../ui/web/src/types/UIProtocol';
import logger from '../utils/Logger';
import Utils from '../utils/Utils';
import type ChargingStation from './ChargingStation';
import WorkerBroadcastChannel from './WorkerBroadcastChannel';

const moduleName = 'ChargingStationWorkerBroadcastChannel';

type CommandResponse =
  | StartTransactionResponse
  | StopTransactionResponse
  | StatusNotificationResponse;

export default class ChargingStationWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private readonly chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    super();
    this.chargingStation = chargingStation;
    this.onmessage = this.requestHandler.bind(this) as (message: MessageEvent) => void;
    this.onmessageerror = this.messageErrorHandler.bind(this) as (message: MessageEvent) => void;
  }

  private async requestHandler(messageEvent: MessageEvent): Promise<void> {
    if (this.isResponse(messageEvent.data) === true) {
      return;
    }
    const [uuid, command, requestPayload] = this.validateMessageEvent(messageEvent)
      .data as BroadcastChannelRequest;

    if (requestPayload?.hashIds !== undefined || requestPayload?.hashId !== undefined) {
      if (
        requestPayload?.hashId === undefined &&
        requestPayload?.hashIds?.includes(this.chargingStation.stationInfo.hashId) === false
      ) {
        return;
      }
      if (
        requestPayload?.hashIds === undefined &&
        requestPayload?.hashId !== this.chargingStation.stationInfo.hashId
      ) {
        return;
      }
      if (requestPayload?.hashId !== undefined) {
        logger.warn(
          `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: 'hashId' field usage in PDU is deprecated, use 'hashIds' instead`
        );
      }
    }

    let responsePayload: BroadcastChannelResponsePayload;
    let commandResponse: CommandResponse;
    try {
      commandResponse = await this.commandHandler(command, requestPayload);
      if (commandResponse === undefined) {
        responsePayload = {
          hashId: this.chargingStation.stationInfo.hashId,
          status: ResponseStatus.SUCCESS,
        };
      } else {
        responsePayload = {
          hashId: this.chargingStation.stationInfo.hashId,
          status: this.commandResponseToResponseStatus(commandResponse),
        };
      }
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: Handle request error:`,
        error
      );
      responsePayload = {
        hashId: this.chargingStation.stationInfo.hashId,
        status: ResponseStatus.FAILURE,
        command,
        requestPayload,
        commandResponse,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
        errorDetails: (error as OCPPError).details,
      };
    }
    this.sendResponse([uuid, responsePayload]);
  }

  private messageErrorHandler(messageEvent: MessageEvent): void {
    logger.error(
      `${this.chargingStation.logPrefix()} ${moduleName}.messageErrorHandler: Error at handling message:`,
      { messageEvent }
    );
  }

  private async commandHandler(
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload
  ): Promise<CommandResponse | undefined> {
    switch (command) {
      case BroadcastChannelProcedureName.START_CHARGING_STATION:
        this.chargingStation.start();
        break;
      case BroadcastChannelProcedureName.STOP_CHARGING_STATION:
        await this.chargingStation.stop();
        break;
      case BroadcastChannelProcedureName.OPEN_CONNECTION:
        this.chargingStation.openWSConnection();
        break;
      case BroadcastChannelProcedureName.CLOSE_CONNECTION:
        this.chargingStation.closeWSConnection();
        break;
      case BroadcastChannelProcedureName.START_TRANSACTION:
        return this.chargingStation.ocppRequestService.requestHandler<
          StartTransactionRequest,
          StartTransactionResponse
        >(this.chargingStation, RequestCommand.START_TRANSACTION, {
          connectorId: requestPayload.connectorId,
          idTag: requestPayload.idTag,
        });
      case BroadcastChannelProcedureName.STOP_TRANSACTION:
        return this.chargingStation.ocppRequestService.requestHandler<
          StopTransactionRequest,
          StopTransactionResponse
        >(this.chargingStation, RequestCommand.STOP_TRANSACTION, {
          transactionId: requestPayload.transactionId,
          meterStop: this.chargingStation.getEnergyActiveImportRegisterByTransactionId(
            requestPayload.transactionId,
            true
          ),
          idTag: this.chargingStation.getTransactionIdTag(requestPayload.transactionId),
          ...(requestPayload.reason && { reason: requestPayload.reason }),
        });
      case BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR:
        this.chargingStation.startAutomaticTransactionGenerator(requestPayload.connectorIds);
        break;
      case BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR:
        this.chargingStation.stopAutomaticTransactionGenerator(requestPayload.connectorIds);
        break;
      case BroadcastChannelProcedureName.STATUS_NOTIFICATION:
        return this.chargingStation.ocppRequestService.requestHandler<
          StatusNotificationRequest,
          StatusNotificationResponse
        >(this.chargingStation, RequestCommand.STATUS_NOTIFICATION, {
          connectorId: requestPayload.connectorId,
          errorCode: requestPayload.errorCode,
          status: requestPayload.status,
          ...(requestPayload.info && { info: requestPayload.info }),
          ...(requestPayload.timestamp && { timestamp: requestPayload.timestamp }),
          ...(requestPayload.vendorId && { vendorId: requestPayload.vendorId }),
          ...(requestPayload.vendorErrorCode && {
            vendorErrorCode: requestPayload.vendorErrorCode,
          }),
        });
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new BaseError(`Unknown worker broadcast channel command: ${command}`);
    }
  }

  private commandResponseToResponseStatus(commandResponse: CommandResponse): ResponseStatus {
    if (
      Utils.isEmptyObject(commandResponse) ||
      commandResponse?.idTagInfo?.status === AuthorizationStatus.ACCEPTED
    ) {
      return ResponseStatus.SUCCESS;
    }
    return ResponseStatus.FAILURE;
  }
}
